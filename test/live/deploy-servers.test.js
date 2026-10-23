'use strict';

const assert = require('node:assert/strict'),
	{ after, before, describe, test } = require('node:test'),
	{ spawnSync } = require('child_process'),
	fs = require('fs'),
	path = require('path');

const { LFTP_DEFAULTS, backupRemoteFolder, deletedFolders, ignoreParams, payloadProblems, pullRemoteAcfJson, remoteCommands, remoteFolderExists, uncommittedUploads } = require('../../lib/deploy'),
	{ makeProject } = require('../helpers/project'),
	{ runFdk } = require('../helpers/run'),
	{ FIXTURE_GROUP, SERVERS, commandsFor, missingRequirements, seedFixtures, startServers, stopServers }
		= require('../helpers/ftp-servers'),
	{ cleanTmpDirs, makeTmpDir } = require('../helpers/tmpdir');

// This tier is opt-in (`npm run test:live`) because it needs Docker and lftp. It exists for the one
// thing a stub can't reproduce: what a real server says when a folder isn't there. Three servers,
// three different sentences after the same 550 — which is why the guard matches lftp's own
// `Access failed:` wrapper rather than the wording underneath.
const missing = missingRequirements();

describe('the ACF preflight against real servers',
	{ skip: missing.length ? `needs ${missing.join(', ')}` : false }, () => {
		let fileRoot;

		before(() => {
			startServers();
			fileRoot = seedFixtures();
		}, { timeout: 180000 });

		after(() => { stopServers(); cleanTmpDirs(); });

		const pull = (name, remotePath) => {
			const dest = path.join(makeTmpDir('fdk-live-pull-'), 'copy'),
				commands = name === 'file' ? [`open file://${fileRoot}`] : commandsFor(name);
			return { dest, result: pullRemoteAcfJson(commands, remotePath, dest) };
		};

		const schemes = [...Object.keys(SERVERS), 'file'];

		for (const name of schemes) {
			test(`${name}: a folder that isn't there reads as false`, () => {
				assert.equal(pull(name, 'never-created').result, false);
			});

			test(`${name}: a folder holding a group reads as true`, () => {
				const { dest, result } = pull(name, 'acf-json');
				assert.equal(result, true);
				assert.deepEqual(fs.readdirSync(dest), ['g.json']);
			});

			// a copy that arrives but can't be read is worse than one that never arrives: the guard
			// scores it 0 and waves the deploy through — see fabrica-dev-kit-e2c
			test(`${name}: what arrives is readable`, () => {
				const { dest } = pull(name, 'acf-json');
				assert.equal(fs.readFileSync(path.join(dest, 'g.json'), 'utf8'), FIXTURE_GROUP);
			});

			test(`${name}: an empty folder reads as true, with nothing in it`, () => {
				const { dest, result } = pull(name, 'empty-json');
				assert.equal(result, true);
				assert.deepEqual(fs.readdirSync(dest), []);
			});
		}

		// failures must stay distinguishable from an empty server, whatever the transport
		test('a refused connection reads as null', () => {
			const dest = path.join(makeTmpDir('fdk-live-pull-'), 'copy');
			assert.equal(pullRemoteAcfJson(
				['set net:max-retries 1', 'set net:timeout 5', 'open ftp://fdk:secret@127.0.0.1:2199'],
				'acf-json', dest), null);
		});

		test('a rejected FTP password reads as null', () => {
			const dest = path.join(makeTmpDir('fdk-live-pull-'), 'copy');
			assert.equal(pullRemoteAcfJson(
				['set net:max-retries 1', 'set net:timeout 5', 'set ftp:ssl-allow no',
					`open ftp://fdk:wrong@127.0.0.1:${SERVERS.vsftpd.port}`],
				'acf-json', dest), null);
		});

		// `lftp -c` reports only the last command's status, which is why the deploy script now
		// opens with `set cmd:fail-exit yes` — a `--backup` that failed would otherwise be masked
		// by the mirror that follows it. This is the behaviour that claim rests on
		test('cmd:fail-exit is what stops a script at its first failure', () => {
			const dest = path.join(makeTmpDir('fdk-live-failexit-'), 'copy'),
				run = prelude => spawnSync('lftp', ['-c', [...prelude, ...commandsFor('vsftpd'),
					`mirror never-created ${dest}`, 'echo REACHED'].join('; ') + '; '],
				{ encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });

			const masked = run([]);
			assert.equal(masked.status, 0, 'the trailing echo should mask the failed mirror');
			assert.match(masked.stdout, /REACHED/);

			const failFast = run(['set cmd:fail-exit yes']);
			assert.notEqual(failFast.status, 0);
			assert.doesNotMatch(failFast.stdout, /REACHED/, 'nothing after the failure should run');
		});

		// the guard reads a missing folder off lftp's stderr, so fail-exit must not change what
		// it says or the deploy would start refusing first deploys
		test('a missing folder still reads as false with cmd:fail-exit set', () => {
			const dest = path.join(makeTmpDir('fdk-live-pull-'), 'copy');
			assert.equal(
				pullRemoteAcfJson(['set cmd:fail-exit yes', ...commandsFor('vsftpd')], 'never-created', dest),
				false);
		});

		// lftp's own defaults are 1000 retries backing off to a 300s interval, with a 5-minute
		// response timeout, so a host that is down or firewalled never fails — it retries for days
		// with nothing on screen. These two need no server, only a real lftp
		test('an unreachable host fails in seconds rather than retrying for days', () => {
			const dest = path.join(makeTmpDir('fdk-live-pull-'), 'copy'),
				started = Date.now();
			assert.equal(
				pullRemoteAcfJson([...LFTP_DEFAULTS, 'open ftp://fdk:secret@127.0.0.1:2199'],
					'acf-json', dest),
				null);
			const elapsed = Date.now() - started;
			assert.ok(elapsed < 30000, `took ${elapsed}ms; a refused connection should fail in about 5s`);
		});

		test("a project's own retry limit overrides the default", () => {
			const dest = path.join(makeTmpDir('fdk-live-pull-'), 'copy'),
				started = Date.now();
			// as `ftp.commands` would arrive: after the defaults, and `set` is last-wins
			assert.equal(
				pullRemoteAcfJson([...LFTP_DEFAULTS, 'set net:max-retries 1',
					'open ftp://fdk:secret@127.0.0.1:2199'], 'acf-json', dest),
				null);
			const elapsed = Date.now() - started;
			assert.ok(elapsed < 3000, `took ${elapsed}ms; one attempt should fail almost at once`);
		});

		// `--backup` asks this before queueing a copy, so that a first deploy isn't aborted by a
		// backup of a folder that was never there
		test('remoteFolderExists answers three ways against a real server', () => {
			assert.equal(remoteFolderExists(commandsFor('vsftpd'), 'acf-json'), true);
			assert.equal(remoteFolderExists(commandsFor('vsftpd'), 'never-created'), false);
			assert.equal(remoteFolderExists(['set net:max-retries 1', 'set net:timeout 5',
				'set ftp:ssl-allow no', `open ftp://fdk:wrong@127.0.0.1:${SERVERS.vsftpd.port}`],
			'acf-json'), null);
		});

		// by the home-relative path a section's `ftp.path` usually is, and under the dated name a
		// deploy gives it: the old remote-to-remote mirror resolved that path from the server's root
		// instead (fabrica-dev-kit-dy8)
		for (const name of Object.keys(SERVERS)) {
			test(`${name}: a backup copies the folder beside itself, by a relative path`, () => {
				const commands = commandsFor(name),
					theme = makeTmpDir('fdk-live-theme-'),
					backup = `themes/mytheme_${(new Date()).toISOString()}`,
					dest = path.join(makeTmpDir('fdk-live-pull-'), 'copy');
				fs.writeFileSync(path.join(theme, 'style.css'), '/* theme */');
				const upload = spawnSync('lftp', ['-c', [...commands, `mirror --reverse ${theme} themes/mytheme`].join('; ') + '; ']);
				assert.equal(upload.status, 0, 'could not seed the theme');

				assert.equal(backupRemoteFolder({ host: name }, commands, 'themes/mytheme', backup), true);
				assert.equal(pullRemoteAcfJson(commands, backup, dest), true);
				assert.equal(fs.readFileSync(path.join(dest, 'style.css'), 'utf8'), '/* theme */');
			});
		}

		test('a rejected sftp password reads as null', () => {
			const dest = path.join(makeTmpDir('fdk-live-pull-'), 'copy'),
				// BatchMode stops ssh sitting at a password prompt
				commands = commandsFor('sftp').map(command => command
					.replace('fdk:secret@', 'fdk:wrong@')
					.replace('-o StrictHostKeyChecking=yes', '-o StrictHostKeyChecking=yes -o BatchMode=yes'));
			assert.equal(pullRemoteAcfJson(commands, 'acf-json', dest), null);
		});

		// the password reaches lftp through `open --env-password`, out of the script any user can read
		// in `ps`: both transports have to log in that way, and a wrong one still has to fail. Not
		// checked over sftp, where only BatchMode stops ssh asking again, and it refuses any password
		test('a section logs in with its password from the environment, over ftp and sftp', () => {
			const vsftpd = { user: 'fdk', host: '127.0.0.1', port: SERVERS.vsftpd.port,
					commands: ['set ftp:ssl-allow no', 'set ftp:passive-mode yes'] },
				sftp = { scheme: 'sftp', user: 'fdk', host: '127.0.0.1', port: SERVERS.sftp.port,
					commands: commandsFor('sftp').filter(command => !command.startsWith('open ')) };
			for (const ftp of [vsftpd, sftp]) {
				const { commands, password } = remoteCommands({ ...ftp, password: 'secret' });
				assert.ok(!commands.join('; ').includes('secret'));
				assert.equal(remoteFolderExists(commands, 'acf-json', password), true, ftp.scheme || 'ftp');
			}
			const wrong = remoteCommands({ ...vsftpd, password: 'wrong' });
			assert.equal(remoteFolderExists([...wrong.commands.slice(0, -1), 'set net:max-retries 1', wrong.commands.at(-1)],
				'acf-json', wrong.password), null);
		});

		// drift has to see what deploy would upload: `ftp.params` filters apply, and a variant with an
		// `ftp:` of its own is compared with its own server
		test('fdk drift compares through ftp.params filters, against each variant\'s own server', async () => {
			const seed = makeTmpDir('fdk-live-drift-');
			fs.mkdirSync(path.join(seed, 'myplugin'));
			fs.writeFileSync(path.join(seed, 'myplugin', 'index.php'), '<?php // a');
			const seeded = spawnSync('lftp', ['-c', [...commandsFor('vsftpd'), 'mkdir -p wp-content/plugins',
				`mirror --reverse ${path.join(seed, 'myplugin')} wp-content/plugins/myplugin`].join('; ')], { encoding: 'utf8' });
			assert.equal(seeded.status, 0, seeded.stderr);

			const ftp = port => [`    scheme: ftp`, `    host: 127.0.0.1`, `    port: ${port}`, `    user: fdk`, `    password: secret`,
					`    commands: ['set ftp:ssl-allow no', 'set ftp:passive-mode yes', 'set net:max-retries 1', 'set net:timeout 5']`,
					`    params: ['--delete', '--exclude-glob *.map']`],
				config = variants => ['production:', '  ftp:', ...ftp(SERVERS.vsftpd.port), '  plugins: [./myplugin]',
					// can't be deployed (fabrica-dev-kit-hsg), so it is skipped rather than compared
					'production/dry:', '  extend: production', '  ftp:', "    params: ['--dry-run']", ...variants].join('\n') + '\n',
				resources = { myplugin: { files: { 'index.php': '<?php // a', 'app.js.map': '{}' }, git: false } };

			let dir = makeProject({ config: config([]), resources }),
				res = await runFdk(['drift', 'production'], { cwd: dir });
			assert.equal(res.status, 0, res.stdout + res.stderr);
			assert.match(res.stdout, /myplugin: identical/);
			assert.match(res.stderr, /'production\/dry' has no FTP host/);
			assert.doesNotMatch(res.stdout + res.stderr, /secret/);

			dir = makeProject({ config: config(['production/elsewhere:', '  extend: production', '  plugins: [./myplugin]',
				'  ftp:', ...ftp(SERVERS['pure-ftpd'].port)]), resources });
			res = await runFdk(['drift', 'production'], { cwd: dir });
			assert.equal(res.status, 1);
			assert.match(res.stdout, /myplugin: identical/);
			assert.match(res.stdout, /myplugin: not on the server/);
		});

		// the deploy asks lftp, with the upload's own mirror under `--dry-run`, which folders
		// `--delete` would remove, and reads them back out of the URLs each server prints
		for (const name of Object.keys(SERVERS)) {
			test(`${name}: a dry run of the upload names the top-level folders --delete would remove`, () => {
				const seed = makeTmpDir('fdk-live-delete-'),
					local = makeTmpDir('fdk-live-delete-'),
					write = (root, file) => {
						fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
						fs.writeFileSync(path.join(root, file), file);
					};
				['index.php', 'old.php', 'vendor/autoload.php', 'lib/old/a.php', 'lib/b.php'].forEach(file => write(seed, file));
				['index.php', 'lib/b.php'].forEach(file => write(local, file));
				// the sftp chroot refuses `mkdir` at its root, so every server is seeded under `site`
				const remotePath = `site/wp-content/plugins/${name}-plugin`,
					seeded = spawnSync('lftp', ['-c', [...commandsFor(name), `mkdir -p ${path.dirname(remotePath)}`,
						`mirror --reverse ${seed} ${remotePath}`].join('; ')], { encoding: 'utf8' });
				assert.equal(seeded.status, 0, seeded.stderr);

				const mirror = `mirror --reverse --verbose=1 --delete ${local} ${remotePath}`;
				assert.deepEqual(deletedFolders(commandsFor(name), undefined, mirror, remotePath), ['vendor']);
				// and nothing was removed by asking
				const listed = spawnSync('lftp', ['-c', [...commandsFor(name), `cls -1 ${remotePath}/`].join('; ')], { encoding: 'utf8' });
				assert.match(listed.stdout, /vendor/);
			});
		}

		// lftp's dry run takes a target it can't reach for one that isn't there, and exits 0
		test('a dry run that cannot connect reads as null, and a first deploy as nothing to remove', () => {
			const empty = makeTmpDir('fdk-live-delete-');
			assert.equal(deletedFolders(['set net:max-retries 1', 'set net:timeout 5', 'open ftp://fdk:secret@127.0.0.1:2199'],
				undefined, `mirror --reverse --delete ${empty} site/never-created`, 'site/never-created'), null);
			for (const name of Object.keys(SERVERS)) {
				assert.deepEqual(deletedFolders(commandsFor(name), undefined,
					`mirror --reverse --delete ${empty} site/never-created`, 'site/never-created'), [], name);
			}
		});
	});

