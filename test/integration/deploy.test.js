'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test'),
	fs = require('fs'),
	path = require('path');

const { LFTP_DEFAULTS } = require('../../lib/deploy'),
	{ BARE_550, BROKEN_PULL, DENIED_FOLDER, LFTP_STUB_BODY, MISSING_FOLDER, acfPullDest } = require('../helpers/lftp-stub'),
	{ makeProject } = require('../helpers/project'),
	{ runFdk } = require('../helpers/run'),
	{ stubBin } = require('../helpers/stub-bin'),
	{ cleanTmpDirs, makeTmpDir } = require('../helpers/tmpdir');

after(cleanTmpDirs);

const RESOURCE = 'mytheme',
	config = (ftpCommands = [], params = [], scheme = '') => ['default:', '  ftp:', '    host: ftp.test', '    user: u',
		'    password: p', '    path: /', ...(scheme ? [`    scheme: ${scheme}`] : []),
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
	skip = [],         // each a `--skip` value
	noAcfDir = false,  // resource with no local acf-json at all
	noResource = false, // config names a resource whose folder isn't there
	lftp = true,
	ftpCommands = [],
	params = [],
	extra = {},        // other files committed in the resource
	uncommitted = {},  // other files left uncommitted on top of them
	removed = [],      // committed files deleted from the working tree
	replacing = {},    // files written once those are gone, as a file replaced by a folder needs
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
	backupStatus = 0, // what the backup's own lftp run exits with
	// after a bare 550, the one folder above that lists and what it holds; every other answers 550
	listPath = '',
	list = '',
	sshKey = false,   // an sftp section that logs in with a key, so the backup goes over SSH
	sshStatus = 0,    // non-zero answers as an SFTP-only host does
	sshAbsent = false,
} = {}) => {
	const files = { 'style.css': '/* theme */', ...extra };
	if (!noAcfDir) {
		// an empty .keep keeps the folder present even when the scenario has no groups
		files['acf-json/.keep'] = '';
		for (const [name, body] of Object.entries(local)) { files[`acf-json/${name}`] = body; }
	}
	const dir = makeProject({
		config: (configured => home ? configured.replace(`./${RESOURCE}`, `~/${RESOURCE}`) : configured)(sshKey
			? config([...ftpCommands, 'set sftp:connect-program "ssh -i /key"'], params, 'sftp')
			: config(ftpCommands, params)),
		resources: noResource ? {} : { [RESOURCE]: {
			files,
			dirty: { ...Object.fromEntries(Object.entries(dirty).map(([n, b]) => [`acf-json/${n}`, b])), ...uncommitted },
			git,
		} },
	});
	removed.forEach(file => fs.rmSync(path.join(dir, RESOURCE, file)));
	for (const [file, body] of Object.entries(replacing)) {
		fs.mkdirSync(path.dirname(path.join(dir, RESOURCE, file)), { recursive: true });
		fs.writeFileSync(path.join(dir, RESOURCE, file), body);
	}

	let fixture = '';
	if (server) {
		fixture = makeTmpDir('fdk-server-acf-');
		for (const [name, body] of Object.entries(server)) {
			fs.writeFileSync(path.join(fixture, name), body);
		}
	}

	// ssh handed fdk's own stdin would forward whatever a script feeds fdk to the server, so
	// anything but /dev/null fails
	const ssh = `[ -c /dev/stdin ] || { echo 'ssh was handed stdin' >&2; exit 9; }
${sshStatus ? `echo 'This service allows sftp connections only.' >&2; exit ${sshStatus}` : 'exit 0'}`,
		stubs = !lftp ? stubBin({ docker: 'exit 0' }, { absent: ['lftp'] })
			: sshAbsent ? stubBin({ docker: 'exit 0', lftp: LFTP_STUB_BODY }, { absent: ['ssh'] })
			: stubBin({ docker: 'exit 0', lftp: LFTP_STUB_BODY, ssh });
	const res = await runFdk(['deploy', ...(force ? ['--force'] : []), ...(strict ? ['--strict'] : []), ...skip.flatMap(value => ['--skip', value]), ...(backup ? ['--backup'] : [])], {
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
			LFTP_STUB_BACKUP_STATUS: String(backupStatus),
			LFTP_STUB_LIST_PATH: listPath,
			LFTP_STUB_LIST: list,
		},
	});

	const calls = stubs.calls(),
		// the backup's own run uploads too, into the backup folder, and the `--delete` check's dry run
		// is the upload's own command
		isUpload = call => call.includes('--reverse') && !call.includes('fdk-backup-') && !call.includes('--dry-run');
	return {
		calls,
		backup: calls.find(call => call.includes('fdk-backup-') || call.startsWith('ssh ')) || '',
		upload: calls.find(isUpload) || '',
		dryRuns: calls.filter(call => call.includes('--dry-run')).length,
		dryRun: calls.find(call => call.includes('--dry-run')) || '',
		lftpRuns: calls.filter(c => c.includes('mirror')).length,
		output: res.stdout + res.stderr,
		read: file => fs.readFileSync(path.join(dir, RESOURCE, 'acf-json', file), 'utf8'),
		status: res.status,
		uploaded: calls.some(isUpload),
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
	let run = await deploy({ local: { 'g.json': group('g', 100) }, status: 1, stderr: MISSING_FOLDER.pureFtpd });
	assert.equal(run.uploaded, true);
	assert.equal(run.status, 0);

	// vsftpd's bare 550, with the themes folder showing the theme isn't there yet
	run = await deploy({ local: { 'g.json': group('g', 100) }, status: 1, stderr: BARE_550,
		listPath: '/wp-content/themes', list: '/wp-content/themes/other/\n' });
	assert.equal(run.uploaded, true);
	assert.equal(run.status, 0);
});

