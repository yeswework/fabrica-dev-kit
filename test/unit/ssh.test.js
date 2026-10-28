'use strict';

const assert = require('node:assert/strict'),
	{ test } = require('node:test'),
	os = require('os');

const { sshCommand } = require('../../lib/ssh'),
	{ requireLib, runNode } = require('../helpers/run');

// The argv sshCommand builds from a connect-program, without the options it always appends
const argvOf = (program, port) => sshCommand({ scheme: 'sftp', host: 'h', user: 'u', port,
	commands: [`set sftp:connect-program "${program}"`] })?.slice(0, -5);

// ——— sshCommand: reading sftp:connect-program ————

test('a quoted key path with spaces stays one argument', () => {
	assert.deepEqual(argvOf("ssh -a -i '/Users/me/My Keys/id'"), ['ssh', '-a', '-i', '/Users/me/My Keys/id']);
	assert.deepEqual(argvOf('ssh -i \\"/k e y\\"'), ['ssh', '-i', '/k e y']);
	assert.deepEqual(argvOf('ssh -i /k\\\\ e'), ['ssh', '-i', '/k e']);
});

test('a key given in any form ssh takes counts as a key', () => {
	for (const program of ['ssh -i /k', 'ssh -i/k', 'ssh -axi /k', 'ssh -o IdentityFile=/k', 'ssh -oIdentityFile=/k',
		"ssh -o 'IdentityFile /k'", 'ssh -o identityfile=/k']) {
		assert.ok(argvOf(program), program);
	}
	assert.deepEqual(argvOf('ssh -i~/k'), ['ssh', '-i~/k']);
	assert.deepEqual(argvOf('ssh -i ~/k'), ['ssh', '-i', `${os.homedir()}/k`]);
});

test('without a key, or with -i only as another option\'s value, there is no ssh route', () => {
	for (const program of ['ssh -a -x', 'ssh -o HostKeyAlgorithms=+ssh-rsa', 'ssh -l -i', 'ssh -o -i', 'ssh -o User=i']) {
		assert.equal(argvOf(program), undefined, program);
	}
});

test("the section's port is added only when the connect-program gives none, however it is written", () => {
	assert.deepEqual(argvOf('ssh -i /k', 22).slice(-2), ['-p', '22']);
	assert.deepEqual(argvOf('ssh -i /k -p2222', 22), ['ssh', '-i', '/k', '-p2222']);
	assert.deepEqual(argvOf('ssh -xp 2222 -i /k', 22), ['ssh', '-xp', '2222', '-i', '/k']);
});

// ——— sshSite: running WP-CLI ————

// spawnSync's own error when output passes maxBuffer, which isn't ssh failing to run
test('WP-CLI output too large to read is named as that, not as ssh failing to run', () => {
	const res = runNode(`const cp = require('child_process');
		cp.spawnSync = () => ({ error: Object.assign(new Error('spawnSync ssh ENOBUFS'), { code: 'ENOBUFS' }) });
		const { sshSite } = ${requireLib('ssh')};
		try { sshSite({ host: 'h' }, ['ssh']).home(); } catch (ex) { console.log(ex.message); }`);
	assert.match(res.stdout, /WP-CLI over SSH on 'h' sent more than the 1GB of output FDK reads/, res.stderr);
	assert.doesNotMatch(res.stdout, /Could not run ssh/);
});
