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
	config = (ftpCommands = [], params = []) => ['default:', '  ftp:', '    host: ftp.test', '    user: u',
		'    password: p', '    path: /',
		...(ftpCommands.length ? ['    commands:', ...ftpCommands.map(command => `      - ${command}`)]
			: ['    commands: []']),
		...(params.length ? [`    params: [${params.map(param => `'${param}'`).join(', ')}]`] : []),
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
	strict = false,
	noAcfDir = false,  // resource with no local acf-json at all
	noResource = false, // config names a resource whose folder isn't there
	lftp = true,
	ftpCommands = [],
	params = [],
	extra = {},        // other files committed in the resource
	uncommitted = {},  // other files left uncommitted on top of them
	dryRun = '',       // what lftp's `--dry-run` of the upload prints
	dryRunStatus = 0,
	home = false,      // the resource configured as `~/mytheme`, with HOME at the project
	status = 0,
	stderr = '',
	signal = false,
	uploadStatus = 0, // what the `mirror --reverse` run exits with
	backup = false,
	// what the `--backup` probe for the resource on the server answers
	existsStatus = 0,
	existsStderr = '',
} = {}) => {
	const files = { 'style.css': '/* theme */', ...extra };
	if (!noAcfDir) {
		// an empty .keep keeps the folder present even when the scenario has no groups
		files['acf-json/.keep'] = '';
		for (const [name, body] of Object.entries(local)) { files[`acf-json/${name}`] = body; }
	}
	const dir = makeProject({
		config: home ? config(ftpCommands, params).replace(`./${RESOURCE}`, `~/${RESOURCE}`) : config(ftpCommands, params),
		resources: noResource ? {} : { [RESOURCE]: {
			files,
			dirty: { ...Object.fromEntries(Object.entries(dirty).map(([n, b]) => [`acf-json/${n}`, b])), ...uncommitted },
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
	const res = await runFdk(['deploy', ...(force ? ['--force'] : []), ...(strict ? ['--strict'] : []), ...(backup ? ['--backup'] : [])], {
		cwd: dir,
		env: {
			...(home ? { HOME: dir } : {}),
			PATH: stubs.path,
			LFTP_STUB_DEST: acfPullDest(RESOURCE),
			LFTP_STUB_FIXTURE: fixture,
			LFTP_STUB_SIGNAL: signal ? '1' : '',
			LFTP_STUB_STATUS: String(status),
			LFTP_STUB_STDERR: stderr,
			LFTP_STUB_EXISTS_STATUS: String(existsStatus),
			LFTP_STUB_EXISTS_STDERR: existsStderr,
			LFTP_STUB_UPLOAD_STATUS: String(uploadStatus),
			LFTP_STUB_DRY_RUN: dryRun,
			LFTP_STUB_DRY_RUN_STATUS: String(dryRunStatus),
		},
	});

	const calls = stubs.calls();
	return {
		calls,
		upload: calls.find(call => call.includes('--reverse') && !call.includes('--dry-run')) || '',
		dryRuns: calls.filter(call => call.includes('--dry-run')).length,
		lftpRuns: calls.filter(c => c.includes('mirror')).length,
		output: res.stdout + res.stderr,
		read: file => fs.readFileSync(path.join(dir, RESOURCE, 'acf-json', file), 'utf8'),
		status: res.status,
		uploaded: calls.some(c => c.includes('--reverse') && !c.includes('--dry-run')),
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
	assert.ok(run.upload.indexOf(LFTP_DEFAULTS[0]) < run.upload.indexOf('open --env-password ftp://'));
});

// `set` is last-wins in lftp, so a project's own value has to come after ours to take effect
test("a project's own ftp.commands come after the defaults, and so win", async () => {
	const run = await deploy({ noAcfDir: true, force: true,
		ftpCommands: ['set net:max-retries 9'] });
	assert.ok(run.upload.indexOf('set net:max-retries 3') < run.upload.indexOf('set net:max-retries 9'));
	assert.ok(run.upload.indexOf('set net:max-retries 9') < run.upload.indexOf('open --env-password ftp://'));
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

// ——— the payload checks: what the working tree would ship (fabrica-dev-kit-p9h, -43j) ————
// `runFdk` gives no terminal, so a resource that fails one is refused rather than asked about

test("a 'composer.json' with no 'vendor/' stops the upload", async () => {
	const run = await deploy({ noAcfDir: true, extra: { 'composer.json': '{}' } });
	assert.equal(run.uploaded, false);
	assert.equal(run.status, 1);
	assert.match(run.output, /'mytheme' isn't ready to deploy:\n  - it has a 'composer.json' and no 'vendor\/'/);
	assert.match(run.output, /re-run with '--force' to deploy regardless/);
	assert.match(run.output, /not uploaded: mytheme/);
});

test("a 'composer.json' with its 'vendor/' uploads", async () => {
	const run = await deploy({ noAcfDir: true, extra: { 'composer.json': '{}', 'vendor/autoload.php': '<?php' } });
	assert.equal(run.uploaded, true);
	assert.equal(run.status, 0);
});

test("a build script with no 'build/' stops the upload, and one with no build script needs none", async () => {
	let run = await deploy({ noAcfDir: true, extra: { 'package.json': JSON.stringify({ scripts: { build: 'wp-scripts build' } }) } });
	assert.equal(run.uploaded, false);
	assert.match(run.output, /it has a build script and no 'build\/'/);

	run = await deploy({ noAcfDir: true, extra: { 'package.json': JSON.stringify({ scripts: { lint: 'x' } }) } });
	assert.equal(run.uploaded, true);
	assert.equal(run.status, 0);
});

test('a bundle webpack built around a missing module stops the upload, and names it', async () => {
	const run = await deploy({ noAcfDir: true, extra: {
		'build/index.js': `!(function webpackMissingModule() { var e = new Error("Cannot find module '@wordpress/icons'"); throw e; }())`,
		'build/view.js': 'ok()',
	} });
	assert.equal(run.uploaded, false);
	assert.match(run.output, /couldn't find, and they throw at runtime:\n      build\/index\.js\n/);
	assert.doesNotMatch(run.output, /build\/view\.js/);
});

// webpack leaves unchanged output with its old mtimes, so an older `build/` only suggests a stale
// one: it is warned about and never listed as a reason to stop
test('a source edited after the build output is a warning, not a stop', async () => {
	// committed first and edited after, so `src/` is the newer for certain
	const run = await deploy({ noAcfDir: true, extra: { 'build/index.js': 'ok()', 'src/index.js': 'x' }, uncommitted: { 'src/index.js': 'y' } });
	assert.match(run.output, /'mytheme' source was edited after its build output last changed/);
	assert.match(run.output, /isn't ready to deploy:\n  - it has uncommitted changes this deploy would upload:\n      src\/index\.js\n[^-]*Deploy of 'mytheme' stopped/);
});

test('uncommitted changes stop the upload and are listed, deletions included', async () => {
	const run = await deploy({ noAcfDir: true, extra: { 'gone.php': '<?php' }, uncommitted: { 'style.css': '/* edited */', 'new.php': '<?php' } });
	assert.equal(run.uploaded, false);
	assert.equal(run.status, 1);
	assert.match(run.output, /it has uncommitted changes this deploy would upload:/);
	assert.match(run.output, /      new\.php/);
	assert.match(run.output, /      style\.css/);
});

// git and `fs` take a `~` literally, so unexpanded it read as no repository and the check passed
test('uncommitted changes in a resource configured under ~ are found', async () => {
	const run = await deploy({ noAcfDir: true, home: true, uncommitted: { 'new.php': '<?php' } });
	assert.equal(run.uploaded, false);
	assert.match(run.output, /it has uncommitted changes this deploy would upload:\n      new\.php/);
	assert.doesNotMatch(run.output, /Couldn't ask git/);
});

test('a resource that is not a git repository is deployed with a warning', async () => {
	const run = await deploy({ noAcfDir: true, git: false });
	assert.equal(run.uploaded, true);
	assert.equal(run.status, 0);
	assert.match(run.output, /Couldn't ask git whether 'mytheme' has uncommitted changes/);
});

test("with '--delete', the folders the dry run would remove stop the upload; files and nested folders don't", async () => {
	const dryRun = ['rm -r ftp://u@ftp.test/wp-content/themes/mytheme/vendor',
		'rm -r ftp://u@ftp.test/wp-content/themes/mytheme/build/chunks',
		'rm ftp://u@ftp.test/wp-content/themes/mytheme/old.php', 'put -O ftp://u@ftp.test/wp-content/themes/mytheme style.css', ''].join('\n');
	let run = await deploy({ noAcfDir: true, params: ['--delete'], dryRun });
	assert.equal(run.dryRuns, 1);
	assert.equal(run.uploaded, false);
	assert.match(run.output, /'--delete' would remove these folders from the server's copy:\n      vendor\n/);
	assert.doesNotMatch(run.output, /chunks|old\.php/);

	// nothing to remove, or no `--delete` to remove it with: no question to ask
	run = await deploy({ noAcfDir: true, params: ['--delete'], dryRun: dryRun.split('\n').slice(1).join('\n') });
	assert.equal(run.uploaded, true);
	run = await deploy({ noAcfDir: true, dryRun });
	assert.equal(run.dryRuns, 0);
	assert.equal(run.uploaded, true);
});

test('a dry run that fails stops the upload; one on a first deploy has nothing to remove', async () => {
	let run = await deploy({ noAcfDir: true, params: ['--delete'], dryRunStatus: 1, stderr: BROKEN_PULL });
	assert.equal(run.uploaded, false);
	assert.match(run.output, /max-retries exceeded/);
	assert.match(run.output, /the server couldn't say which folders '--delete' would remove/);

	run = await deploy({ noAcfDir: true, params: ['--delete'], dryRunStatus: 1, stderr: MISSING_FOLDER.vsftpd });
	assert.equal(run.uploaded, true);
	assert.equal(run.status, 0);
});

test('--force skips every check, --strict refuses, and the two together are an error', async () => {
	const failing = { noAcfDir: true, params: ['--delete'], dryRun: 'rm -r ftp://u@ftp.test/wp-content/themes/mytheme/vendor\n',
		extra: { 'composer.json': '{}' }, uncommitted: { 'new.php': '<?php' } };
	let run = await deploy({ ...failing, force: true });
	assert.equal(run.uploaded, true);
	assert.equal(run.status, 0);
	assert.equal(run.dryRuns, 0);
	assert.doesNotMatch(run.output, /isn't ready to deploy/);

	run = await deploy({ ...failing, strict: true });
	assert.equal(run.uploaded, false);
	assert.match(run.output, /composer\.json[\s\S]*new\.php[\s\S]*vendor/);

	run = await deploy({ ...failing, force: true, strict: true });
	assert.equal(run.status, 1);
	assert.equal(run.lftpRuns, 0);
	assert.match(run.output, /'-f, --force' cannot be used with option '-s, --strict'/);
});
