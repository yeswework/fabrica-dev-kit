'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test'),
	fs = require('fs'),
	path = require('path');

const { BROKEN_PULL, LFTP_STUB_BODY, MISSING_FOLDER, acfPullDest } = require('../helpers/lftp-stub'),
	{ makeProject } = require('../helpers/project'),
	{ runFdk } = require('../helpers/run'),
	{ stubBin } = require('../helpers/stub-bin'),
	{ cleanTmpDirs, makeTmpDir } = require('../helpers/tmpdir');

after(cleanTmpDirs);

const RESOURCE = 'mytheme',
	CONFIG = ['default:', '  ftp:', '    host: ftp.test', '    user: u', '    password: p',
		'    path: /', '    commands: []', '  themes:', `    - ./${RESOURCE}`, ''].join('\n');

const group = (key, modified) => JSON.stringify({ key, modified });

// Drives the real `fdk deploy` with a stubbed `lftp`, and reports whether the upload was reached.
// That is the question the ACF guard exists to answer: an indeterminate preflight must never end
// in `mirror --reverse`.
const deploy = async ({
	local = {},        // acf-json files committed in the resource
	dirty = {},        // acf-json files left uncommitted on top of them
	server = null,     // acf-json files the stubbed pull delivers, or null for none
	git = true,
	force = false,
	noAcfDir = false,  // resource with no local acf-json at all
	noResource = false, // config names a resource whose folder isn't there
	lftp = true,
	status = 0,
	stderr = '',
	signal = false,
} = {}) => {
	const files = { 'style.css': '/* theme */' };
	if (!noAcfDir) {
		// an empty .keep keeps the folder present even when the scenario has no groups
		files['acf-json/.keep'] = '';
		for (const [name, body] of Object.entries(local)) { files[`acf-json/${name}`] = body; }
	}
	const dir = makeProject({
		config: CONFIG,
		resources: noResource ? {} : { [RESOURCE]: {
			files,
			dirty: Object.fromEntries(Object.entries(dirty).map(([n, b]) => [`acf-json/${n}`, b])),
			git,
		} },
	});

	let fixture = '';
	if (server) {
		fixture = makeTmpDir('fdk-server-acf-');
		for (const [name, body] of Object.entries(server)) {
			fs.writeFileSync(path.join(fixture, name), body);
		}
	}

	const stubs = lftp
		? stubBin({ docker: 'exit 0', lftp: LFTP_STUB_BODY })
		: stubBin({ docker: 'exit 0' }, { absent: ['lftp'] });
	const res = await runFdk(['deploy', ...(force ? ['--force'] : [])], {
		cwd: dir,
		env: {
			PATH: stubs.path,
			LFTP_STUB_DEST: acfPullDest(RESOURCE),
			LFTP_STUB_FIXTURE: fixture,
			LFTP_STUB_SIGNAL: signal ? '1' : '',
			LFTP_STUB_STATUS: String(status),
			LFTP_STUB_STDERR: stderr,
		},
	});

	const calls = stubs.calls();
	return {
		calls,
		lftpRuns: calls.filter(c => c.includes('mirror')).length,
		output: res.stdout + res.stderr,
		read: file => fs.readFileSync(path.join(dir, RESOURCE, 'acf-json', file), 'utf8'),
		status: res.status,
		uploaded: calls.some(c => c.includes('--reverse')),
	};
};

// ——— the five preflight outcomes, and whether the upload is reached ————

test('a preflight that succeeds and finds nothing newer uploads', async () => {
	const run = await deploy({ local: { 'g.json': group('g', 100) }, server: { 'g.json': group('g', 100) } });
	assert.equal(run.uploaded, true);
	assert.equal(run.status, 0);
	assert.equal(run.lftpRuns, 2);
});

test('a remote folder that genuinely is not there is a first deploy and uploads', async () => {
	const run = await deploy({ local: { 'g.json': group('g', 100) }, status: 1, stderr: MISSING_FOLDER.vsftpd });
	assert.equal(run.uploaded, true);
	assert.equal(run.status, 0);
});

test('a preflight that broke stops before the upload', async () => {
	const run = await deploy({ local: { 'g.json': group('g', 100) }, status: 1, stderr: BROKEN_PULL });
	assert.equal(run.uploaded, false);
	assert.equal(run.status, 1);
	assert.match(run.output, /Couldn't read the 'acf-json' folder/);
	assert.match(run.output, /not uploaded: mytheme/);
});

test('a missing lftp binary stops before the upload', async () => {
	const run = await deploy({ local: { 'g.json': group('g', 100) }, lftp: false });
	assert.equal(run.uploaded, false);
	assert.equal(run.status, 1);
});

test('a preflight killed by a signal stops before the upload', async () => {
	const run = await deploy({ local: { 'g.json': group('g', 100) }, signal: true });
	assert.equal(run.uploaded, false);
	assert.equal(run.status, 1);
});

// ——— divergence, once the preflight has succeeded ————

test('newer groups on the server stop the deploy and are pulled into the tree', async () => {
	const run = await deploy({
		local: { 'g.json': group('g', 100) },
		server: { 'g.json': group('g', 900) },
	});
	assert.equal(run.uploaded, false);
	assert.equal(run.status, 1);
	assert.match(run.output, /pulled into the working tree/);
	assert.equal(run.read('g.json'), group('g', 900));
});

test('--force skips the preflight altogether and uploads', async () => {
	const run = await deploy({
		local: { 'g.json': group('g', 100) },
		server: { 'g.json': group('g', 900) },
		force: true,
	});
	assert.equal(run.uploaded, true);
	assert.equal(run.status, 0);
	// one lftp run, not two: with --force there is no pull to make
	assert.equal(run.lftpRuns, 1);
	assert.equal(run.read('g.json'), group('g', 100));
});

test('uncommitted local work is never overwritten by the pull', async () => {
	const run = await deploy({
		local: { 'g.json': group('g', 100) },
		dirty: { 'g.json': group('g', 101) },
		server: { 'g.json': group('g', 900) },
	});
	assert.equal(run.uploaded, false);
	assert.equal(run.status, 1);
	assert.match(run.output, /Commit or stash these first/);
	assert.equal(run.read('g.json'), group('g', 101));
});

test('a resource that is not a repository is left for the operator to sort out', async () => {
	const run = await deploy({
		local: { 'g.json': group('g', 100) },
		server: { 'g.json': group('g', 900) },
		git: false,
	});
	assert.equal(run.uploaded, false);
	assert.equal(run.status, 1);
	assert.match(run.output, /isn't a git repository/);
	assert.equal(run.read('g.json'), group('g', 100));
});

// ——— cases that never reach the guard ————

test('a resource with no acf-json folder skips the preflight and uploads', async () => {
	const run = await deploy({ noAcfDir: true });
	assert.equal(run.uploaded, true);
	assert.equal(run.status, 0);
	assert.equal(run.lftpRuns, 1);
});

test('a resource folder that is not there is reported and the run fails', async () => {
	const run = await deploy({ noResource: true });
	assert.equal(run.uploaded, false);
	assert.equal(run.status, 1);
	assert.match(run.output, /Path for resource 'mytheme' not found/);
});
