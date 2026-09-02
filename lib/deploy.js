'use strict';

const path = require('path'),
	sh = require('shelljs'),
	// `shelljs.exec` doesn't handle color and animations (https://github.com/shelljs/shelljs/issues/86 & https://github.com/shelljs/shelljs/issues/426)
	{ spawnSync } = require('child_process');

const { echo, spawn, warn } = require('./util'),
	{ getProjectConfig } = require('./config');

// Field groups a deploy mustn't overwrite blindly, split by the reason. `newer`: the server holds
// a more recent revision, judged by ACF's own `modified` stamp, or holds a group this repo doesn't
// have at all. `unknown`: the two couldn't be compared — a group that can't be read or parsed has
// no stamp, and scoring it 0 would rank it below every real one and wave the deploy through.
// Local being newer is just an ordinary edit on its way up
const acfGroupsAtRisk = (remoteDir, localDir) => {
	// ACF's own stamp, or `null` when there isn't a usable one to compare: no such file, can't be
	// read, isn't the JSON it should be, or a `modified` that isn't a number
	const modifiedStamp = file => {
		// checked before reading, so a group that simply isn't there doesn't make `cat` complain
		if (!sh.test('-f', file)) { return null; }
		try {
			const stamp = Number(JSON.parse(sh.cat(file).toString()).modified);
			return Number.isFinite(stamp) ? stamp : null;
		} catch (ex) {
			return null;
		}
	};

	const newer = [],
		unknown = [];
	for (const file of sh.ls(remoteDir)) {
		if (!file.endsWith('.json')) { continue; }
		// the server's copy is judged first: one that can't be read can't be pulled either, so it
		// must not reach the branch that copies it into the working tree
		const remote = modifiedStamp(path.join(remoteDir, file));
		if (remote === null) { unknown.push(file); continue; }
		const localPath = path.join(localDir, file);
		if (!sh.test('-f', localPath)) { newer.push(file); continue; }
		const local = modifiedStamp(localPath);
		if (local === null) { unknown.push(file); } else if (remote > local) { newer.push(file); }
	}
	return { newer, unknown };
};

// Prepended to every `lftp` script a deploy runs. `set` is last-wins, and anything from a
// project's own `ftp.commands` comes after these, so a project that wants different numbers just
// says so.
//
// `cmd:fail-exit`: `lftp -c` reports only the *last* command's status, so a `--backup` that failed
// would be masked by the mirror that follows it and the deploy would overwrite the folder it was
// told to copy first. Fail-fast instead — the first command to fail aborts the script.
//
// The rest bound how long a deploy can sit on a host that isn't answering. lftp ships with
// `net:max-retries 1000`, a reconnect interval starting at 15s and backing off to 300s, and a
// 5-minute response timeout, so a server that is down or firewalled never fails — it retries for
// days, silently. Measured against this build, per `lftp` step: a refused connection now fails in
// ~5s and a black-holed address in ~90s, where both used to hang
const LFTP_DEFAULTS = [
	'set cmd:fail-exit yes',
	'set net:max-retries 3',
	'set net:reconnect-interval-base 2',
	'set net:timeout 30',
];

// `lftp` prefixes every couldn't-get-at-the-target error with `Access failed:` and then quotes the
// source verbatim, so match its own wrapper rather than the wording underneath: sftp says
// `No such file (<path>)`, `file://` says `<path>: No such file or directory`, and an FTP server
// says what it likes after its 550 — pure-ftpd `Can't change directory to ...: No such file or
// directory`, vsftpd merely `Failed to change directory.`. Anything that actually broke reads
// differently again (`Fatal error:`, `Login failed:`), so it doesn't match
const MISSING_REMOTE = /Access failed: (550 |.*No such file)/;

// Whether the server holds `remotePath`. Three-way for the same reason `pullRemoteAcfJson` is:
// `lftp` exits non-zero both for a folder that isn't there and for a connection that broke, and
// only the first is safe to act on
const remoteFolderExists = (commands, remotePath) => {
	const result = spawnSync('lftp', ['-c', [...commands, `cls -d ${remotePath}`].join('; ') + '; '],
			{ stdio: ['inherit', 'ignore', 'pipe'], env: { ...process.env, LC_ALL: 'C' } }),
		stderr = (result.stderr || '').toString();
	if (result.status === 0) { return true; }
	if (MISSING_REMOTE.test(stderr)) { return false; }
	process.stderr.write(stderr);
	return null;
};

