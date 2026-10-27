'use strict';

const fs = require('fs'),
	os = require('os'),
	path = require('path'),
	sh = require('shelljs'),
	// `shelljs.exec` doesn't handle color and animations (https://github.com/shelljs/shelljs/issues/86 & https://github.com/shelljs/shelljs/issues/426)
	{ spawnSync } = require('child_process'),
	{ isatty } = require('tty'),
	{ InvalidArgumentError } = require('commander');

const { confirm, echo, expandHome, warn } = require('./util'),
	{ getProjectConfig, projectResources, resolveSecret } = require('./config'),
	{ fromHome, quote, sshCommand } = require('./ssh');

// The checks a deploy runs on each resource, by the names `--skip` takes
const CHECKS = ['acf', 'vendor', 'build', 'webpack', 'uncommitted', 'delete'];

// `--skip`'s parser: its names added to those of any `--skip` before it. An unknown one is an
// error, since a misspelt check would otherwise run regardless
const skipOption = (value, previous = []) => {
	const names = value.split(',').map(name => name.trim()).filter(Boolean),
		unknown = names.filter(name => !CHECKS.includes(name));
	if (unknown.length) {
		throw new InvalidArgumentError(`No check named ${unknown.map(name => `'${name}'`).join(', ')}: the checks are ${CHECKS.join(', ')}.`);
	}
	return [...previous, ...names];
};

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
// `cmd:fail-exit`: `lftp -c` reports only the *last* command's status, so a step that failed would
// be masked by the ones after it — a backup's download by the upload of whatever arrived. Fail-fast
// instead — the first command to fail aborts the script.
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

// Every `lftp` run: its exit status and its stderr, masked and in English so `remoteMissing` can
// read it, and its stdout when `stdout` is 'pipe'. `password` is the one `remoteCommands` handed
// back, for `open --env-password`
const lftp = (commands, password, stdout = 'ignore') => {
	const result = spawnSync('lftp', ['-c', commands.join('; ') + '; '], {
		stdio: ['inherit', stdout, 'pipe'],
		// a `--delete` dry run lists every file it would send, far past spawnSync's 1MB default
		maxBuffer: 1024 ** 3,
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

const git = (repo, args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });

// The paths git reports changed under `resource` since its last commit, relative to it, a rename
// or copy by its new path, and deletions only with `deletions`; null when git can't say, most
// likely because the resource isn't in a repository. One its repository ignores is null too: git
// reports nothing changed there and can restore none of it
const changedFiles = (resource, deletions = true) => {
	const prefix = git(resource, ['rev-parse', '--show-prefix']),
		ignored = prefix.status === 0 && git(resource, ['check-ignore', '-q', '.']).status === 0,
		status = prefix.status === 0 && !ignored && git(resource, ['status', '--porcelain', '-z', '--untracked-files=all', '--', '.']);
	if (!status || status.status !== 0) { return null; }
	// `XY path`, with a rename's or copy's original path as an entry of its own after it
	const entries = status.stdout.split('\0').filter(Boolean),
		changed = [];
	for (let i = 0; i < entries.length; i++) {
		if (deletions || !entries[i].slice(0, 2).includes('D')) {
			changed.push(entries[i].slice(3).slice(prefix.stdout.trim().length));
		}
		if (/^[RC]/.test(entries[i])) { i++; }
	}
	return changed;
};

// Which of `files`, relative to a resource, its `mirror` filters let through: each is laid out as
// an empty file and mirrored locally through them, so lftp itself decides. A path that is also
// another's folder (a file replaced by a folder, or the reverse) can only be laid out as the folder
const uploadedOf = (files, filters) => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fdk-uncommitted-')),
		laidOut = path.join(tmp, 'changed'),
		kept = path.join(tmp, 'kept'),
		folders = new Set(files.flatMap(file => file.split('/').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('/'))));
	try {
		files.filter(file => !folders.has(file)).forEach(file => {
			// git names an untracked repository inside the resource by its folder, with a trailing
			// slash: it is laid out as that folder, which lftp copies when the filters let it through
			if (file.endsWith('/')) { return fs.mkdirSync(path.join(laidOut, file), { recursive: true }); }
			fs.mkdirSync(path.dirname(path.join(laidOut, file)), { recursive: true });
			fs.writeFileSync(path.join(laidOut, file), '');
		});
		const mirrored = lftp(['set cmd:fail-exit yes', 'open file:///', `mirror --verbose=0 ${filters} ${laidOut} ${kept}`]);
		// lftp failing leaves every path in, which can only ask too much
		return mirrored.status === 0
			? [...sh.find(kept).filter(file => sh.test('-f', file)).map(file => path.relative(kept, file)),
				...files.filter(file => file.endsWith('/') && sh.test('-d', path.join(kept, file)))]
			: files;
	} finally {
		sh.rm('-rf', tmp);
	}
};