// a 550 is also how FTP says a folder is refused, and a folder FDK can't read may still take an
// upload: its field groups would be overwritten unseen (fabrica-dev-kit-3of)
test('a remote acf-json that is refused, or a 550 nothing settles, stops before the upload', async () => {
	const cases = [
		{ stderr: DENIED_FOLDER.pureFtpd, listPath: '/wp-content/themes/mytheme', list: '/wp-content/themes/mytheme/acf-json/\n' },
		{ stderr: DENIED_FOLDER.sftp },
		// there, but vsftpd won't enter it
		{ stderr: BARE_550, listPath: '/wp-content/themes/mytheme', list: '/wp-content/themes/mytheme/acf-json/\n/wp-content/themes/mytheme/style.css\n' },
		// vsftpd sends a folder it can't read as an empty one
		{ stderr: BARE_550, listPath: '/wp-content/themes/mytheme', list: '' },
	];
	for (const { stderr, ...listing } of cases) {
		const run = await deploy({ local: { 'g.json': group('g', 100) }, status: 1, stderr, ...listing });
		assert.equal(run.uploaded, false, stderr);
		assert.equal(run.status, 1);
		// the cause, as lftp printed it (the stub's password 'p' is masked out of it)
		assert.match(run.output, /Access failed: .*(Permission denied|Failed to change directory)/);
		assert.match(run.output, /Couldn't read the 'acf-json' folder of 'mytheme'/);
		assert.match(run.output, /--skip acf/);
	}
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
	assert.match(run.output, /isn't in a git repository, or its repository ignores it/);
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

// ——— --backup, its own step before the upload ————

// a remote-to-remote mirror needed a URL target, which made a home-relative path absolute, and
// leaned on FXP, which shared hosts refuse (fabrica-dev-kit-dy8, fabrica-dev-kit-e64)
test('without SSH, the backup passes through this machine, then the upload runs', async () => {
	const run = await deploy({ noAcfDir: true, backup: true, existsStatus: 0 });
	assert.equal(run.status, 0);
	assert.match(run.backup, /mirror --verbose=1 \/wp-content\/themes\/mytheme \S*fdk-backup-mytheme_/);
	assert.match(run.backup, /mirror --reverse --verbose=1 \S*fdk-backup-mytheme_\S* \/wp-content\/themes\/mytheme_/);
	assert.doesNotMatch(run.backup, /use-fxp|mirror \S+ ftp:\/\//);
	assert.ok(run.calls.indexOf(run.backup) < run.calls.indexOf(run.upload), 'the backup should run first');
	assert.match(run.output, /takes about as long as a full upload/);
});

test('with an SSH key, the backup is one cp -a on the server', async () => {
	const run = await deploy({ noAcfDir: true, backup: true, existsStatus: 0, sshKey: true });
	assert.equal(run.status, 0);
	assert.match(run.backup, /^ssh -i \/key .*u@ftp\.test cp -a '\/wp-content\/themes\/mytheme' '\/wp-content\/themes\/mytheme_/);
	// the stub refuses stdin by failing, which would show here as a copy through this machine
	assert.ok(!run.calls.some(call => call.includes('fdk-backup-')), 'nothing should pass through this machine');
	assert.doesNotMatch(run.output, /ssh was handed stdin/);
	assert.equal(run.uploaded, true);
});

// a key gets the login, but an SFTP-only host refuses the shell `cp` needs
test('a login refused a shell says what ssh said, then backs up through this machine', async () => {
	const run = await deploy({ noAcfDir: true, backup: true, existsStatus: 0, sshKey: true, sshStatus: 1 });
	assert.equal(run.status, 0);
	assert.match(run.output, /The copy over SSH failed: This service allows sftp connections only\.\nCopying through this machine instead/);
	const copy = run.calls.findIndex(call => call.includes('fdk-backup-'));
	assert.ok(copy > run.calls.indexOf(run.backup), 'the copy through this machine should follow the ssh attempt');
	assert.ok(copy < run.calls.indexOf(run.upload), 'the backup should run before the upload');
});

test('an ssh that cannot be started says why, then backs up through this machine', async () => {
	const run = await deploy({ noAcfDir: true, backup: true, existsStatus: 0, sshKey: true, sshAbsent: true });
	assert.equal(run.status, 0);
	assert.match(run.output, /The copy over SSH failed: spawnSync ssh ENOENT/);
	assert.ok(run.calls.some(call => call.includes('fdk-backup-')));
	assert.equal(run.uploaded, true);
});

// the upload is a separate run, so a failed backup reads as nothing sent rather than a partial upload
for (const [route, options] of [['lftp', { backupStatus: 1 }], ['SSH and then lftp', { sshKey: true, sshStatus: 1, backupStatus: 1 }]]) {
	test(`a backup that fails over ${route} stops the deploy before anything is uploaded`, async () => {
		const run = await deploy({ noAcfDir: true, backup: true, existsStatus: 0, ...options });
		assert.equal(run.status, 1);
		assert.equal(run.uploaded, false);
		assert.match(run.output, /live copy is untouched/);
		assert.match(run.output, /not uploaded: mytheme/);
		assert.doesNotMatch(run.output, /may hold a partial copy/);
	});
}

// fail-fast would otherwise abort a legitimate first deploy on the backup of a folder that was
// never there
test('nothing is backed up on a first deploy, and the upload still happens', async () => {
	for (const existsStderr of [MISSING_FOLDER.sftp, BARE_550]) {
		const run = await deploy({ noAcfDir: true, backup: true, existsStatus: 1, existsStderr,
			listPath: '/wp-content/themes', list: '/wp-content/themes/other/\n' });
		assert.equal(run.status, 0);
		assert.equal(run.uploaded, true);
		assert.equal(run.backup, '', 'no backup should have run');
		assert.match(run.output, /Nothing to back up/);
	}
});

// skipping the backup of a folder that is there but refused would leave the upload uncopied
test('a backup probe refused, or a 550 nothing settles, stops the deploy rather than skipping the backup', async () => {
	for (const [existsStderr, list] of [[DENIED_FOLDER.pureFtpd, '/wp-content/themes/mytheme/\n'], [BARE_550, '/wp-content/themes/mytheme/\n'], [BARE_550, '']]) {
		const run = await deploy({ noAcfDir: true, backup: true, existsStatus: 1, existsStderr,
			listPath: '/wp-content/themes', list });
		assert.equal(run.status, 1);
		assert.equal(run.uploaded, false);
		assert.equal(run.backup, '');
		assert.doesNotMatch(run.output, /Nothing to back up/);
		assert.match(run.output, /Couldn't tell whether 'mytheme' is already on the server/);
		assert.match(run.output, /deploy without '--backup'/);
	}
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
	assert.match(run.output, /'mytheme' isn't ready to deploy:\n  - vendor: it has a 'composer.json' and no 'vendor\/autoload\.php'/);
	assert.match(run.output, /re-run with '--skip vendor' to deploy regardless/);
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
	assert.match(run.output, /isn't ready to deploy:\n  - uncommitted: it has uncommitted changes this deploy would upload:\n      src\/index\.js\n[^-]*Deploy of 'mytheme' stopped/);
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

test('a dry run that fails stops the upload, however it words the failure', async () => {
	let run = await deploy({ noAcfDir: true, params: ['--delete'], dryRunStatus: 1, stderr: BROKEN_PULL });
	assert.equal(run.uploaded, false);
	assert.match(run.output, /max-retries exceeded/);
	assert.match(run.output, /the server couldn't say which folders '--delete' would remove/);

	// a 550 from inside the dry run is no proof the resource isn't on the server
	run = await deploy({ noAcfDir: true, params: ['--delete'], dryRunStatus: 1, stderr: BARE_550 });
	assert.equal(run.uploaded, false);
	assert.match(run.output, /the server couldn't say which folders '--delete' would remove/);
});

test('a resource not on the server yet has nothing for --delete to remove, and no dry run is made', async () => {
	let run = await deploy({ noAcfDir: true, params: ['--delete'], existsStatus: 1, existsStderr: BARE_550,
		listPath: '/wp-content/themes', list: '/wp-content/themes/other/\n' });
	assert.equal(run.uploaded, true);
	assert.equal(run.status, 0);
	assert.equal(run.dryRuns, 0);

	// refused is not missing: there is no telling what '--delete' would remove
	run = await deploy({ noAcfDir: true, params: ['--delete'], existsStatus: 1, existsStderr: DENIED_FOLDER.pureFtpd,
		listPath: '/wp-content/themes', list: '/wp-content/themes/mytheme/\n' });
	assert.equal(run.uploaded, false);
	assert.equal(run.status, 1);
	assert.match(run.output, /the server couldn't say which folders '--delete' would remove/);
	assert.match(run.output, /--skip delete/);

	run = await deploy({ noAcfDir: true, params: ['--delete'], existsStatus: 1, existsStderr: BROKEN_PULL });
	assert.equal(run.uploaded, false);
	assert.match(run.output, /the server couldn't say which folders '--delete' would remove/);
});

// the checks run before the backup, so the dry run copies nothing and a refused resource keeps no copy
test('--backup runs after the dry run, never in it, and never for a resource the checks refuse', async () => {
	let run = await deploy({ noAcfDir: true, backup: true, params: ['--delete'] });
	assert.equal(run.uploaded, true);
	assert.equal(run.dryRuns, 1);
	assert.doesNotMatch(run.dryRun, /fdk-backup-|cp -a/);
	assert.ok(run.calls.indexOf(run.dryRun) < run.calls.indexOf(run.backup), 'the dry run should come before the backup');

	run = await deploy({ noAcfDir: true, backup: true, strict: true, params: ['--delete'],
		dryRun: 'rm -r ftp://u@ftp.test/wp-content/themes/mytheme/vendor\n' });
	assert.equal(run.uploaded, false);
	assert.equal(run.backup, '', 'a refused resource should not be backed up');
});

// --force skips the checks, and the stale-build hint is no check
test('--force still warns about a build older than its source', async () => {
	const run = await deploy({ noAcfDir: true, force: true, extra: { 'build/index.js': 'ok()', 'src/index.js': 'x' }, uncommitted: { 'src/index.js': 'y' } });
	assert.equal(run.uploaded, true);
	assert.match(run.output, /'mytheme' source was edited after its build output last changed/);
	assert.doesNotMatch(run.output, /isn't ready to deploy/);
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

test("a 'vendor/' with no 'autoload.php' is no install", async () => {
	const run = await deploy({ noAcfDir: true, extra: { 'composer.json': '{}', 'vendor/.keep': '' } });
	assert.equal(run.uploaded, false);
	assert.match(run.output, /no 'vendor\/autoload\.php': run 'composer install' first/);
});

// a mirror without `--delete` leaves the server's copy of a deleted file alone
test('a deletion counts as an uncommitted upload only with --delete', async () => {
	const deleted = { noAcfDir: true, extra: { 'gone.php': '<?php' }, removed: ['gone.php'] };
	let run = await deploy(deleted);
	assert.equal(run.uploaded, true);
	assert.equal(run.status, 0);

	run = await deploy({ ...deleted, params: ['--delete'] });
	assert.equal(run.uploaded, false);
	assert.match(run.output, /it has uncommitted changes this deploy would upload:\n      gone\.php/);
});

// a file deleted and a folder of the same name added in its place can't both be laid out
test('a file replaced by a folder of the same name is checked rather than crashing the deploy', async () => {
	const run = await deploy({ noAcfDir: true, params: ['--delete'], extra: { lib: '<?php' }, removed: ['lib'],
		replacing: { 'lib/x.php': '<?php' } });
	assert.equal(run.uploaded, false);
	assert.doesNotMatch(run.output, /Error deploying/);
	assert.match(run.output, /it has uncommitted changes this deploy would upload:\n      lib\/x\.php/);
});

test("a 'package.json' that isn't JSON is reported, not thrown", async () => {
	const run = await deploy({ noAcfDir: true, extra: { 'package.json': '{ "scripts":' } });
	assert.equal(run.uploaded, false);
	assert.doesNotMatch(run.output, /Error deploying/);
	assert.match(run.output, /  - build: its 'package\.json' isn't valid JSON/);
	assert.match(run.output, /re-run with '--skip build'/);
});

// git takes a `~` literally, so the ACF preflight read a resource under it as no repository
test('newer server groups of a resource configured under ~ are pulled as in any repository', async () => {
	const run = await deploy({ home: true, local: { 'g.json': group('g', 100) }, server: { 'g.json': group('g', 900) } });
	assert.equal(run.uploaded, false);
	assert.match(run.output, /pulled into the working tree/);
	assert.doesNotMatch(run.output, /isn't in a git repository/);
	assert.equal(run.read('g.json'), group('g', 900));
});

// ——— --skip: one named check off for one run ————

test('--skip with a name that is no check is an error naming the checks', async () => {
	const run = await deploy({ noAcfDir: true, skip: ['vendor,vendro'] });
	assert.equal(run.status, 1);
	assert.equal(run.lftpRuns, 0);
	assert.match(run.output, /No check named 'vendro': the checks are acf, vendor, build, webpack, uncommitted, delete/);
});

const failingCheck = {
	acf: { local: { 'g.json': group('g', 100) }, server: { 'g.json': group('g', 900) } },
	vendor: { noAcfDir: true, extra: { 'composer.json': '{}' } },
	build: { noAcfDir: true, extra: { 'package.json': JSON.stringify({ scripts: { build: 'wp-scripts build' } }) } },
	webpack: { noAcfDir: true, extra: { 'build/index.js': 'function webpackMissingModule() {}' } },
	uncommitted: { noAcfDir: true, uncommitted: { 'new.php': '<?php' } },
	delete: { noAcfDir: true, params: ['--delete'], dryRun: 'rm -r ftp://u@ftp.test/wp-content/themes/mytheme/vendor\n' },
};
for (const [check, scenario] of Object.entries(failingCheck)) {
	test(`'${check}' stops the upload, names '--skip ${check}', and is skipped by it`, async () => {
		let run = await deploy(scenario);
		assert.equal(run.uploaded, false);
		assert.match(run.output, new RegExp(`--skip ${check}'`));

		run = await deploy({ ...scenario, skip: [check] });
		assert.equal(run.uploaded, true, run.output);
		assert.equal(run.status, 0);
		if (check === 'acf') { assert.equal(run.read('g.json'), group('g', 100)); }
		if (check === 'delete') { assert.equal(run.dryRuns, 0); }
	});
}

test('--strict combines with --skip and refuses on the checks left; repeated --skip adds up', async () => {
	const failing = { noAcfDir: true, params: ['--delete'], dryRun: 'rm -r ftp://u@ftp.test/wp-content/themes/mytheme/vendor\n',
		extra: { 'composer.json': '{}' }, uncommitted: { 'new.php': '<?php' } };
	let run = await deploy({ ...failing, strict: true, skip: ['vendor,uncommitted'] });
	assert.equal(run.uploaded, false);
	assert.doesNotMatch(run.output, /cannot be used with/);
	assert.doesNotMatch(run.output, /composer\.json|new\.php/);
	assert.match(run.output, /re-run with '--skip delete' to deploy regardless/);

	run = await deploy({ ...failing, strict: true, skip: ['vendor', 'uncommitted', 'delete'] });
	assert.equal(run.uploaded, true);
	assert.equal(run.status, 0);

	// every failing check is named, once each
	run = await deploy(failing);
	assert.match(run.output, /re-run with '--skip vendor,uncommitted,delete' to deploy regardless/);
});
