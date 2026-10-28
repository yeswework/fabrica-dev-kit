'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test'),
	fs = require('fs'),
	path = require('path');

const { CHECKS, DELETE_OPTION, LFTP_DEFAULTS, acfGroupsAtRisk, ignoreParams, lftp, pullRemoteAcfJson, remoteCommands, remoteFolderExists, scrub, skipOption, uncommittedFiles } = require('../../lib/deploy'),
	{ BARE_550, BROKEN_PULL, DENIED_FOLDER, EMPTY_LISTING, LFTP_STUB_BODY, MISSING_FOLDER, UNREADABLE_LISTING } = require('../helpers/lftp-stub'),
	{ makeProject } = require('../helpers/project'),
	{ requireLib, runNode } = require('../helpers/run'),
	{ stubBin } = require('../helpers/stub-bin'),
	{ cleanTmpDirs, makeTmpDir } = require('../helpers/tmpdir');

after(cleanTmpDirs);

const group = (key, modified) => JSON.stringify({ key, modified });

const dirWith = files => {
	const dir = makeTmpDir('fdk-acf-');
	for (const [name, body] of Object.entries(files)) { fs.writeFileSync(path.join(dir, name), body); }
	return dir;
};

// ——— acfGroupsAtRisk ————

const atRisk = (remote, local) => acfGroupsAtRisk(dirWith(remote), dirWith(local));

test('a remote group with a newer stamp is newer', () => {
	assert.deepEqual(atRisk({ 'g.json': group('g', 900) }, { 'g.json': group('g', 100) }),
		{ newer: ['g.json'], unknown: [] });
});

test('an older or equal remote group is at no risk', () => {
	assert.deepEqual(
		atRisk({ 'older.json': group('a', 100), 'same.json': group('b', 500) },
			{ 'older.json': group('a', 900), 'same.json': group('b', 500) }),
		{ newer: [], unknown: [] });
});

test('a group only the server has counts as newer', () => {
	assert.deepEqual(atRisk({ 'new.json': group('n', 100) }, {}), { newer: ['new.json'], unknown: [] });
});

test('files that are not .json are ignored', () => {
	assert.deepEqual(atRisk({ 'notes.txt': 'x', 'g.json': group('g', 100) }, { 'g.json': group('g', 100) }),
		{ newer: [], unknown: [] });
});

// a group with no usable stamp can't be ranked, and scoring it 0 would rank it below every real
// one — which is how an unreadable copy on the server used to read as older than ours
test('a remote group whose JSON is corrupt cannot be compared', () => {
	assert.deepEqual(atRisk({ 'g.json': '{ not json' }, { 'g.json': group('g', 100) }),
		{ newer: [], unknown: ['g.json'] });
});

test('a remote group with no modified stamp cannot be compared', () => {
	assert.deepEqual(atRisk({ 'g.json': JSON.stringify({ key: 'g' }) }, { 'g.json': group('g', 100) }),
		{ newer: [], unknown: ['g.json'] });
});

test('a stamp that arrives as a string is still a stamp', () => {
	assert.deepEqual(atRisk({ 'g.json': '{"key":"g","modified":"900"}' }, { 'g.json': group('g', 100) }),
		{ newer: ['g.json'], unknown: [] });
});

test('a local group that cannot be compared blocks too', () => {
	assert.deepEqual(atRisk({ 'g.json': group('g', 100) }, { 'g.json': 'not json either' }),
		{ newer: [], unknown: ['g.json'] });
});

test('a remote group that cannot be read cannot be compared',
	{ skip: process.getuid && process.getuid() === 0 ? 'running as root' : false }, () => {
		const remote = dirWith({ 'g.json': group('g', 900) }),
			local = dirWith({ 'g.json': group('g', 100) });
		fs.chmodSync(path.join(remote, 'g.json'), 0o000);
		// unreadable and server-only at once must not land in `newer`: that branch copies the file
		// into the working tree, which would fail
		assert.deepEqual(acfGroupsAtRisk(remote, dirWith({})), { newer: [], unknown: ['g.json'] });
		assert.deepEqual(acfGroupsAtRisk(remote, local), { newer: [], unknown: ['g.json'] });
	});

// ——— uncommittedFiles ————

test('a clean repository has nothing to lose', () => {
	const dir = makeProject({ resources: { mytheme: { files: { 'acf-json/g.json': group('g', 1) } } } });
	assert.deepEqual(uncommittedFiles(path.join(dir, 'mytheme'), ['acf-json/g.json']), []);
});

