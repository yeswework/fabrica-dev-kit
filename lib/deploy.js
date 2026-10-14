'use strict';

const fs = require('fs'),
	os = require('os'),
	path = require('path'),
	sh = require('shelljs'),
	// `shelljs.exec` doesn't handle color and animations (https://github.com/shelljs/shelljs/issues/86 & https://github.com/shelljs/shelljs/issues/426)
	{ spawnSync } = require('child_process');

const { confirm, echo, warn } = require('./util'),
	{ getProjectConfig, resolveSecret } = require('./config');

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

// The `lftp` script that connects to a section's server, plus the URL it opens and the password,
// for `lftp` below: a fresh array per call, since each caller appends its own commands. The
// password stays out of the script, which lftp takes as an argument any user on the machine can
// read in `ps`: `open --env-password` reads it from the environment instead
const remoteCommands = ftp => {
	const password = resolveSecret(ftp.password),
		url = `${ftp.scheme || 'ftp'}://${encodeURIComponent(ftp.user)}@${ftp.host}${ftp.port ? `:${ftp.port}` : ''}`;
	return { url, password, commands: [...LFTP_DEFAULTS, ...(ftp.commands || []), `open ${password ? '--env-password ' : ''}${url}`] };
};

// `secret` masked, raw or URL-encoded as a server may quote it back
const scrub = (text, secret) => secret
	? [secret, encodeURIComponent(secret)].reduce((masked, form) => masked.split(form).join('***'), text)
	: text;

// Every `lftp` run: its exit status and its stderr, masked and in English so `MISSING_REMOTE` can
// read it, and its stdout when `stdout` is 'pipe'. `password` is the one `remoteCommands` handed
// back, for `open --env-password`
const lftp = (commands, password, stdout = 'ignore') => {
	const result = spawnSync('lftp', ['-c', commands.join('; ') + '; '], {
		stdio: ['inherit', stdout, 'pipe'],
		env: { ...process.env, LC_ALL: 'C', ...(password ? { LFTP_PASSWORD: password } : {}) },
	});
	return { status: result.status, stdout: (result.stdout || '').toString(), stderr: scrub((result.stderr || '').toString(), password) };
};