// What a resource's own files say against shipping it as it stands, as `[check, problem]` pairs,
// leaving out the checks in `skip`. A missing `vendor/` or `build/` isn't merely absent from the
// upload: a `--delete` mirror removes the server's copy — unless `filters`, the resource's `mirror`
// filters, leave the folder out anyway. And webpack answers an import it can't resolve with a
// `webpackMissingModule` stub that throws at runtime while the build still exits 0, so a bundle is
// read rather than trusted
const payloadProblems = (resource, filters, skip = []) => {
	const problems = [],
		has = file => sh.test('-e', path.join(resource, file)),
		build = path.join(resource, 'build');
	let scripts = {};
	if (!skip.includes('build') && has('package.json')) {
		try {
			scripts = JSON.parse(sh.cat(path.join(resource, 'package.json')).toString())?.scripts || {};
		} catch (ex) {
			problems.push(['build', `its 'package.json' isn't valid JSON, so there's no telling whether it needs a build: ${ex.message}`]);
		}
	}
	// each as its check, what has to be there, a file of the folder for lftp's filters to judge, and
	// the problem
	const missing = [
		!skip.includes('vendor') && has('composer.json') && ['vendor', 'vendor/autoload.php', 'vendor/autoload.php', `it has a 'composer.json' and no 'vendor/autoload.php': run 'composer install' first`],
		scripts.build && ['build', 'build', 'build/index.js', `it has a build script and no 'build/': run 'fdk build' first`],
	].filter(entry => entry && !has(entry[1]));
	const uploaded = missing.length ? uploadedOf(missing.map(([, , probe]) => probe), filters) : [];
	missing.filter(([, , probe]) => uploaded.includes(probe)).forEach(([check, , , problem]) => problems.push([check, problem]));

	const bundles = !skip.includes('webpack') && has('build') ? sh.find(build).filter(file => file.endsWith('.js')) : [],
		found = bundles.length ? sh.grep('-l', 'webpackMissingModule', bundles).stdout.split('\n').filter(Boolean).map(file => path.relative(resource, file)) : [],
		// as for vendor and build: a bundle the filters leave out never reaches the server
		broken = found.length ? uploadedOf(found, filters) : [];
	if (broken.length) {
		problems.push(['webpack', `webpack built these around a module it couldn't find, and they throw at runtime:\n${broken.map(file => `      ${file}`).join('\n')}`]);
	}
	return problems;
};

// Uncommitted changes among the files deploy would upload, relative to the resource; null when git
// can't say. A deletion counts only with `deletions`, when the upload's `--delete` carries it to
// the server
const uncommittedUploads = (resource, filters, deletions) => {
	const changed = changedFiles(resource, deletions);
	return changed?.length ? uploadedOf(changed, filters) : changed;
};

// Whether a section's extra `mirror` parameters remove what the resource no longer has
// lftp takes short options together, as getopt does, so `-ev` deletes as `-e` does — until an
// option that takes a value, which is the rest of the cluster: `-Xvendor` excludes `vendor`
const DELETE_OPTION = /(^|\s)(--delete[\w-]*(?=\s|=|$)|-(?:(?![NPixIXfFO])[a-zA-Z])*e)/;

// `lftp` prefixes every couldn't-get-at-the-target error with `Access failed:` and then quotes the
// source verbatim. Where that says the path isn't there, it isn't: sftp `No such file (<path>)`,
// `file://` `<path>: No such file or directory`, pure-ftpd and pyftpdlib the same errno after
// their 550. Anything that actually broke reads differently (`Fatal error:`, `Login failed:`)
const MISSING_REMOTE = /Access failed: .*No such file/;
// Any other 550 is missing *or* refused: vsftpd answers both `550 Failed to change directory.`
const MISSING_OR_REFUSED = /Access failed: 550 /;