test('a modified file is reported', () => {
	const dir = makeProject({
		resources: { mytheme: {
			files: { 'acf-json/g.json': group('g', 1), 'acf-json/h.json': group('h', 1) },
			dirty: { 'acf-json/g.json': group('g', 2) },
		} },
	});
	assert.deepEqual(uncommittedFiles(path.join(dir, 'mytheme'), ['acf-json/g.json', 'acf-json/h.json']),
		['acf-json/g.json']);
});

test('a folder that is not a repository answers null, not an empty list', () => {
	const dir = makeProject({
		resources: { mytheme: { files: { 'acf-json/g.json': group('g', 1) }, git: false } },
	});
	assert.equal(uncommittedFiles(path.join(dir, 'mytheme'), ['acf-json/g.json']), null);
});

// a theme kept inside a project repository that ignores it, with no .git of its own: git reports
// nothing changed there, and could restore none of what a pull overwrote
test('a folder its repository ignores answers null, not an empty list', () => {
	const repo = makeTmpDir('fdk-ignored-'),
		theme = path.join(repo, 'themes', 'mytheme');
	fs.mkdirSync(path.join(theme, 'acf-json'), { recursive: true });
	fs.writeFileSync(path.join(theme, 'acf-json', 'g.json'), group('g', 1));
	fs.writeFileSync(path.join(repo, '.gitignore'), 'themes/mytheme/\n');
	require('child_process').spawnSync('git', ['init', '-q', repo]);
	assert.equal(uncommittedFiles(theme, ['acf-json/g.json']), null);
});

// ——— pullRemoteAcfJson: the tri-state the guard turns on ————

// `pullRemoteAcfJson` shells out to whatever `lftp` is on PATH, so each case swaps in a stub that
// reproduces one outcome. The stub is driven by environment variables rather than by parsing its
// own command script back out, which keeps the fixture and the destination explicit. `listPath`
// and `list` are the one folder above that lists after a bare 550, and what it holds
const withStub = ({ lftp = true, listPath = '', list = '', ...env }, run) => {
	const stub = lftp ? stubBin({ lftp: LFTP_STUB_BODY }) : { path: makeTmpDir('fdk-no-lftp-') },
		saved = { ...process.env },
		// the explanation of a 550 that couldn't be settled goes to stderr
		write = process.stderr.write;
	Object.assign(process.env, { PATH: stub.path, LFTP_STUB_LIST_PATH: listPath, LFTP_STUB_LIST: list, ...env });
	let printed = '';
	process.stderr.write = text => { printed += text; return true; };
	try {
		return { ...run(), printed, calls: lftp ? stub.calls() : [] };
	} finally {
		process.stderr.write = write;
		for (const key of Object.keys(process.env)) { delete process.env[key]; }
		Object.assign(process.env, saved);
	}
};

const pull = ({ status = 0, stderr = '', fixture = '', signal = false, ...rest } = {}) => {
	const dest = path.join(makeTmpDir('fdk-pull-'), 'copy');
	return withStub({
		...rest,
		LFTP_STUB_DEST: dest,
		LFTP_STUB_FIXTURE: fixture,
		LFTP_STUB_SIGNAL: signal ? '1' : '',
		LFTP_STUB_STATUS: String(status),
		LFTP_STUB_STDERR: stderr,
	}, () => ({ dest, result: pullRemoteAcfJson(['open ftp://x@h'], 'site/theme/acf-json', dest) }));
};

test('a copy that arrives reads as true', () => {
	const fixture = dirWith({ 'g.json': group('g', 100) }),
		{ dest, result } = pull({ fixture });
	assert.equal(result, true);
	assert.deepEqual(fs.readdirSync(dest), ['g.json']);
});

test('a clean run that leaves no folder reads as false', () => {
	assert.equal(pull({}).result, false);
});

