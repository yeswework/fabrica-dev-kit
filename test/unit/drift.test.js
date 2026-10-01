'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test'),
	fs = require('fs'),
	path = require('path');

const { buildIsStale, parseDiff, scrub, sectionResources } = require('../../lib/drift'),
	{ cleanTmpDirs, makeTmpDir } = require('../helpers/tmpdir');

after(cleanTmpDirs);

// ——— sectionResources ————

test('a section and its variants are combined, each resource once', () => {
	const config = {
		production: { themes: ['../t/theme'], plugins: ['../p/a'] },
		'production/a': { extend: 'production', themes: null, plugins: ['../p/a'] },
		'production/b': { extend: 'production', themes: null, plugins: ['../p/b'] },
		productionish: { plugins: ['../p/not-a-variant'] },
		staging: { plugins: ['../p/staging-only'] },
	};
	assert.deepEqual(sectionResources(config, 'production'), [
		{ resourceType: 'themes', resource: '../t/theme' },
		{ resourceType: 'plugins', resource: '../p/a' },
		{ resourceType: 'plugins', resource: '../p/b' },
	]);
});

test('the same resource written two ways is still one resource', () => {
	const config = { production: { plugins: ['../p/a', '../p/a/'] } };
	assert.equal(sectionResources(config, 'production').length, 1);
});

test('a variant that empties a list leaves the base section in charge of it', () => {
	const config = {
		production: { themes: ['../t/theme'] },
		'production/theme': { extend: 'production', plugins: null },
	};
	assert.deepEqual(sectionResources(config, 'production'), [{ resourceType: 'themes', resource: '../t/theme' }]);
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

// ——— scrub ————

test('a password is masked whether lftp repeats it raw or as it sits in the URL', () => {
	const said = 'open: sftp://u:p%40ss%20w@h:22 failed; tried p@ss w twice';
	assert.equal(scrub(said, 'p@ss w'), 'open: sftp://u:***@h:22 failed; tried *** twice');
});

test('with no password there is nothing to mask', () => {
	assert.equal(scrub('Login failed', undefined), 'Login failed');
});