// A resource's `.distignore` as `lftp mirror` filter options
const ignoreParams = resource => {
	const distignorePath = path.join(resource, '.distignore');
	if (!sh.test('-f', distignorePath)) { return ''; }
	return sh.cat(distignorePath).split('\n').map(item => {
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
};

// The options among a section's extra `mirror` parameters that choose which files deploy uploads.
// The rest (`--delete`, `--dry-run`, `--ignore-time`) are about how it uploads, and `--dry-run`
// would leave a copy empty
const FILTER_OPTION = /^(-[xXiI]|--(exclude|include)(-glob|-rx-from|-glob-from)?(=|$))/;
const filterParams = (params = []) => {
	const tokens = params.join(' ').match(/"[^"]*"|'[^']*'|\S+/g) || [],
		filters = [];
	for (let i = 0; i < tokens.length; i++) {
		if (!FILTER_OPTION.test(tokens[i])) { continue; }
		// `--exclude-glob x`, or with the value attached: `--exclude-glob=x`, `-Xx`
		filters.push(/^(-.|--[\w-]+)$/.test(tokens[i]) ? `${tokens[i]} ${tokens[++i] ?? ''}`.trim() : tokens[i]);
	}
	return filters.join(' ');
};

const newestMtime = dir => Math.max(0, ...sh.find(dir).filter(file => sh.test('-f', file)).map(file => fs.statSync(file).mtimeMs));

// Source edited since the build output last changed. Only a hint: webpack doesn't rewrite output
// whose contents are unchanged, so a fresh build of a comment-only edit still reads as stale
const buildIsStale = resource => {
	const src = path.join(resource, 'src'),
		build = path.join(resource, 'build');
	return sh.test('-d', src) && sh.test('-d', build) && newestMtime(src) > newestMtime(build);
};

// What a resource's own files say against shipping it as it stands. A missing `vendor/` or
// `build/` isn't merely absent from the upload: a `--delete` mirror removes the server's copy. And
// webpack answers an import it can't resolve with a `webpackMissingModule` stub that throws at
// runtime while the build still exits 0, so a bundle is read rather than trusted
const payloadProblems = resource => {
	const problems = [],
		has = file => sh.test('-e', path.join(resource, file)),
		build = path.join(resource, 'build');
	if (has('composer.json') && !has('vendor')) {
		problems.push(`it has a 'composer.json' and no 'vendor/': run 'composer install' first`);
	}
	if (has('package.json') && JSON.parse(sh.cat(path.join(resource, 'package.json')).toString()).scripts?.build && !has('build')) {
		problems.push(`it has a build script and no 'build/': run 'fdk build' first`);
	}
	const bundles = has('build') ? sh.find(build).filter(file => file.endsWith('.js')) : [],
		broken = bundles.length ? sh.grep('-l', 'webpackMissingModule', bundles).stdout.split('\n').filter(Boolean) : [];
	if (broken.length) {
		problems.push(`webpack built these around a module it couldn't find, and they throw at runtime:\n${broken.map(file => `      ${path.relative(resource, file)}`).join('\n')}`);
	}
	return problems;
};

// Uncommitted changes among the files deploy would upload, relative to the resource; null when
// git can't say, most likely because the resource isn't in a repository. `filters` are the
// resource's `mirror` filters: each changed path is laid out as an empty file and mirrored through
// them, so lftp itself decides which it would send, deletions included
const uncommittedUploads = (resource, filters) => {
	const git = args => spawnSync('git', ['-C', resource, ...args], { encoding: 'utf8' }),
		prefix = git(['rev-parse', '--show-prefix']),
		status = prefix.status === 0 && git(['status', '--porcelain', '-z', '--untracked-files=all', '--', '.']);
	if (!status || status.status !== 0) { return null; }
	// `XY path`, with a rename's or copy's original path as an entry of its own after it
	const entries = status.stdout.split('\0').filter(Boolean),
		changed = [];
	for (let i = 0; i < entries.length; i++) {
		changed.push(entries[i].slice(3).slice(prefix.stdout.trim().length));
		if (/^[RC]/.test(entries[i])) { i++; }
	}
	if (!changed.length) { return []; }

	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fdk-uncommitted-')),
		laidOut = path.join(tmp, 'changed'),
		kept = path.join(tmp, 'kept');
	changed.forEach(file => {
		fs.mkdirSync(path.dirname(path.join(laidOut, file)), { recursive: true });
		fs.writeFileSync(path.join(laidOut, file), '');
	});
	const mirrored = lftp(['set cmd:fail-exit yes', 'open file:///', `mirror --verbose=0 ${filters} ${laidOut} ${kept}`]),
		// lftp failing leaves every change in, which can only ask too much
		uploads = mirrored.status === 0
			? sh.find(kept).filter(file => sh.test('-f', file)).map(file => path.relative(kept, file))
			: changed;
	sh.rm('-rf', tmp);
	return uploads;
};

// Whether a section's extra `mirror` parameters remove what the resource no longer has
const DELETE_OPTION = /(^|\s)(--delete[\w-]*|-e)(?=\s|=|$)/;

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
const remoteFolderExists = (commands, remotePath, password) => {
	const { status, stderr } = lftp([...commands, `cls -d ${remotePath}`], password);
	if (status === 0) { return true; }
	if (MISSING_REMOTE.test(stderr)) { return false; }
	process.stderr.write(stderr);
	return null;
};

// The folders at the top of the resource on the server that the upload's `--delete` would remove,
// asked of lftp by running the same mirror with `--dry-run`; null when it couldn't say. A dry run
// that can't connect takes the target for missing, says it would create it and exits 0, so the
// session proves itself on the resource's folder first: one that isn't there is a first deploy,
// with nothing to remove
const deletedFolders = (commands, password, mirror, remotePath) => {
	const { status, stdout, stderr } = lftp(['set cmd:fail-exit yes', ...commands, `cls -d ${remotePath}`,
		mirror.replace(/^mirror /, 'mirror --dry-run ')], password, 'pipe');
	if (status !== 0) {
		if (MISSING_REMOTE.test(stderr)) { return []; }
		process.stderr.write(stderr);
		return null;
	}
	const root = `/${remotePath.replace(/^\/+/, '')}/`;
	return stdout.split('\n').filter(line => line.startsWith('rm -r ')).flatMap(line => {
		const url = decodeURIComponent(line.slice('rm -r '.length)),
			at = url.indexOf(root);
		// one that can't be placed under the resource is listed whole rather than dropped
		if (at < 0) { return [url]; }
		const folder = url.slice(at + root.length);
		return folder.includes('/') ? [] : [folder];
	});
};

// Pull the server's `acf-json` into `dest` before mirroring over it. Returns `true` if a copy
// arrived, `false` if the server holds none yet, `null` if the pull itself failed: `lftp` exits
// non-zero both for a folder that isn't there and for a transfer that broke, and only the first
// is safe to read as 'nothing on the server to lose'
const pullRemoteAcfJson = (commands, remotePath, dest, password) => {
	const { status, stderr } = lftp([...commands, `mirror --verbose=0 ${remotePath} ${dest}`], password, 'inherit');
	// a clean run creates `dest` even when the remote folder held nothing, and an empty copy
	// puts nothing at risk, so both read the same downstream
	if (status === 0) { return sh.test('-d', dest); }
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

// Whether `name` may be uploaded: its problems listed, and the deploy asked whether to go ahead
// regardless — or refused straight away under `--strict`, or wherever there's no terminal to ask
// on. `deleted` lists what `--delete` would remove on the server, asked only when params carry it
const checked = (name, configured, params, deleted, strict) => {
	// lftp and shelljs expand a leading `~` in the paths deploy hands them; git and `fs` don't
	const resource = configured.replace(/^~(?=\/|$)/, os.homedir()),
		problems = payloadProblems(resource),
		uncommitted = uncommittedUploads(resource, `${filterParams([params])} ${ignoreParams(resource)}`);
	if (uncommitted === null) {
		warn(`Couldn't ask git whether '${name}' has uncommitted changes, most likely because it isn't in a repository: deploying it as it is.`);
	} else if (uncommitted.length) {
		problems.push(`it has uncommitted changes this deploy would upload:\n${uncommitted.map(file => `      ${file}`).join('\n')}`);
	}
	if (DELETE_OPTION.test(params)) {
		const folders = deleted();
		if (folders === null) {
			problems.push(`the server couldn't say which folders '--delete' would remove (see the error above)`);
		} else if (folders.length) {
			problems.push(`'--delete' would remove these folders from the server's copy:\n${folders.map(folder => `      ${folder}`).join('\n')}`);
		}
	}
	if (buildIsStale(resource)) {
		warn(`'${name}' source was edited after its build output last changed. If 'fdk build' hasn't run since, this deploy ships a stale build.`);
	}
	if (!problems.length) { return true; }
	warn(`'${name}' isn't ready to deploy:\n${problems.map(problem => `  - ${problem}`).join('\n')}`);
	if (!strict && process.stdin.isTTY && confirm(`Deploy '${name}' anyway?`)) { return true; }
	warn(`Deploy of '${name}' stopped. Fix the above and deploy again, or re-run with '--force' to deploy regardless.`);
	return false;
};

// Upload resources built files to server
const deploy = (projectName='default', options) => {
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

				const ignore = ignoreParams(resource),
					// extra `mirror` parameters
					params = ftp?.params ? ftp.params.join(' ') : '',
					destPath = path.join(ftp.path || '', `wp-content/${resourceType}`),
					{ url, commands, password } = remoteCommands(ftp);

				// ACF saves field groups edited in wp-admin into the deployed resource's own
				// `acf-json`, so mirroring over it silently reverts them: check before uploading
				const acfPath = path.join(resource, 'acf-json');
				if (!options.force && sh.test('-d', acfPath)) {
					const remoteCopy = path.join(sh.tempdir(), `fdk-acf-${name}`);
					sh.rm('-rf', remoteCopy);
					const pulled = pullRemoteAcfJson(commands, path.join(destPath, name, 'acf-json'), remoteCopy, password);
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
					const alreadyDeployed = remoteFolderExists(commands, path.join(destPath, name), password);
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

				const mirror = `mirror --reverse --verbose=1 ${params} ${ignore} ${resource} ${path.join(destPath, name)}`;
				if (!options.force && !checked(name, resource, params, () => deletedFolders(commands, password, mirror, path.join(destPath, name)), options.strict)) {
					skipped.push(name);
					continue;
				}
				commands.push(mirror);
				const upload = lftp(commands, password, 'inherit');
				process.stderr.write(upload.stderr);
				if (upload.status !== 0) {
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

module.exports = { DELETE_OPTION, LFTP_DEFAULTS, MISSING_REMOTE, acfGroupsAtRisk, buildIsStale, deletedFolders, deploy, filterParams, ignoreParams, lftp, payloadProblems, pullRemoteAcfJson, remoteCommands, remoteFolderExists, scrub, uncommittedFiles, uncommittedUploads };
