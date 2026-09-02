'use strict';

const assert = require('node:assert/strict'),
	{ after, before, describe, test } = require('node:test'),
	{ spawnSync } = require('child_process'),
	fs = require('fs'),
	path = require('path');

const { LFTP_DEFAULTS, pullRemoteAcfJson, remoteFolderExists } = require('../../lib/deploy'),
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

		test('a rejected sftp password reads as null', () => {
			const dest = path.join(makeTmpDir('fdk-live-pull-'), 'copy'),
				// BatchMode stops ssh sitting at a password prompt
				commands = commandsFor('sftp').map(command => command
					.replace('fdk:secret@', 'fdk:wrong@')
					.replace('-o StrictHostKeyChecking=yes', '-o StrictHostKeyChecking=yes -o BatchMode=yes'));
			assert.equal(pullRemoteAcfJson(commands, 'acf-json', dest), null);
		});
	});