// Whether a remote read that failed with `stderr` shows `remotePath` isn't on the server. A bare
// 550 counts only once the folder above lists other entries and not this one, and that folder
// failing the same way is settled one level up. An empty listing proves nothing: vsftpd sends a
// folder it can't read as an empty one. WordPress keeps an `index.php` in `wp-content/themes` and
// `plugins`, so a first deploy to a real site always finds the folder above holding something
const remoteMissing = (commands, remotePath, stderr, password) => {
	if (MISSING_REMOTE.test(stderr)) { return true; }
	const parent = path.dirname(remotePath);
	if (!MISSING_OR_REFUSED.test(stderr) || parent === remotePath) { return false; }
	const listed = lftp([...commands, `cls -1 ${parent}/`], password, 'pipe');
	if (listed.status !== 0) { return remoteMissing(commands, parent, listed.stderr, password); }
	const names = listed.stdout.split('\n').filter(Boolean).map(line => path.basename(line));
	return names.length > 0 && !names.includes(path.basename(remotePath));
};

// The stderr of a remote read that couldn't be settled either way, as the caller's 'the error
// above' points at
const unsettled = stderr => MISSING_OR_REFUSED.test(stderr)
	? `${stderr.trimEnd()}\nA 550 can mean the folder isn't there or that it can't be read, and listing the folder above it didn't show it missing, so it is taken as unreadable.\n`
	: stderr;

// Whether the server holds `remotePath`. Three-way for the same reason `pullRemoteAcfJson` is:
// `lftp` exits non-zero both for a folder that isn't there and for one it can't get at, and only
// the first is safe to act on
const remoteFolderExists = (commands, remotePath, password) => {
	const { status, stderr } = lftp([...commands, `cls -d ${remotePath}`], password);
	if (status === 0) { return true; }
	if (remoteMissing(commands, remotePath, stderr, password)) { return false; }
	process.stderr.write(unsettled(stderr));
	return null;
};

