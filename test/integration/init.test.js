'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test'),
	fs = require('fs'),
	path = require('path');

const { runFdk } = require('../helpers/run'),
	{ stubBin } = require('../helpers/stub-bin'),
	{ cleanTmpDirs, makeTmpDir } = require('../helpers/tmpdir');

after(cleanTmpDirs);

const docker = () => stubBin({ docker: 'exit 0' }).path,
	init = (args, cwd) => runFdk(['init', ...args], { cwd, env: { PATH: docker() } });

// `init` renders the template that ships beside index.js — the one path that would break silently
// if the package root were ever resolved from the wrong directory
test('a setup.yml is written from the packaged template', async () => {
	const dir = makeTmpDir('fdk-init-'),
		res = await init(['mysite', '--title', 'My Site'], dir);
	assert.equal(res.status, 0);
	const written = fs.readFileSync(path.join(dir, 'setup.yml'), 'utf8');
	assert.match(written, /^slug: mysite/m);
	assert.match(written, /^title: My Site/m);
	assert.match(written, /^wp:/m);
});

test('with no slug the folder name is used', async () => {
	const dir = path.join(makeTmpDir('fdk-init-'), 'my-new-site');
	fs.mkdirSync(dir);
	assert.equal((await init([], dir)).status, 0);
	assert.match(fs.readFileSync(path.join(dir, 'setup.yml'), 'utf8'), /^slug: my-new-site/m);
});

test('an existing setup.yml is never overwritten', async () => {
	const dir = makeTmpDir('fdk-init-');
	fs.writeFileSync(path.join(dir, 'setup.yml'), 'slug: original\n');
	const res = await init(['mysite'], dir);
	assert.equal(res.status, 1);
	assert.match(res.stderr, /'setup.yml' already exists/);
	assert.equal(fs.readFileSync(path.join(dir, 'setup.yml'), 'utf8'), 'slug: original\n');
});

test('--create-dir makes the folder and refuses to reuse one', async () => {
	const dir = makeTmpDir('fdk-init-');
	assert.equal((await init(['mysite', '--create-dir'], dir)).status, 0);
	assert.ok(fs.existsSync(path.join(dir, 'mysite', 'setup.yml')));

	const again = await init(['mysite', '--create-dir'], dir);
	assert.equal(again.status, 1);
	assert.match(again.stderr, /already a file or folder called 'mysite'/);
});

test('--create-dir with no slug is refused', async () => {
	const res = await init(['--create-dir'], makeTmpDir('fdk-init-'));
	assert.equal(res.status, 1);
	assert.match(res.stderr, /a <slug> must be provided/);
});