// The uncommitted-changes check has lftp apply a resource's filters to the paths git reports, so
// only a real lftp can show that a `.distignore`d change doesn't count. No server: it mirrors locally
describe('uncommitted changes deploy would upload, through real lftp filters',
	{ skip: spawnSync('sh', ['-c', 'hash lftp 2>/dev/null']).status ? 'needs lftp' : false }, () => {
		after(cleanTmpDirs);

		test('edits, new files and deletions count, deletions only with --delete; .distignored ones and committed ones do not', () => {
			const dir = makeProject({ resources: { plugin: {
					files: { 'index.php': '<?php', 'gone.php': '<?php', 'kept.php': '<?php', 'old-name.php': '<?php', 'README.md': '#' },
					dirty: { 'index.php': '<?php // edited', 'new dir/new file.php': '<?php', 'README.md': '# edited',
						'docs/guide.md': '#', 'build/index.js.map': '{}' },
				} } }),
				plugin = path.join(dir, 'plugin');
			fs.rmSync(path.join(plugin, 'gone.php'));
			spawnSync('git', ['-C', plugin, 'mv', 'old-name.php', 'new-name.php']);
			const filters = '--exclude-glob README.md --exclude-glob docs/ --exclude-glob *.map';
			assert.deepEqual(uncommittedUploads(plugin, filters, true).sort(),
				['gone.php', 'index.php', 'new dir/new file.php', 'new-name.php']);
			assert.deepEqual(uncommittedUploads(plugin, filters, false).sort(),
				['index.php', 'new dir/new file.php', 'new-name.php']);
		});

		test('a resource below the top of its repository answers relative to itself', () => {
			const dir = makeProject({ resources: { repo: { files: { 'plugin/index.php': '<?php', 'other.php': '<?php' },
					dirty: { 'plugin/index.php': '<?php // edited', 'other.php': '<?php // edited' } } } }),
				plugin = path.join(dir, 'repo', 'plugin');
			assert.deepEqual(uncommittedUploads(plugin, ''), ['index.php']);
		});

		test('a folder outside any repository reads as null', () => {
			assert.equal(uncommittedUploads(makeTmpDir('fdk-live-norepo-'), ''), null);
		});

		// `lib` can't be laid out as a file and a folder at once; it used to throw and leave the
		// layout behind in the temp folder
		test('a file replaced by a folder of the same name is laid out as the folder, and nothing is left in tmp', () => {
			const dir = makeProject({ resources: { plugin: { files: { lib: '<?php', 'index.php': '<?php' } } } }),
				plugin = path.join(dir, 'plugin'),
				tmp = makeTmpDir('fdk-live-tmp-'),
				saved = process.env.TMPDIR;
			fs.rmSync(path.join(plugin, 'lib'));
			fs.mkdirSync(path.join(plugin, 'lib'));
			fs.writeFileSync(path.join(plugin, 'lib', 'x.php'), '<?php');
			process.env.TMPDIR = tmp;
			try {
				assert.deepEqual(uncommittedUploads(plugin, '', true), ['lib/x.php']);
			} finally {
				process.env.TMPDIR = saved;
			}
			assert.deepEqual(fs.readdirSync(tmp), []);
		});

		// a folder deploy leaves out anyway has nothing to lose on the server
		test("a missing 'vendor/' or 'build/' that .distignore leaves out is no problem", () => {
			const dir = makeProject({ resources: { plugin: { files: {
					'composer.json': '{}', 'package.json': JSON.stringify({ scripts: { build: 'wp-scripts build' } }) } } } }),
				plugin = path.join(dir, 'plugin');
			assert.deepEqual(payloadProblems(plugin, ignoreParams(plugin)).map(([check]) => check), ['vendor', 'build']);
			fs.writeFileSync(path.join(plugin, '.distignore'), 'vendor/\n/build/\n');
			assert.deepEqual(payloadProblems(plugin, ignoreParams(plugin)), []);
		});
	});
