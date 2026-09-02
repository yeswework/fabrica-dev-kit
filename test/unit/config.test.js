'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test');

const { getProjectConfig } = require('../../lib/config'),
	{ makeProject } = require('../helpers/project'),
	{ requireLib, runNode } = require('../helpers/run'),
	{ cleanTmpDirs } = require('../helpers/tmpdir');

after(cleanTmpDirs);

// `getProjectConfig` accepts an already-loaded config as its second argument, so section
// resolution can be exercised without touching the filesystem
test('returns the named section', () => {
	assert.deepEqual(getProjectConfig('default', { default: { themes: ['./a'] } }), { themes: ['./a'] });
});

test('extend lays the child section over the parent', () => {
	const config = {
		base: { themes: ['./base'], ftp: { host: 'base.test' } },
		staging: { extend: 'base', ftp: { host: 'staging.test' } },
	};
	// a shallow spread, so `ftp` is replaced outright rather than merged key by key
	assert.deepEqual(getProjectConfig('staging', config),
		{ themes: ['./base'], extend: 'base', ftp: { host: 'staging.test' } });
});

// The rest end in `halt`, which calls `process.exit` — they have to run in a child process

test('an unknown project halts', () => {
	const dir = makeProject({ config: 'default:\n  themes:\n    - ./a\n' }),
		res = runNode(`${requireLib('config')}.getProjectConfig('nope')`, { cwd: dir });
	assert.equal(res.status, 1);
	assert.match(res.stderr, /Project 'nope' not found/);
});

test('extending a section that is not in the file halts', () => {
	const dir = makeProject({ config: 'base:\n  themes: [./a]\nchild:\n  extend: missing\n' }),
		res = runNode(`${requireLib('config')}.getProjectConfig('child')`, { cwd: dir });
	assert.equal(res.status, 1);
	assert.match(res.stderr, /extends 'missing' which was not found/);
});

test('a malformed config.yml warns and yields an empty object', () => {
	const dir = makeProject({ config: 'default:\n  themes: [unclosed\n' }),
		res = runNode(`console.log(JSON.stringify(${requireLib('config')}.getProjectConfig('default')))`,
			{ cwd: dir });
	assert.equal(res.status, 0);
	assert.match(res.stderr, /Error loading 'config.yml'/);
	assert.equal(res.stdout.trim(), '{}');
});

// `sh.cat` doesn't throw on a file that isn't there, so the try/catch written for this case never
// fires and the next line dereferences undefined
test('a missing config.yml fails as softly as a malformed one',
	{ todo: 'fabrica-dev-kit-vgd' }, () => {
		const dir = makeProject({}), // no config.yml written at all
			res = runNode(`console.log(JSON.stringify(${requireLib('config')}.getProjectConfig('default')))`,
				{ cwd: dir });
		// asserted on the exit status alone: a raw stack trace in the diff of every run is worse
		// than the reminder is worth
		assert.equal(res.status, 0, 'should warn and return {}, not throw a TypeError');
	});
