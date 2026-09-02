'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test'),
	fs = require('fs'),
	path = require('path');

const { acfGroupsAheadOnRemote, pullRemoteAcfJson, uncommittedFiles } = require('../../lib/deploy'),
	{ BROKEN_PULL, LFTP_STUB_BODY, MISSING_FOLDER } = require('../helpers/lftp-stub'),
	{ makeProject } = require('../helpers/project'),
	{ stubBin } = require('../helpers/stub-bin'),
	{ cleanTmpDirs, makeTmpDir } = require('../helpers/tmpdir');

after(cleanTmpDirs);

const group = (key, modified) => JSON.stringify({ key, modified });

const dirWith = files => {
	const dir = makeTmpDir('fdk-acf-');
	for (const [name, body] of Object.entries(files)) { fs.writeFileSync(path.join(dir, name), body); }
	return dir;
};

// ——— acfGroupsAheadOnRemote ————

test('a remote group with a newer stamp is ahead', () => {
	const remote = dirWith({ 'g.json': group('g', 900) }),
		local = dirWith({ 'g.json': group('g', 100) });
	assert.deepEqual(acfGroupsAheadOnRemote(remote, local), ['g.json']);
});

test('an older or equal remote group is not ahead', () => {
	const remote = dirWith({ 'older.json': group('a', 100), 'same.json': group('b', 500) }),
		local = dirWith({ 'older.json': group('a', 900), 'same.json': group('b', 500) });
	assert.deepEqual(acfGroupsAheadOnRemote(remote, local), []);
});

test('a group only the server has is ahead', () => {
	assert.deepEqual(acfGroupsAheadOnRemote(dirWith({ 'new.json': group('n', 100) }), dirWith({})),
		['new.json']);
});

test('files that are not .json are ignored', () => {
	const remote = dirWith({ 'notes.txt': 'x', 'g.json': group('g', 100) }),
		local = dirWith({ 'g.json': group('g', 100) });
	assert.deepEqual(acfGroupsAheadOnRemote(remote, local), []);
});

// `modifiedStamp` returns 0 for any exception, so a group that arrives but can't be read scores
// below every real local stamp and the guard waves the deploy through
test('a remote group whose JSON is corrupt is treated as ahead',
	{ todo: 'fabrica-dev-kit-e2c' }, () => {
		const remote = dirWith({ 'g.json': '{ not json' }),
			local = dirWith({ 'g.json': group('g', 100) });
		assert.deepEqual(acfGroupsAheadOnRemote(remote, local), ['g.json']);
	});

test('a remote group that cannot be read is treated as ahead',
	{ todo: 'fabrica-dev-kit-e2c', skip: process.getuid && process.getuid() === 0 ? 'running as root' : false },
	() => {
		const remote = dirWith({ 'g.json': group('g', 900) }),
			local = dirWith({ 'g.json': group('g', 100) });
		fs.chmodSync(path.join(remote, 'g.json'), 0o000);
		assert.deepEqual(acfGroupsAheadOnRemote(remote, local), ['g.json']);
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
