'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test'),
	fs = require('fs'),
	path = require('path');

const { makeProject } = require('../helpers/project'),
	{ runFdk } = require('../helpers/run'),
	{ stubBin } = require('../helpers/stub-bin'),
	{ cleanTmpDirs, makeTmpDir } = require('../helpers/tmpdir');

after(cleanTmpDirs);

// `checkDependencies` halts at load time if `docker` isn't on PATH, so every CLI run needs one —
// stubbed, so the suite stays runnable on a machine without Docker
const docker = () => stubBin({ docker: 'exit 0' }).path;

test('--version reports the package version', async () => {
	const res = await runFdk(['--version'], { cwd: makeTmpDir(), env: { PATH: docker() } });
	assert.equal(res.status, 0);
	assert.equal(res.stdout.trim(), require('../../package.json').version);
});

test('a missing docker binary halts before any command runs', async () => {
	const res = await runFdk(['--version'], { cwd: makeTmpDir(), env: { PATH: makeTmpDir('fdk-no-docker-') } });
	assert.equal(res.status, 1);
	assert.match(res.stderr, /Could not find dependency 'docker'/);
});

test('outside a project only init and setup are offered', async () => {
	const out = (await runFdk(['--help'], { cwd: makeTmpDir(), env: { PATH: docker() } })).stdout;
	assert.match(out, /init \[options\] \[slug\]/);
	assert.match(out, /setup \[options\]/);
	assert.doesNotMatch(out, /config:url/);
	assert.doesNotMatch(out, /deploy/);
});

test('inside a project the project commands appear', async () => {
	const out = (await runFdk(['--help'], { cwd: makeProject({}), env: { PATH: docker() } })).stdout;
	for (const command of ['config:url', 'config:resources', 'config:all', 'urls', 'build', 'start', 'deploy']) {
		assert.ok(out.includes(command), `'${command}' missing from the help`);
	}
});

test("a project's package.json scripts become commands", async () => {
	const dir = makeProject({});
	fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
		name: 'scripted', description: 'Scripted',
		scripts: { logs: 'docker compose logs -f' },
		fabrica_dev_kit: { scripts_info: { logs: 'Tail WP container logs.' } },
	}));
	const out = (await runFdk(['--help'], { cwd: dir, env: { PATH: docker() } })).stdout;
	assert.match(out, /logs\s+from 'package.json': Tail WP container logs\./);
});

test('an unknown command says so and shows the help', async () => {
	const res = await runFdk(['nonsense'], { cwd: makeTmpDir(), env: { PATH: docker() } });
	assert.match(res.stderr + res.stdout, /Invalid command: nonsense/);
});
