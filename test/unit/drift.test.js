'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test'),
	fs = require('fs'),
	path = require('path');

const { buildIsStale, filterParams } = require('../../lib/deploy'),
	{ compare, parseDiff, sectionResources } = require('../../lib/drift'),
	{ cleanTmpDirs, makeTmpDir } = require('../helpers/tmpdir');

after(cleanTmpDirs);

// ——— sectionResources ————

const FTP = { host: 'h', path: '/www' };
const listed = resources => resources.map(({ section, resourceType, resource, ftp }) => [section, resourceType, resource, ftp.host]);

test('a section and its variants are combined, each resource once', () => {
	const config = {
		production: { ftp: FTP, themes: ['../t/theme'], plugins: ['../p/a'] },
		'production/a': { extend: 'production', themes: null, plugins: ['../p/a'] },
		'production/b': { extend: 'production', themes: null, plugins: ['../p/b'] },
		productionish: { plugins: ['../p/not-a-variant'] },
		staging: { plugins: ['../p/staging-only'] },
	};
	assert.deepEqual(listed(sectionResources(config, 'production')), [
		['production', 'themes', '../t/theme', 'h'],
		['production', 'plugins', '../p/a', 'h'],
		['production/b', 'plugins', '../p/b', 'h'],
	]);
});

test('the same resource written two ways is still one resource', () => {
	const config = { production: { ftp: FTP, plugins: ['../p/a', '../p/a/'] } };
	assert.equal(sectionResources(config, 'production').length, 1);
});

test('a variant that empties a list leaves the base section in charge of it', () => {
	const config = {
		production: { ftp: FTP, themes: ['../t/theme'] },
		'production/theme': { extend: 'production', plugins: null },
	};
	assert.deepEqual(listed(sectionResources(config, 'production')), [['production', 'themes', '../t/theme', 'h']]);
});

// `extend` replaces `ftp:` whole, so a variant's own `ftp:` is where deploy sends its resources
test("a variant with its own ftp is compared with its own server, and once more if the base deploys it too", () => {
	const config = {
		production: { ftp: FTP, plugins: ['../p/a'] },
		'production/a': { extend: 'production', plugins: ['../p/a'], ftp: { host: 'other', path: '/www' } },
		'production/a-dry': { extend: 'production', plugins: ['../p/a'], ftp: { params: ['--dry-run'] } },
	};
	assert.deepEqual(listed(sectionResources(config, 'production')), [
		['production', 'plugins', '../p/a', 'h'],
		['production/a', 'plugins', '../p/a', 'other'],
		['production/a-dry', 'plugins', '../p/a', undefined],
	]);
});

test('a resource under ~ is found where deploy finds it', () => {
	const config = { production: { ftp: FTP, plugins: ['~/p/a'] } };
	assert.equal(sectionResources(config, 'production')[0].resource, path.join(require('os').homedir(), 'p/a'));
});

test('a section that is not there stops, as it does for deploy', () => {
	const res = require('../helpers/run').runNode(`${require('../helpers/run').requireLib('drift')}.sectionResources({ staging: {} }, 'production')`);
	assert.equal(res.status, 1);
	assert.match(res.stderr, /Project 'production' not found/);
});

// ——— filterParams ————

test("only the parameters that choose files carry over from deploy's mirror", () => {
	assert.equal(filterParams(['--delete', '--exclude-glob node_modules', '--dry-run', '-X *.map', '--include=^keep$', '--ignore-time', '-x\\.log$']),
		'--exclude-glob node_modules -X *.map --include=^keep$ -x\\.log$');
});

test('a quoted value stays whole', () => {
	assert.equal(filterParams(['--exclude-glob "a b"']), '--exclude-glob "a b"');
});

test('no parameters, no filters', () => {
	assert.equal(filterParams(undefined), '');
	assert.equal(filterParams(['--delete']), '');
});

// ——— parseDiff ————

