'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test'),
	fs = require('fs'),
	path = require('path');

const { LFTP_DEFAULTS, acfGroupsAtRisk, ignoreParams, lftp, pullRemoteAcfJson, remoteCommands, scrub, uncommittedFiles } = require('../../lib/deploy'),
	{ BROKEN_PULL, LFTP_STUB_BODY, MISSING_FOLDER } = require('../helpers/lftp-stub'),
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

// ——— pullRemoteAcfJson: the tri-state the guard turns on ————

// `pullRemoteAcfJson` shells out to whatever `lftp` is on PATH, so each case swaps in a stub that
// reproduces one outcome. The stub is driven by environment variables rather than by parsing its
// own command script back out, which keeps the fixture and the destination explicit
const pull = ({ status = 0, stderr = '', fixture = '', signal = false, lftp = true } = {}) => {
	const dest = path.join(makeTmpDir('fdk-pull-'), 'copy'),
		stub = lftp ? stubBin({ lftp: LFTP_STUB_BODY }) : { path: makeTmpDir('fdk-no-lftp-') },
		saved = { ...process.env };
	Object.assign(process.env, {
		PATH: stub.path,
		LFTP_STUB_DEST: dest,
		LFTP_STUB_FIXTURE: fixture,
		LFTP_STUB_SIGNAL: signal ? '1' : '',
		LFTP_STUB_STATUS: String(status),
		LFTP_STUB_STDERR: stderr,
	});
	try {
		return { dest, result: pullRemoteAcfJson(['open ftp://x@h'], 'remote/acf-json', dest) };
	} finally {
		for (const key of Object.keys(process.env)) { delete process.env[key]; }
		Object.assign(process.env, saved);
	}
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

// The wording after a 550 belongs to the FTP server, not to lftp, so the guard matches lftp's own
// `Access failed:` wrapper. All four of these mean the same thing: nothing on the server to lose
for (const [server, stderr] of Object.entries(MISSING_FOLDER)) {
	test(`a missing remote folder reads as false (${server} wording)`, () => {
		assert.equal(pull({ status: 1, stderr }).result, false);
	});
}

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

// ——— ignoreParams ————

test('a .distignore becomes lftp filters, a root-anchored entry kept off subfolders', () => {
	const dir = dirWith({ '.distignore': 'node_modules/\n# a comment\n./src/\n!keep.txt\n\n' });
	assert.deepEqual(ignoreParams(dir).split(/\s+/).filter(Boolean),
		['--exclude-glob', 'node_modules/', '--exclude-glob', 'src/', '--include-glob', '**/src/', '--include-glob', 'keep.txt']);
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

test('a password is masked whether it is repeated raw or URL-encoded', () => {
	assert.equal(scrub('open: sftp://u:p%40ss%20w@h:22 failed; tried p@ss w twice', 'p@ss w'), 'open: sftp://u:***@h:22 failed; tried *** twice');
});

test('with no password there is nothing to mask', () => {
	assert.equal(scrub('Login failed', undefined), 'Login failed');
});
