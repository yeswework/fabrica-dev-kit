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

test('a malformed config.yml halts', () => {
	const dir = makeProject({ config: 'default:\n  themes: [unclosed\n' }),
		res = runNode(`${requireLib('config')}.getProjectConfig('default')`, { cwd: dir });
	assert.equal(res.status, 1);
	assert.match(res.stderr, /Error loading 'config.yml'/);
});

// `sh.cat` doesn't throw on a file that isn't there, and `yaml.load` of an empty one returns
// undefined, so both used to slip past the catch and dereference undefined a line later
test('a missing config.yml halts', () => {
	const dir = makeProject({}), // no config.yml written at all
		res = runNode(`${requireLib('config')}.getProjectConfig('default')`, { cwd: dir });
	assert.equal(res.status, 1);
	assert.match(res.stderr, /Could not find 'config.yml'/);
	assert.doesNotMatch(res.stderr, /TypeError/);
});

test('an empty config.yml halts', () => {
	const dir = makeProject({ config: '\n# nothing but a comment\n' }),
		res = runNode(`${requireLib('config')}.getProjectConfig('default')`, { cwd: dir });
	assert.equal(res.status, 1);
	assert.match(res.stderr, /holds no configuration/);
});

// valid YAML of the wrong shape would otherwise read as a section with no themes and no plugins
test('a section that is not a set of settings halts', () => {
	const dir = makeProject({ config: 'default: just-a-string\n' }),
		res = runNode(`${requireLib('config')}.getProjectConfig('default')`, { cwd: dir });
	assert.equal(res.status, 1);
	assert.match(res.stderr, /is not a set of settings/);
});