// The folders at the top of the resource on the server that the upload's `--delete` would remove,
// asked of lftp by running the same mirror with `--dry-run`; null when it couldn't say. One that
// isn't on the server yet is a first deploy, with nothing to remove. A dry run that can't connect
// takes the target for missing, says it would create it and exits 0, so its session proves itself
// on the resource's folder first — after which any failure means it couldn't say
const deletedFolders = (commands, password, mirror, remotePath) => {
	const exists = remoteFolderExists(commands, remotePath, password);
	if (!exists) { return exists === false ? [] : null; }
	const { status, stdout, stderr } = lftp(['set cmd:fail-exit yes', ...commands, `cls -d ${remotePath}`,
		mirror.replace(/^mirror /, 'mirror --dry-run ')], password, 'pipe');
	if (status !== 0) {
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
// non-zero for a folder that isn't there, one it was refused and a transfer that broke, and only
// the first is safe to read as 'nothing on the server to lose'
const pullRemoteAcfJson = (commands, remotePath, dest, password) => {
	const { status, stderr } = lftp([...commands, `mirror --verbose=0 ${remotePath} ${dest}`], password, 'inherit');
	// a clean run creates `dest` even when the remote folder held nothing, and an empty copy
	// puts nothing at risk, so both read the same downstream
	if (status === 0) { return sh.test('-d', dest); }
	if (!sh.test('-d', dest) && remoteMissing(commands, remotePath, stderr, password)) { return false; }
	process.stderr.write(unsettled(stderr));
	return null;
};

// Copy the server's `from` folder to `to`, as its own step so a copy that fails stops the deploy
// with the live folder untouched. Over SSH it is one `cp -a` on the server. Otherwise, or when the
// login refuses a shell (an SFTP-only host can still take a key), every file comes down here and
// goes back up within one session: a remote-to-remote `mirror` needs its target as a URL, which
// turns a path relative to the login's home into one from the server's root, and leans on FXP,
// which shared hosts refuse and lftp then works around silently
const backupRemoteFolder = (ftp, commands, from, to, password) => {
	const ssh = sshCommand(ftp);
	if (ssh) {
		echo(`Backing up '${from}' to '${to}' on '${ftp.host}' over SSH...`);
		const [bin, ...args] = ssh,
			// no stdin: ssh would forward whatever a script pipes into fdk to the server
			result = spawnSync(bin, [...args, `cp -a ${quote(fromHome(from))} ${quote(fromHome(to))}`],
				{ stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8' });
		if (result.status === 0) { return true; }
		warn(`The copy over SSH failed: ${(result.error?.message || result.stderr || `ssh exited with ${result.status}`).trim()}\nCopying through this machine instead.`);
	}
	echo(`Backing up '${from}' to '${to}' on '${ftp.host}' through this machine: every file comes down and goes back up, so this takes about as long as a full upload...`);
	const local = path.join(sh.tempdir(), `fdk-backup-${path.basename(to)}`);
	sh.rm('-rf', local);
	const copied = lftp([...commands,
		`mirror --verbose=1 ${from} ${local}`,
		`mirror --reverse --verbose=1 ${local} ${to}`], password, 'inherit');
	process.stderr.write(copied.stderr);
	sh.rm('-rf', local);
	return copied.status === 0;
};

// Files git would lose track of if they were overwritten in place. `files` are paths relative
// to the resource; null means git can't say, most likely because there's no repository to ask
const uncommittedFiles = (repoPath, files) => {
	const changed = changedFiles(repoPath);
	return changed && files.filter(file => changed.includes(file));
};

// Whether `name` may be uploaded: its problems listed, and the deploy asked whether to go ahead
// regardless — or refused straight away under `--strict`, or wherever there's no terminal to ask
// on. `ignore` is the resource's `.distignore` as lftp filters. `deleted` lists what `--delete`
// would remove on the server, asked only when params carry it. Checks named in `skip` aren't run
const checked = (name, resource, params, ignore, deleted, strict, skip) => {
	const filters = `${filterParams([params])} ${ignore}`,
		deletes = DELETE_OPTION.test(params),
		problems = payloadProblems(resource, filters, skip);
	if (!skip.includes('uncommitted')) {
		const uncommitted = uncommittedUploads(resource, filters, deletes);
		if (uncommitted === null) {
			warn(`Couldn't ask git whether '${name}' has uncommitted changes, most likely because it isn't in a repository or its repository ignores it: deploying it as it is.`);
		} else if (uncommitted.length) {
			problems.push(['uncommitted', `it has uncommitted changes this deploy would upload:\n${uncommitted.map(file => `      ${file}`).join('\n')}`]);
		}
	}
	if (deletes && !skip.includes('delete')) {
		const folders = deleted();
		if (folders === null) {
			problems.push(['delete', `the server couldn't say which folders '--delete' would remove (see the error above)`]);
		} else if (folders.length) {
			problems.push(['delete', `'--delete' would remove these folders from the server's copy:\n${folders.map(folder => `      ${folder}`).join('\n')}`]);
		}
	}
	if (buildIsStale(resource)) {
		warn(`'${name}' source was edited after its build output last changed. If 'fdk build' hasn't run since, this deploy ships a stale build.`);
	}
	if (!problems.length) { return true; }
	warn(`'${name}' isn't ready to deploy:\n${problems.map(([check, problem]) => `  - ${check}: ${problem}`).join('\n')}`);
	// isatty(0) rather than process.stdin.isTTY: creating that stream can leave fd 0 non-blocking,
	// and confirm's read of it then fails with EAGAIN
	if (!strict && isatty(0) && confirm(`Deploy '${name}' anyway?`)) { return true; }
	warn(`Deploy of '${name}' stopped. Fix the above and deploy again, or re-run with '--skip ${[...new Set(problems.map(([check]) => check))].join(',')}' to deploy regardless.`);
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

		const skip = options.force ? CHECKS : options.skip || [],
			// resources whose upload was called off before it started: nothing was sent for these
			skipped = [],
			// resources whose upload started and broke: the server may hold a partial copy
			failed = [];
		for (const entry of projectResources(projectConfig)) {
			// lftp and shelljs expand a leading `~` in the paths deploy hands them; git and `fs` don't
			const { resourceType, name } = entry,
				resource = expandHome(entry.resource);
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
				{ commands, password } = remoteCommands(ftp);

			// ACF saves field groups edited in wp-admin into the deployed resource's own
			// `acf-json`, so mirroring over it silently reverts them: check before uploading
			const acfPath = path.join(resource, 'acf-json');
			if (!skip.includes('acf') && sh.test('-d', acfPath)) {
				const remoteCopy = path.join(sh.tempdir(), `fdk-acf-${name}`);
				sh.rm('-rf', remoteCopy);
				const pulled = pullRemoteAcfJson(commands, path.join(destPath, name, 'acf-json'), remoteCopy, password);
				if (pulled === null) {
					sh.rm('-rf', remoteCopy);
					skipped.push(name);
					warn(`Couldn't read the 'acf-json' folder of '${name}' from the server, so there's no telling whether it holds field groups this deploy would revert. Deploy of '${name}' stopped: fix the error above and deploy again, or re-run with '--skip acf' to deploy regardless.`);
					continue;
				}
				// nothing on the server yet (first deploy): nothing to lose, carry on
				const listed = files => files.map(file => `  acf-json/${file}`).join('\n'),
					atRisk = pulled ? acfGroupsAtRisk(remoteCopy, acfPath) : { newer: [], unknown: [] };
				if (atRisk.unknown.length > 0) {
					// no stamp to compare, so there's no telling whether the deploy would revert
					// them — and an unreadable copy can't be pulled down for review either
					warn(`Couldn't compare these '${name}' field groups with the server's copy, so there's no telling whether this deploy would revert them:\n${listed(atRisk.unknown)}\n\nCheck them on the server by hand, or re-run with '--skip acf' to overwrite it regardless.`);
					skipped.push(name);
					sh.rm('-rf', remoteCopy);
					continue;
				}
				if (atRisk.newer.length > 0) {
					// bring them into the working tree so they can be reviewed and committed, but
					// only where git can undo it and there's no local work to overwrite
					const uncommitted = uncommittedFiles(resource, atRisk.newer.map(file => path.join('acf-json', file)));
					if (uncommitted === null) {
						warn(`Server holds newer '${name}' field groups than this repo, most likely edited in wp-admin. Deploying would revert them:\n${listed(atRisk.newer)}\n\n'${name}' isn't in a git repository, or its repository ignores it, so they can't be pulled safely. Copy them across by hand, or re-run with '--skip acf' to overwrite the server.`);
					} else if (uncommitted.length > 0) {
						warn(`Server holds newer '${name}' field groups than this repo, most likely edited in wp-admin:\n${listed(atRisk.newer)}\n\nPulling them would overwrite uncommitted local changes. Commit or stash these first, then deploy again:\n${uncommitted.map(file => `  ${file}`).join('\n')}`);
					} else {
						atRisk.newer.forEach(file => sh.cp('-f', path.join(remoteCopy, file), path.join(acfPath, file)));
						warn(`Server holds newer '${name}' field groups than this repo, most likely edited in wp-admin. Deploy of '${name}' stopped, and they have been pulled into the working tree:\n${listed(atRisk.newer)}\n\nReview and commit them, then deploy again — or 'git restore' them and re-run with '--skip acf' to overwrite the server.`);
					}
					skipped.push(name);
					sh.rm('-rf', remoteCopy);
					continue;
				}
				sh.rm('-rf', remoteCopy);
			}

			// checked before the backup, so a resource the checks refuse is never copied
			const mirror = `mirror --reverse --verbose=1 ${params} ${ignore} ${resource} ${path.join(destPath, name)}`;
			// --force skips every check through `skip`; the stale-build warning, which is no check, still shows
			if (!checked(name, resource, params, ignore, () => deletedFolders(commands, password, mirror, path.join(destPath, name)), options.strict, skip)) {
				skipped.push(name);
				continue;
			}

			if (options.backup) {
				// a backup of a folder that isn't there yet would fail and stop a legitimate first
				// deploy. Ask first — and treat a question that can't be answered the way the ACF
				// preflight treats its own
				const alreadyDeployed = remoteFolderExists(commands, path.join(destPath, name), password);
				if (alreadyDeployed === null) {
					skipped.push(name);
					warn(`Couldn't tell whether '${name}' is already on the server, so there's no telling whether '--backup' would copy anything. Deploy of '${name}' stopped: fix the error above and deploy again, or deploy without '--backup' to upload with no copy taken.`);
					continue;
				}
				if (alreadyDeployed) {
					const backupName = `${name}_${(new Date()).toISOString()}`;
					if (!backupRemoteFolder(ftp, commands, path.join(destPath, name), path.join(destPath, backupName), password)) {
						skipped.push(name);
						warn(`Couldn't back up '${name}' on the server, so it wasn't uploaded and the live copy is untouched. A partial '${backupName}' may be left beside it: remove it, fix the error above and deploy again.`);
						continue;
					}
					echo(`Backed up to '${backupName}'. Uploading updated files to '${name}'...`);
				} else {
					echo(`Nothing to back up: '${name}' isn't on the server yet.`);
				}
			}

			commands.push(mirror);
			const upload = lftp(commands, password, 'inherit');
			process.stderr.write(upload.stderr);
			if (upload.status !== 0) {
				failed.push(name);
			}
		}

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

module.exports = { CHECKS, DELETE_OPTION, LFTP_DEFAULTS, acfGroupsAtRisk, backupRemoteFolder, buildIsStale, deletedFolders, deploy, filterParams, ignoreParams, lftp, payloadProblems, pullRemoteAcfJson, remoteCommands, remoteFolderExists, remoteMissing, scrub, skipOption, uncommittedFiles, uncommittedUploads, unsettled };
