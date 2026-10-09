'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test');

const { getProjectConfig } = require('../../lib/config'),
	{ makeProject } = require('../helpers/project'),
	{ requireLib, runNode } = require('../helpers/run'),
	{ stubBin } = require('../helpers/stub-bin'),
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

// Bitwarden references, read through a stub `bw` that answers with the session it was handed and
// the item name reversed, so each answer can be told apart from the reference it came from. The
// developer's own BW_SESSION is cleared unless a test sets one
const bwStub = (stubs = {}, options) => stubBin({ bw: `printf '%s:%s' "$BW_SESSION" "$(printf '%s' "$4" | rev)"`, ...stubs }, options),
	resolve = (code, env) => runNode(`const { resolveSecret } = ${requireLib('config')}; ${code}`, { env: { BW_SESSION: '', ...env } });

test('a bw:// value is read once, however often it is asked for, with the exported session', () => {
	const bin = bwStub({ security: 'echo saved' }),
		res = resolve(`for (let i = 0; i < 2; i++) console.log(resolveSecret('bw://site-ftp'))`, { PATH: bin.path, BW_SESSION: 'exported' });
	assert.equal(res.status, 0, res.stderr);
	assert.equal(res.stdout, 'exported:ptf-etis\nexported:ptf-etis\n');
	assert.deepEqual(bin.calls(), ['bw get password --nointeraction site-ftp']);
});

test('with no session exported, the keychain one is read once for every reference in the run', () => {
	const bin = bwStub({ security: 'echo saved' }),
		res = resolve(`console.log(resolveSecret('bw://a-ftp'), resolveSecret('bw://b-rest'))`, { PATH: bin.path });
	assert.equal(res.status, 0, res.stderr);
	assert.equal(res.stdout, 'saved:ptf-a saved:tser-b\n');
	assert.deepEqual(bin.calls(), ['security find-generic-password -s bw-session -w', 'bw get password --nointeraction a-ftp', 'bw get password --nointeraction b-rest']);
});

test('a value that is not a reference is returned as written, without running bw', () => {
	const bin = bwStub(),
		res = resolve(`console.log(JSON.stringify(['hunter2', undefined, 3].map(resolveSecret)))`, { PATH: bin.path });
	assert.equal(res.status, 0, res.stderr);
	assert.equal(res.stdout, '["hunter2",null,3]\n');
	assert.deepEqual(bin.calls(), []);
});

// many projects keep `ftp:` under `default`, which `fdk start` reads
test('reading a section leaves its references unread', () => {
	const bin = bwStub(),
		dir = makeProject({ config: 'default:\n  ftp:\n    password: bw://site-ftp\n' }),
		res = runNode(`console.log(${requireLib('config')}.getProjectConfig('default').ftp.password)`, { cwd: dir, env: { PATH: bin.path } });
	assert.equal(res.status, 0, res.stderr);
	assert.equal(res.stdout, 'bw://site-ftp\n');
	assert.deepEqual(bin.calls(), []);
});

test('a reference bw cannot read halts with what bw said', () => {
	const bin = stubBin({ bw: `echo 'More than one result was found.' >&2; exit 1` }),
		res = resolve(`resolveSecret('bw://site-ftp')`, { PATH: bin.path, BW_SESSION: 'exported' });
	assert.equal(res.status, 1);
	assert.match(res.stderr, /Could not read 'bw:\/\/site-ftp' from Bitwarden:\nMore than one result was found\./);
});

// `security` exits 44 when the keychain holds no such item
test('no session exported or saved halts with how to save one, before running bw', () => {
	const bin = bwStub({ security: `echo 'The specified item could not be found in the keychain.' >&2; exit 44` }),
		res = resolve(`resolveSecret('bw://site-ftp')`, { PATH: bin.path });
	assert.equal(res.status, 1);
	assert.match(res.stderr, /save one with `security add-generic-password -U -a "\$USER" -s bw-session -w "\$\(bw unlock --raw\)"`, or export BW_SESSION/);
	assert.deepEqual(bin.calls(), ['security find-generic-password -s bw-session -w']);
});

test('a reference with no bw installed halts naming the CLI', () => {
	const bin = stubBin({}, { absent: ['bw'] }),
		res = resolve(`resolveSecret('bw://site-ftp')`, { PATH: bin.path, BW_SESSION: 'exported' });
	assert.equal(res.status, 1);
	assert.match(res.stderr, /the Bitwarden CLI \('bw'\) could not be run/);
});
