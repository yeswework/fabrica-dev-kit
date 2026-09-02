'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test'),
	fs = require('fs'),
	path = require('path');

const { makeProject } = require('../helpers/project'),
	{ requireLib, runNode } = require('../helpers/run'),
	{ cleanTmpDirs, makeTmpDir } = require('../helpers/tmpdir');

after(cleanTmpDirs);

// `loadProjectSettings` chdirs and writes into a module-level singleton, so each case runs in its
// own process and reports the state it left behind
const load = cwd => {
	const res = runNode(`const m = ${requireLib('project')};
		m.loadProjectSettings();
		console.log(JSON.stringify({ ...m.project, cwd: process.cwd(), package: undefined }));`, { cwd });
	assert.equal(res.status, 0, res.stderr);
	return { ...JSON.parse(res.stdout.trim().split('\n').pop()), stdout: res.stdout };
};

test('a project root is recognised and its package.json read', () => {
	const dir = makeProject({ slug: 'mysite' }),
		state = load(dir);
	assert.equal(state.isInstalled, true);
	assert.equal(state.version, 3);
	assert.equal(state.slug, 'mysite');
	assert.equal(state.title, 'Test Project');
	assert.equal(fs.realpathSync(state.rootDir), fs.realpathSync(dir));
});

test('running from a subdirectory moves to the project root and says so', () => {
	const dir = makeProject({ resources: { mytheme: { files: { 'style.css': '/* x */' }, git: false } } }),
		state = load(path.join(dir, 'mytheme'));
	assert.equal(state.isInstalled, true);
	assert.equal(fs.realpathSync(state.cwd), fs.realpathSync(dir));
	assert.match(state.stdout, /Working directory changed to/);
});

test('the pre-3 layout is recognised and flagged as version 2', () => {
	const dir = makeTmpDir('fdk-v2-');
	fs.mkdirSync(path.join(dir, 'config'));
	fs.writeFileSync(path.join(dir, 'config', 'setup.yml'), 'slug: old\n');
	fs.writeFileSync(path.join(dir, 'docker-compose.yml'), 'services: {}\n');
	fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'old', description: 'Old' }));
	assert.equal(load(dir).version, 2);
});

test('a marker file without the rest of a project is not a project', () => {
	const dir = makeTmpDir('fdk-bare-');
	fs.writeFileSync(path.join(dir, '.setup.yml'), 'slug: bare\n');
	// no docker-compose.yml and no package.json beside it
	assert.equal(load(dir).isInstalled, false);
});

test('a folder with no marker at all is not a project', () => {
	assert.equal(load(makeTmpDir('fdk-empty-')).isInstalled, false);
});
