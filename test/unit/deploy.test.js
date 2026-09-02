'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test'),
	fs = require('fs'),
	path = require('path');

const { acfGroupsAtRisk, pullRemoteAcfJson, uncommittedFiles } = require('../../lib/deploy'),
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
