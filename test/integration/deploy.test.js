'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test'),
	fs = require('fs'),
	path = require('path');

const { LFTP_DEFAULTS } = require('../../lib/deploy'),
	{ BROKEN_PULL, LFTP_STUB_BODY, MISSING_FOLDER, acfPullDest } = require('../helpers/lftp-stub'),
	{ makeProject } = require('../helpers/project'),
	{ runFdk } = require('../helpers/run'),
	{ stubBin } = require('../helpers/stub-bin'),
	{ cleanTmpDirs, makeTmpDir } = require('../helpers/tmpdir');

after(cleanTmpDirs);

const RESOURCE = 'mytheme',
	config = (ftpCommands = []) => ['default:', '  ftp:', '    host: ftp.test', '    user: u',
		'    password: p', '    path: /',
		...(ftpCommands.length ? ['    commands:', ...ftpCommands.map(command => `      - ${command}`)]
			: ['    commands: []']),
		'  themes:', `    - ./${RESOURCE}`, ''].join('\n');

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
	ftpCommands = [],
	status = 0,
	stderr = '',
	signal = false,
	uploadStatus = 0, // what the `mirror --reverse` run exits with
	backup = false,
	// what the `--backup` probe for the resource on the server answers
	existsStatus = 0,
	existsStderr = '',
} = {}) => {
	const files = { 'style.css': '/* theme */' };
	if (!noAcfDir) {
		// an empty .keep keeps the folder present even when the scenario has no groups
		files['acf-json/.keep'] = '';
		for (const [name, body] of Object.entries(local)) { files[`acf-json/${name}`] = body; }
	}
	const dir = makeProject({
		config: config(ftpCommands),
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
	const res = await runFdk(['deploy', ...(force ? ['--force'] : []), ...(backup ? ['--backup'] : [])], {
		cwd: dir,
		env: {
			PATH: stubs.path,
			LFTP_STUB_DEST: acfPullDest(RESOURCE),
			LFTP_STUB_FIXTURE: fixture,
			LFTP_STUB_SIGNAL: signal ? '1' : '',
			LFTP_STUB_STATUS: String(status),
			LFTP_STUB_STDERR: stderr,
			LFTP_STUB_EXISTS_STATUS: String(existsStatus),
			LFTP_STUB_EXISTS_STDERR: existsStderr,
			LFTP_STUB_UPLOAD_STATUS: String(uploadStatus),
		},
	});

	const calls = stubs.calls();
	return {
		calls,
		upload: calls.find(call => call.includes('--reverse')) || '',
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
	// nothing was sent, so this is not an upload that broke
	assert.doesNotMatch(run.output, /failed while uploading/);
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

// a group that can't be compared is the one the guard used to score 0 and wave through
test("a server group that can't be compared stops the deploy", async () => {
	const run = await deploy({
		local: { 'g.json': group('g', 100) },
		server: { 'g.json': '{ not json' },
	});
	assert.equal(run.uploaded, false);
	assert.equal(run.status, 1);
	assert.match(run.output, /Couldn't compare these 'mytheme' field groups/);
	assert.match(run.output, /acf-json\/g\.json/);
	// and nothing was pulled over the local copy
	assert.equal(run.read('g.json'), group('g', 100));
});

test("--force still overrides a group that can't be compared", async () => {
	const run = await deploy({
		local: { 'g.json': group('g', 100) },
		server: { 'g.json': '{ not json' },
		force: true,
	});
	assert.equal(run.uploaded, true);
	assert.equal(run.status, 0);
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

// ——— an upload that breaks ————

test('an upload that exits non-zero fails the run', async () => {
	const run = await deploy({ local: { 'g.json': group('g', 100) }, server: { 'g.json': group('g', 100) },
		uploadStatus: 1 });
	assert.equal(run.uploaded, true, 'the upload was attempted');
	assert.equal(run.status, 1);
});

// a resource nothing was sent for and one that may be half-written on the server need different
// handling, so they get different wording
test('an upload that broke is reported as a failure, not as a skip', async () => {
	const run = await deploy({ local: { 'g.json': group('g', 100) }, server: { 'g.json': group('g', 100) },
		uploadStatus: 1 });
	assert.match(run.output, /failed while uploading: mytheme/);
	assert.match(run.output, /may hold a partial copy/);
	assert.doesNotMatch(run.output, /not uploaded: mytheme/);
});

// `lftp -c` reports only the last command's status, so without cmd:fail-exit a `--backup` that
// failed would be masked by the mirror that follows it — and the deploy would overwrite what it
// failed to copy. The rest bound how long an unreachable host can be waited on
test('every script opens with the deploy defaults', async () => {
	const run = await deploy({ noAcfDir: true, force: true });
	for (const setting of LFTP_DEFAULTS) {
		assert.ok(run.upload.includes(setting), `missing from the script: ${setting}`);
	}
	assert.ok(run.upload.indexOf(LFTP_DEFAULTS[0]) < run.upload.indexOf('open ftp://'));
});

// `set` is last-wins in lftp, so a project's own value has to come after ours to take effect
test("a project's own ftp.commands come after the defaults, and so win", async () => {
	const run = await deploy({ noAcfDir: true, force: true,
		ftpCommands: ['set net:max-retries 9'] });
	assert.ok(run.upload.indexOf('set net:max-retries 3') < run.upload.indexOf('set net:max-retries 9'));
	assert.ok(run.upload.indexOf('set net:max-retries 9') < run.upload.indexOf('open ftp://'));
});

test('a successful upload still exits 0', async () => {
	const run = await deploy({ local: { 'g.json': group('g', 100) }, server: { 'g.json': group('g', 100) } });
	assert.equal(run.status, 0);
	assert.doesNotMatch(run.output, /failed while uploading/);
});

// ——— --backup, which runs before the upload in the same script ————

test('a backup is queued when the resource is already on the server', async () => {
	const run = await deploy({ noAcfDir: true, backup: true, existsStatus: 0 });
	assert.equal(run.status, 0);
	assert.match(run.upload, /set ftp:use-fxp yes/);
	assert.match(run.upload, /Copying original resource folder/);
});

// fail-fast would otherwise abort a legitimate first deploy on the backup of a folder that was
// never there
test('nothing is backed up on a first deploy, and the upload still happens', async () => {
	const run = await deploy({ noAcfDir: true, backup: true,
		existsStatus: 1, existsStderr: MISSING_FOLDER.vsftpd });
	assert.equal(run.status, 0);
	assert.equal(run.uploaded, true);
	assert.doesNotMatch(run.upload, /use-fxp/, 'no backup should have been queued');
	assert.match(run.output, /Nothing to back up/);
});

test('a backup probe that cannot answer stops the deploy', async () => {
	const run = await deploy({ noAcfDir: true, backup: true,
		existsStatus: 1, existsStderr: BROKEN_PULL });
	assert.equal(run.status, 1);
	assert.equal(run.uploaded, false);
	assert.match(run.output, /Couldn't tell whether 'mytheme' is already on the server/);
});