// Pull the server's `acf-json` into `dest` before mirroring over it. Returns `true` if a copy
// arrived, `false` if the server holds none yet, `null` if the pull itself failed: `lftp` exits
// non-zero both for a folder that isn't there and for a transfer that broke, and only the first
// is safe to read as 'nothing on the server to lose'
const pullRemoteAcfJson = (commands, remotePath, dest) => {
	const mirror = `mirror --verbose=0 ${remotePath} ${dest}`,
		// force English so the 'folder isn't there' message can be told apart from a real failure
		result = spawnSync('lftp', ['-c', [...commands, mirror].join('; ') + '; '], { stdio: ['inherit', 'inherit', 'pipe'], env: { ...process.env, LC_ALL: 'C' } }),
		stderr = (result.stderr || '').toString();
	// a clean run creates `dest` even when the remote folder held nothing, and an empty copy
	// puts nothing at risk, so both read the same downstream
	if (result.status === 0) { return sh.test('-d', dest); }
	if (!sh.test('-d', dest) && MISSING_REMOTE.test(stderr)) { return false; }
	process.stderr.write(stderr);
	return null;
};

// Files git would lose track of if they were overwritten in place. `files` are paths
// relative to the repository root; null means there's no repository to ask
const uncommittedFiles = (repoPath, files) => {
	const git = args => sh.exec(`git -C '${repoPath}' ${args}`, { silent: true });
	if (git('rev-parse --is-inside-work-tree').code !== 0) { return null; }
	return files.filter(file => {
		// asked one file at a time, so an empty answer means clean with no paths to parse back
		const status = git(`status --porcelain -- '${file}'`);
		// if git can't answer, assume there's something to lose
		return status.code !== 0 || status.stdout.trim() !== '';
	});
};