// vsftpd and pure-ftpd send a folder the login can write to but not list as an empty listing, and
// lftp exits 0: only the server's own reply tells it from an empty folder (fabrica-dev-kit-rkd)
for (const [server, stderr] of Object.entries(UNREADABLE_LISTING)) {
	test(`an empty copy of a folder the server said it couldn't list reads as null (${server})`, () => {
		const { result, printed, calls } = pull({ fixture: dirWith({}), stderr });
		assert.equal(result, null);
		assert.match(calls[0], /debug 5; mirror /);
		assert.match(printed, /sent 'site\/theme\/acf-json' as empty but said it couldn't list it/);
		assert.match(printed, /(failed to open directory|Can't check for file existence)/);
	});
}

for (const [server, stderr] of Object.entries(EMPTY_LISTING)) {
	test(`an empty copy the server listed cleanly reads as true (${server})`, () => {
		assert.equal(pull({ fixture: dirWith({}), stderr }).result, true);
	});
}

// a copy that arrived was listed, whatever else the transcript holds
test('a copy that arrived reads as true even beside a refused listing', () => {
	assert.equal(pull({ fixture: dirWith({ 'g.json': group('g', 100) }), stderr: UNREADABLE_LISTING.pureFtpd }).result, true);
});

// the transcript carries the login, password and all
test("lftp's transcript never reaches the screen", () => {
	const { result, printed } = pull({ status: 1, stderr: `---> PASS hunter2\n<--- 230 Login successful.\n${BROKEN_PULL}` });
	assert.equal(result, null);
	assert.equal(printed, `${BROKEN_PULL}\n`);
});

// The wording after a 550 belongs to the FTP server, not to lftp. Where it says the folder isn't
// there, nothing on the server is at risk; where it says the folder is refused, there is no telling
for (const [server, stderr] of Object.entries(MISSING_FOLDER)) {
	test(`a missing remote folder reads as false (${server} wording)`, () => {
		const { result, calls } = pull({ status: 1, stderr });
		assert.equal(result, false);
		assert.equal(calls.length, 1, 'wording that settles it needs no listing');
	});
}

for (const [server, stderr] of Object.entries(DENIED_FOLDER)) {
	test(`a refused remote folder reads as null, never as missing (${server} wording)`, () => {
		assert.equal(pull({ status: 1, stderr, listPath: 'site/theme', list: 'site/theme/style.css\nsite/theme/acf-json/\n' }).result, null);
		assert.equal(pull({ status: 1, stderr: DENIED_FOLDER.sftp, listPath: 'site/theme', list: 'site/theme/style.css\n' }).result, null,
			'a refusal without a 550 is never sent to the listing');
	});
}

// vsftpd says `550 Failed to change directory.` whether the folder is missing or refused, so the
// folder above settles it: missing only where that lists other entries and not this one
test('a bare 550 reads as false where the folder above lists others and not it', () => {
	const { result, calls } = pull({ status: 1, stderr: BARE_550, listPath: 'site/theme', list: 'site/theme/style.css\n' });
	assert.equal(result, false);
	assert.match(calls[1], /cls -1 site\/theme\/; $/);
});

test('a bare 550 reads as null where the folder above lists it', () => {
	const { result, printed } = pull({ status: 1, stderr: BARE_550, listPath: 'site/theme', list: 'site/theme/acf-json/\nsite/theme/style.css\n' });
	assert.equal(result, null);
	assert.match(printed, /Failed to change directory/);
	assert.match(printed, /isn't there or that it can't be read/);
});

// vsftpd sends a folder it can't read as an empty listing
test('a bare 550 reads as null where the folder above lists nothing', () => {
	assert.equal(pull({ status: 1, stderr: BARE_550, listPath: 'site/theme', list: '' }).result, null);
});

// a first deploy: the theme isn't there either, which the folder above it settles
test('a bare 550 whose folder above fails the same way is settled one level up', () => {
	assert.equal(pull({ status: 1, stderr: BARE_550, listPath: 'site', list: 'site/other/\n' }).result, false);
	assert.equal(pull({ status: 1, stderr: BARE_550, listPath: 'site', list: 'site/theme/\n' }).result, null);
	// nothing lists, all the way to the top
	assert.equal(pull({ status: 1, stderr: BARE_550 }).result, null);
});

test('a bare 550 whose listing broke reads as null', () => {
	assert.equal(pull({ status: 1, stderr: BARE_550, LFTP_STUB_LIST_STDERR: BROKEN_PULL }).result, null);
});

test('a pull that broke reads as null, not as an empty server', () => {
	assert.equal(pull({ status: 1, stderr: BROKEN_PULL }).result, null);
});

test('a pull killed by a signal reads as null', () => {
	assert.equal(pull({ signal: true }).result, null);
});

test('a missing lftp binary reads as null', () => {
	assert.equal(pull({ lftp: false }).result, null);
});

// a mirror that dies midway leaves a partial copy behind: reading that as complete would treat the
// groups it never fetched as absent from the server
test('a partial transfer reads as null even though a folder exists', () => {
	const fixture = dirWith({ 'g.json': group('g', 100) });
	assert.equal(pull({ fixture, status: 1, stderr: BROKEN_PULL }).result, null);
});

// ——— remoteFolderExists: the probe --backup and --delete turn on ————

const exists = ({ status = 0, stderr = '', ...rest } = {}) => withStub({
	...rest, LFTP_STUB_EXISTS_STATUS: String(status), LFTP_STUB_EXISTS_STDERR: stderr,
}, () => ({ result: remoteFolderExists(['open ftp://x@h'], 'wp-content/themes/mytheme') })).result;

test('remoteFolderExists: readable is true, missing false, refused or unsettled null', () => {
	assert.equal(exists(), true);
	assert.equal(exists({ status: 1, stderr: MISSING_FOLDER.pureFtpd }), false);
	assert.equal(exists({ status: 1, stderr: BARE_550, listPath: 'wp-content/themes', list: 'wp-content/themes/other/\n' }), false);
	assert.equal(exists({ status: 1, stderr: DENIED_FOLDER.pureFtpd, listPath: 'wp-content/themes', list: 'wp-content/themes/mytheme/\n' }), null);
	assert.equal(exists({ status: 1, stderr: DENIED_FOLDER.sftp }), null);
	assert.equal(exists({ status: 1, stderr: BARE_550, listPath: 'wp-content/themes', list: '' }), null);
	assert.equal(exists({ status: 1, stderr: BROKEN_PULL }), null);
});

// ——— ignoreParams ————

test('a .distignore becomes lftp filters, a root-anchored entry kept off subfolders', () => {
	const dir = dirWith({ '.distignore': 'node_modules/\n# a comment\n./src/\n!keep.txt\n\n' });
	assert.deepEqual(ignoreParams(dir).split(/\s+/).filter(Boolean),
		['--exclude-glob', 'node_modules/', '--exclude-glob', 'src/', '--include-glob', '**/src/',
			'--include-glob', 'keep.txt', '--include-glob', 'keep.txt/']);
});

// lftp matches a folder only by its name with a slash appended, so `/build` alone never matched
// the `build/` folder (fabrica-dev-kit-wnz)
test('a .distignore line with no trailing slash matches a folder of that name as well as a file', () => {
	const dir = dirWith({ '.distignore': '/build\nvendor\n' });
	assert.deepEqual(ignoreParams(dir).split(/\s+/).filter(Boolean), [
		'--exclude-glob', 'build', '--include-glob', '**/build', '--exclude-glob', 'build/', '--include-glob', '**/build/',
		'--exclude-glob', 'vendor', '--exclude-glob', 'vendor/']);
});

test('a resource with no .distignore has no filters', () => {
	assert.equal(ignoreParams(dirWith({})), '');
});

// ——— remoteCommands ————

test('the connection script is the defaults, the section commands, then the open, with no password in it', () => {
	const { url, commands, password } = remoteCommands({ scheme: 'sftp', user: 'u@x', password: 'p w', host: 'h', port: 22, commands: ['set a b'] });
	assert.equal(url, 'sftp://u%40x@h:22');
	assert.equal(password, 'p w');
	assert.deepEqual(commands, [...LFTP_DEFAULTS, 'set a b', `open --env-password ${url}`]);
});

test('a section with no commands of its own still connects', () => {
	assert.deepEqual(remoteCommands({ user: 'u', host: 'h' }).commands, [...LFTP_DEFAULTS, 'open ftp://u@h']);
});

// in a child process, so the stub `bw` is the one on PATH
test('a Bitwarden reference connects with the password it names, handed back for masking', () => {
	const bw = stubBin({ bw: `printf 'p w'` }),
		res = runNode(`const { url, password } = ${requireLib('deploy')}.remoteCommands({ user: 'u', password: 'bw://site-ftp', host: 'h' });
			console.log(JSON.stringify({ url, password }))`, { env: { PATH: bw.path, BW_SESSION: 'exported' } });
	assert.equal(res.status, 0, res.stderr);
	assert.deepEqual(JSON.parse(res.stdout), { url: 'ftp://u@h', password: 'p w' });
	assert.deepEqual(bw.calls(), ['bw get password --nointeraction site-ftp']);
});

// ——— lftp ————

// the script is an argument any user can read in `ps`, so the password goes in the environment
test('lftp hands the password over in its environment, never its arguments, and masks it in what it says', () => {
	const stub = stubBin({ lftp: `printf 'env:%s\\n' "$LFTP_PASSWORD" >&2; echo 'Login failed: p w / p%20w' >&2; exit 1` }),
		saved = process.env.PATH;
	process.env.PATH = stub.path;
	try {
		const { commands, password } = remoteCommands({ user: 'u', password: 'p w', host: 'h' }),
			result = lftp([...commands, 'cls -d x'], password);
		assert.equal(result.status, 1);
		assert.equal(result.stderr, 'env:***\nLogin failed: *** / ***\n');
		assert.doesNotMatch(stub.calls()[0], /p w|p%20w/);
	} finally {
		process.env.PATH = saved;
	}
});

// `open --env-password` with nothing in the environment would fail every FTP-only `--backup`
test('a backup through this machine logs in the same way, and masks what lftp says', () => {
	const stub = stubBin({ lftp: `printf 'env:%s\\n' "$LFTP_PASSWORD" >&2; exit 1` }),
		res = runNode(`const { backupRemoteFolder, remoteCommands } = ${requireLib('deploy')},
			{ commands, password } = remoteCommands({ user: 'u', password: 'p w', host: 'h' });
			console.log(backupRemoteFolder({ host: 'h' }, commands, 'a', 'b', password))`, { env: { PATH: stub.path } });
	assert.equal(res.stdout.trim().split('\n').pop(), 'false', res.stderr);
	assert.match(res.stderr, /^env:\*\*\*$/m);
	assert.doesNotMatch(stub.calls()[0], /p w|p%20w/);
});

// a `--delete` dry run of a first deploy with vendor/ lists thousands of files
test('lftp output past 1MB is read whole, not cut off as a failure', () => {
	const stub = stubBin({ lftp: `head -c 2000000 /dev/zero | tr '\\0' a` }),
		res = runNode(`const { lftp } = ${requireLib('deploy')}, { status, stdout } = lftp(['x'], undefined, 'pipe');
			console.log(status, stdout.length)`, { env: { PATH: stub.path } });
	assert.equal(res.stdout.trim(), '0 2000000', res.stderr);
});

test('a password is masked whether it is repeated raw or URL-encoded', () => {
	assert.equal(scrub('open: sftp://u:p%40ss%20w@h:22 failed; tried p@ss w twice', 'p@ss w'), 'open: sftp://u:***@h:22 failed; tried *** twice');
});

test('with no password there is nothing to mask', () => {
	assert.equal(scrub('Login failed', undefined), 'Login failed');
});

// lftp reads short options as getopt does, so `-e` can come combined with others
test('--delete is seen however it is written, and nothing else is taken for it', () => {
	for (const params of ['-e', '--delete', '--delete-first', '-ev', '-Re', '-R -e', '-v --delete=x']) {
		assert.ok(DELETE_OPTION.test(params), params);
	}
	for (const params of ['', '-R', '-v', '--exclude-glob *.e', '-x \\.e$', '--verbose']) {
		assert.ok(!DELETE_OPTION.test(params), params);
	}
});

// a filter's value can come attached, as filterParams reads it, and an `e` in it is no `-e`
test('a filter with its value attached is not taken for --delete', () => {
	for (const params of ['-Xvendor', '-xtests', '-v -Ivendor/autoload.php']) {
		assert.ok(!DELETE_OPTION.test(params), params);
	}
	assert.ok(DELETE_OPTION.test('-veXvendor'));
});

// ——— skipOption: `--skip`'s parser ————

test('--skip names add up across repeats, spaces and empty items aside', () => {
	assert.deepEqual(skipOption(' vendor, ,build', []), ['vendor', 'build']);
	assert.deepEqual(skipOption('delete', ['vendor']), ['vendor', 'delete']);
	assert.deepEqual(skipOption(CHECKS.join(',')), CHECKS);
});

test('a --skip name that is no check throws, naming every one that is', () => {
	assert.throws(() => skipOption('acf,ACF,vendors'), {
		code: 'commander.invalidArgument',
		message: `No check named 'ACF', 'vendors': the checks are ${CHECKS.join(', ')}.`,
	});
});
