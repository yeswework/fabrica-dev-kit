'use strict';

const { execFileSync, spawnSync } = require('child_process'),
	fs = require('fs'),
	path = require('path');

const { makeTmpDir } = require('./tmpdir');

// Real servers for the opt-in tier. The wording an FTP server puts after its 550 is its own, not
// lftp's, and it is the thing the deploy guard has to see through — no stub can stand in for that.
//
// Names are prefixed and ports are high so a run can't collide with anything else on the machine.
const SERVERS = {
	'pure-ftpd': {
		container: 'fdk-test-pureftpd',
		image: 'stilliard/pure-ftpd',
		port: 2132,
		run: ['-p', '2132:21', '-p', '30100-30104:30100-30104',
			'-e', 'PUBLICHOST=localhost', '-e', 'FTP_USER_NAME=fdk', '-e', 'FTP_USER_PASS=secret',
			'-e', 'FTP_USER_HOME=/home/fdk', '-e', 'FTP_PASSIVE_PORTS=30100:30104'],
	},
	vsftpd: {
		container: 'fdk-test-vsftpd',
		image: 'fauria/vsftpd',
		port: 2133,
		run: ['-p', '2133:21', '-p', '21200-21204:21200-21204',
			'-e', 'FTP_USER=fdk', '-e', 'FTP_PASS=secret', '-e', 'PASV_ADDRESS=127.0.0.1',
			'-e', 'PASV_MIN_PORT=21200', '-e', 'PASV_MAX_PORT=21204'],
	},
	sftp: {
		container: 'fdk-test-sftp',
		image: 'atmoz/sftp',
		port: 2232,
		run: ['-p', '2232:22'],
		// atmoz/sftp chroots to the user's home and only pre-declared folders are writable
		args: ['fdk:secret:::acf-json,empty-json'],
	},
};

const FTP_TUNING = ['set ftp:ssl-allow no', 'set ftp:passive-mode yes'],
	BOUNDED = ['set net:max-retries 1', 'set net:timeout 5'];

let knownHosts;

// lftp drives sftp through ssh, which needs the host key in a known_hosts file. Scoped to this
// run rather than the user's own, and with strict checking left on — a throwaway container is no
// reason to turn host-key verification off
const sftpCommands = () => [...BOUNDED,
	`set sftp:connect-program "ssh -a -x -p ${SERVERS.sftp.port} -o UserKnownHostsFile=${knownHosts} -o StrictHostKeyChecking=yes"`,
	`open sftp://fdk:secret@127.0.0.1:${SERVERS.sftp.port}`];

const commandsFor = name => name === 'sftp'
	? sftpCommands()
	: [...BOUNDED, ...FTP_TUNING, `open ftp://fdk:secret@127.0.0.1:${SERVERS[name].port}`];

const lftp = (commands, extra = []) =>
	spawnSync('lftp', ['-c', [...commands, ...extra].join('; ') + '; '],
		{ encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });

const docker = (args, options = {}) => spawnSync('docker', args, { encoding: 'utf8', ...options });

const have = cmd => spawnSync('sh', ['-c', `hash ${cmd} 2>/dev/null`]).status === 0;

// what the tier needs, reported as one string so a skip message can say what is missing
const missingRequirements = () => ['docker', 'lftp', 'ssh-keyscan']
	.filter(cmd => !have(cmd))
	.concat(docker(['info']).status === 0 ? [] : ['a running Docker daemon']);

const waitFor = (label, check, attempts = 60) => {
	for (let n = 0; n < attempts; n++) {
		if (check()) { return; }
		execFileSync('sleep', ['1']);
	}
	throw new Error(`${label} never became ready`);
};

const startServers = () => {
	for (const { args = [], container, image, run } of Object.values(SERVERS)) {
		docker(['rm', '-f', container], { stdio: 'ignore' });
		const started = docker(['run', '-d', '--name', container, ...run, image, ...args]);
		if (started.status !== 0) {
			throw new Error(`could not start ${container}: ${started.stderr}`);
		}
	}

	knownHosts = path.join(makeTmpDir('fdk-known-hosts-'), 'known_hosts');
	waitFor('the sftp host key', () => {
		const keys = spawnSync('ssh-keyscan', ['-p', String(SERVERS.sftp.port), '127.0.0.1'],
			{ encoding: 'utf8' });
		if (keys.status !== 0 || !keys.stdout.trim()) { return false; }
		fs.writeFileSync(knownHosts, keys.stdout);
		return true;
	});

	for (const name of Object.keys(SERVERS)) {
		waitFor(`${name} on port ${SERVERS[name].port}`, () => lftp(commandsFor(name), ['ls']).status === 0);
	}
};

const stopServers = () => {
	for (const { container } of Object.values(SERVERS)) {
		docker(['rm', '-f', container], { stdio: 'ignore' });
	}
};

// Every server gets the same three remote paths: one folder holding a field group, one folder
// holding nothing, and one that was never created
const FIXTURE_GROUP = JSON.stringify({ key: 'g_live', modified: 500 });

const seedFixtures = () => {
	const staging = makeTmpDir('fdk-live-fixture-'),
		local = path.join(staging, 'g.json');
	fs.writeFileSync(local, FIXTURE_GROUP);

	for (const name of Object.keys(SERVERS)) {
		// the sftp chroot already holds both folders and refuses `mkdir` at its root
		const prepare = name === 'sftp' ? [] : ['mkdir -p acf-json', 'mkdir -p empty-json'],
			result = lftp(commandsFor(name), [...prepare, `put -O acf-json ${local} -o g.json`]);
		if (result.status !== 0) {
			throw new Error(`could not seed ${name}: ${result.stderr}`);
		}
	}

	// `file://` needs no server at all, but exercises a fourth wording out of lftp
	const fileRoot = makeTmpDir('fdk-live-file-');
	fs.mkdirSync(path.join(fileRoot, 'acf-json'));
	fs.mkdirSync(path.join(fileRoot, 'empty-json'));
	fs.writeFileSync(path.join(fileRoot, 'acf-json', 'g.json'), FIXTURE_GROUP);
	return fileRoot;
};

module.exports = {
	FIXTURE_GROUP, SERVERS, commandsFor, missingRequirements, seedFixtures, startServers, stopServers,
};