// Upload resources built files to server
const deploy = (projectName='default', options) => {
	const buildIgnoreParams = (distignore) => {
		if (!distignore) { return ''; }
		return distignore.map(item => {
			let glob = item.replace(/#.*/, '').trim(),
				option = 'exclude';
			// invert ignore (includes)
			if (glob.startsWith('!')) {
				option = 'include';
				glob = glob.substr(1);
			}
			// lftp doesn't support exclude for folders on root only through globs: add exclude folder glob and a recursive glob to include all subfolders with folder
			if (glob.search(/^\.?\//) >= 0) {
				glob = glob.replace(/^\.?\//, '');
				glob = `${glob} --${option == 'exclude' ? 'include' : 'exclude'}-glob **/${glob}`;
			}
			return glob !== '' ? `--${option}-glob ${glob}` : '';
		}).join(' ');
	}

	try {
		const projectConfig = getProjectConfig(projectName),
			ftp = projectConfig.ftp;
		if (!projectConfig || !ftp || !ftp.host) {
			warn('Settings for FTP upload not found');
			return;
		}

		// resources whose upload was called off before it started: nothing was sent for these
		const skipped = [],
			// resources whose upload started and broke: the server may hold a partial copy
			failed = [];
		['themes', 'plugins'].forEach(resourceType => {
			const resources = projectConfig[resourceType];
			if (!resources) { return; }
			for (let resource of resources) {
				const name = resource.replace(/\/$/, '').split('/').pop();
				if (!sh.test('-d', resource)) {
					warn(`Path for resource '${name}' not found`);
					skipped.push(name);
					continue;
				}
				echo(`Deploying resource '${name}' to '${ftp.host}'...`);

				// file patterns to exclude
				const distignorePath = path.join(resource, '.distignore'),
					ignore = sh.test('-f', distignorePath) ? buildIgnoreParams(sh.cat(distignorePath).split('\n')) : '';

				// extra `mirror` parameters
				const params = ftp?.params ? ftp.params.join(' ') : '',
					destPath = path.join(ftp.path || '', `wp-content/${resourceType}`),
					url = `${ftp?.scheme || 'ftp'}://${encodeURIComponent(ftp.user)}${ftp.password ? `:${encodeURIComponent(ftp.password)}` : ''}@${ftp.host}${ftp.port ? `:${ftp.port}` : ''}`,
					commands = [...LFTP_DEFAULTS, ...ftp.commands];

				// open command
				commands.push(`open ${url}`);

				// ACF saves field groups edited in wp-admin into the deployed resource's own
				// `acf-json`, so mirroring over it silently reverts them: check before uploading
				const acfPath = path.join(resource, 'acf-json');
				if (!options.force && sh.test('-d', acfPath)) {
					const remoteCopy = path.join(sh.tempdir(), `fdk-acf-${name}`);
					sh.rm('-rf', remoteCopy);
					const pulled = pullRemoteAcfJson(commands, path.join(destPath, name, 'acf-json'), remoteCopy);
					if (pulled === null) {
						sh.rm('-rf', remoteCopy);
						skipped.push(name);
						warn(`Couldn't read the 'acf-json' folder of '${name}' from the server, so there's no telling whether it holds field groups this deploy would revert. Deploy of '${name}' stopped: fix the error above and deploy again, or re-run with '--force' to deploy regardless.`);
						continue;
					}
					// nothing on the server yet (first deploy): nothing to lose, carry on
					const listed = files => files.map(file => `  acf-json/${file}`).join('\n'),
						atRisk = pulled ? acfGroupsAtRisk(remoteCopy, acfPath) : { newer: [], unknown: [] };
					if (atRisk.unknown.length > 0) {
						// no stamp to compare, so there's no telling whether the deploy would revert
						// them — and an unreadable copy can't be pulled down for review either
						warn(`Couldn't compare these '${name}' field groups with the server's copy, so there's no telling whether this deploy would revert them:\n${listed(atRisk.unknown)}\n\nCheck them on the server by hand, or re-run with '--force' to overwrite it regardless.`);
						skipped.push(name);
						sh.rm('-rf', remoteCopy);
						continue;
					}
					if (atRisk.newer.length > 0) {
						// bring them into the working tree so they can be reviewed and committed, but
						// only where git can undo it and there's no local work to overwrite
						const uncommitted = uncommittedFiles(resource, atRisk.newer.map(file => path.join('acf-json', file)));
						if (uncommitted === null) {
							warn(`Server holds newer '${name}' field groups than this repo, most likely edited in wp-admin. Deploying would revert them:\n${listed(atRisk.newer)}\n\n'${name}' isn't a git repository, so they can't be pulled safely. Copy them across by hand, or re-run with '--force' to overwrite the server.`);
						} else if (uncommitted.length > 0) {
							warn(`Server holds newer '${name}' field groups than this repo, most likely edited in wp-admin:\n${listed(atRisk.newer)}\n\nPulling them would overwrite uncommitted local changes. Commit or stash these first, then deploy again:\n${uncommitted.map(file => `  ${file}`).join('\n')}`);
						} else {
							atRisk.newer.forEach(file => sh.cp('-f', path.join(remoteCopy, file), path.join(acfPath, file)));
							warn(`Server holds newer '${name}' field groups than this repo, most likely edited in wp-admin. Deploy of '${name}' stopped, and they have been pulled into the working tree:\n${listed(atRisk.newer)}\n\nReview and commit them, then deploy again — or 'git restore' them and re-run with '--force' to overwrite the server.`);
						}
						skipped.push(name);
						sh.rm('-rf', remoteCopy);
						continue;
					}
					sh.rm('-rf', remoteCopy);
				}

				if (options.backup) {
					// the script fails fast now, so queueing a backup of a folder that isn't there
					// yet would abort a legitimate first deploy. Ask first — and treat a question
					// that can't be answered the way the ACF preflight treats its own
					const alreadyDeployed = remoteFolderExists(commands, path.join(destPath, name));
					if (alreadyDeployed === null) {
						skipped.push(name);
						warn(`Couldn't tell whether '${name}' is already on the server, so there's no telling whether '--backup' would copy anything. Deploy of '${name}' stopped: fix the error above and deploy again.`);
						continue;
					}
					if (alreadyDeployed) {
						// copy old folder
						const backupName = `${name}_${(new Date()).toISOString()}`;
						commands.push(...[
							`echo "Copying original resource folder '${name}' to '${backupName}' in '${ftp.host}'..."`,
							'set ftp:use-fxp yes',
							`mirror ${path.join(destPath, name)} ${new URL(path.join(destPath, backupName), url).href}`,
							`echo "Original theme backed up. Uploading updated files to '${name}'..."`
						]);
					} else {
						echo(`Nothing to back up: '${name}' isn't on the server yet.`);
					}
				}

				// mirror command
				commands.push(`mirror --reverse --verbose=1 ${params} ${ignore} ${resource} ${path.join(destPath, name)}`);
				if (spawn(['lftp', '-c', commands.join('; ') + '; ']).status !== 0) {
					failed.push(name);
				}
			}
		});

		// non-zero exit either way, so a scripted deploy can't read an incomplete run as a clean
		// one — but the two are worth telling apart: nothing reached the server for a resource
		// that was called off, whereas one that broke mid-upload may be half-written
		if (skipped.length > 0) {
			process.exitCode = 1;
			warn(`Deploy incomplete — not uploaded: ${skipped.join(', ')}`);
		}
		if (failed.length > 0) {
			process.exitCode = 1;
			warn(`Deploy failed while uploading: ${failed.join(', ')}. The server may hold a partial copy — check it before deploying again.`);
		}
	} catch (ex) {
		process.exitCode = 1;
		warn('Error deploying: ' + ex);
	}
}

module.exports = { LFTP_DEFAULTS, acfGroupsAtRisk, deploy, pullRemoteAcfJson, remoteFolderExists, uncommittedFiles };
