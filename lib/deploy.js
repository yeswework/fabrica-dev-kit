'use strict';

const path = require('path'),
	sh = require('shelljs'),
	// `shelljs.exec` doesn't handle color and animations (https://github.com/shelljs/shelljs/issues/86 & https://github.com/shelljs/shelljs/issues/426)
	{ spawnSync } = require('child_process');

const { echo, spawn, warn } = require('./util'),
	{ getProjectConfig } = require('./config');

// Field groups the server holds a newer revision of, judged by ACF's own `modified` stamp.
// Local being newer, or present only locally, is just an ordinary edit on its way up
const acfGroupsAheadOnRemote = (remoteDir, localDir) => {
	const modifiedStamp = file => {
		if (!sh.test('-f', file)) { return null; }
		try {
			return JSON.parse(sh.cat(file).toString()).modified || 0;
		} catch (ex) {
			return 0;
		}
	};
	return sh.ls(remoteDir).filter(file => {
		if (!file.endsWith('.json')) { return false; }
		const local = modifiedStamp(path.join(localDir, file));
		return local === null || modifiedStamp(path.join(remoteDir, file)) > local;
	});
};

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
	// yields no groups ahead, so both read the same downstream
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
					// `lftp -c` reports only the *last* command's status, so a `--backup` that
					// failed would be masked by the mirror that follows it and the deploy would
					// overwrite the folder it was told to copy first. Fail-fast instead: the first
					// command to fail aborts the script and sets the exit status
					commands = ['set cmd:fail-exit yes', ...ftp.commands];

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
					const ahead = pulled ? acfGroupsAheadOnRemote(remoteCopy, acfPath) : [];
					if (ahead.length > 0) {
						const listed = ahead.map(file => `  acf-json/${file}`).join('\n');
						// bring them into the working tree so they can be reviewed and committed, but
						// only where git can undo it and there's no local work to overwrite
						const uncommitted = uncommittedFiles(resource, ahead.map(file => path.join('acf-json', file)));
						if (uncommitted === null) {
							warn(`Server holds newer '${name}' field groups than this repo, most likely edited in wp-admin. Deploying would revert them:\n${listed}\n\n'${name}' isn't a git repository, so they can't be pulled safely. Copy them across by hand, or re-run with '--force' to overwrite the server.`);
						} else if (uncommitted.length > 0) {
							warn(`Server holds newer '${name}' field groups than this repo, most likely edited in wp-admin:\n${listed}\n\nPulling them would overwrite uncommitted local changes. Commit or stash these first, then deploy again:\n${uncommitted.map(file => `  ${file}`).join('\n')}`);
						} else {
							ahead.forEach(file => sh.cp('-f', path.join(remoteCopy, file), path.join(acfPath, file)));
							warn(`Server holds newer '${name}' field groups than this repo, most likely edited in wp-admin. Deploy of '${name}' stopped, and they have been pulled into the working tree:\n${listed}\n\nReview and commit them, then deploy again — or 'git restore' them and re-run with '--force' to overwrite the server.`);
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

module.exports = { acfGroupsAheadOnRemote, deploy, pullRemoteAcfJson, remoteFolderExists, uncommittedFiles };