test('diff -rq lines become changed, local-only and server-only files', () => {
	const output = [
		'Files /t/local/build/index.js and /t/server/build/index.js differ',
		'Only in /t/local/build: index-rtl.css',
		'Only in /t/server/vendor: bin',
		'Only in /t/local: eslint.config.js',
	].join('\n') + '\n';
	assert.deepEqual(parseDiff(output, '/t/local', '/t/server'), [
		{ kind: 'changed', file: 'build/index.js' },
		{ kind: 'local only', file: 'build/index-rtl.css' },
		{ kind: 'server only', file: 'vendor/bin' },
		{ kind: 'local only', file: 'eslint.config.js' },
	]);
});

test('a folder only one side has is named as a folder, not lost', () => {
	assert.deepEqual(parseDiff('Only in /t/server: inc\n', '/t/local', '/t/server'), [{ kind: 'server only', file: 'inc' }]);
});

test('a line diff words differently is kept whole rather than dropped', () => {
	const line = 'File /t/local/x is a directory while file /t/server/x is a regular file';
	assert.deepEqual(parseDiff(line, '/t/local', '/t/server'), [{ kind: 'changed', file: line }]);
});

test('no output is no differences', () => {
	assert.deepEqual(parseDiff('', '/t/local', '/t/server'), []);
});

// ——— buildIsStale ————

const resourceWith = (srcTime, buildTime) => {
	const dir = makeTmpDir('fdk-drift-');
	for (const [folder, time] of [['src', srcTime], ['build', buildTime]]) {
		if (time === undefined) { continue; }
		fs.mkdirSync(path.join(dir, folder));
		const file = path.join(dir, folder, 'index.js');
		fs.writeFileSync(file, '');
		fs.utimesSync(file, time, time);
	}
	return dir;
};

test('a build older than its source is stale', () => {
	assert.equal(buildIsStale(resourceWith(2000, 1000)), true);
});

test('a build newer than its source is not stale', () => {
	assert.equal(buildIsStale(resourceWith(1000, 2000)), false);
});

test('a resource without both folders has no build to be stale', () => {
	assert.equal(buildIsStale(resourceWith(2000, undefined)), false);
	assert.equal(buildIsStale(resourceWith(undefined, 1000)), false);
});

// ——— compare ————

const copies = (local, server) => [local, server].map(files => {
	const dir = makeTmpDir('fdk-drift-copy-');
	for (const [file, body] of Object.entries(files)) { fs.writeFileSync(path.join(dir, file), body); }
	return dir;
});

test('identical copies have no differences, and differing ones list them', () => {
	assert.deepEqual(compare(...copies({ a: '1' }, { a: '1' })), { differences: [] });
	const [local, server] = copies({ a: '1' }, { a: '2' });
	assert.deepEqual(compare(local, server), { differences: [{ kind: 'changed', file: 'a' }] });
});

// diff exits 2 and may print nothing on stdout, which used to read as identical
test('a file diff cannot read means the copies were not compared',
	{ skip: process.getuid && process.getuid() === 0 ? 'running as root' : false }, () => {
		const [local, server] = copies({ a: '1' }, { a: '1' });
		fs.chmodSync(path.join(server, 'a'), 0o000);
		const result = compare(local, server);
		fs.chmodSync(path.join(server, 'a'), 0o644);
		assert.equal(result.differences, undefined);
		assert.match(result.error, /Permission denied/);
	});

test('a dangling symlink means the copies were not compared', () => {
	const [local, server] = copies({}, {});
	fs.symlinkSync('nowhere', path.join(local, 'link'));
	fs.symlinkSync('nowhere', path.join(server, 'link'));
	assert.ok(compare(local, server).error);
});

test('no diff to run means the copies were not compared', () => {
	const saved = process.env.PATH;
	process.env.PATH = makeTmpDir('fdk-no-diff-');
	try {
		assert.match(compare(...copies({}, {})).error, /ENOENT/);
	} finally {
		process.env.PATH = saved;
	}
});
