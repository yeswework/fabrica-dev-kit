'use strict';

const { spawn, spawnSync } = require('child_process'),
	path = require('path');

const FDK = path.join(__dirname, '..', '..', 'index.js'),
	// long enough for a slow machine, short enough that a hang is reported rather than waited out:
	// FDK's own wait for the web container runs to six minutes
	RUN_TIMEOUT = 60000;

// The CLI as a user runs it. `index.js` is a shell/node hybrid whose first two lines re-exec node,
// so invoke it through node directly rather than relying on the shim and an executable bit.
//
// Asynchronous on purpose: `spawnSync` would block this process's event loop, so a test that has
// to answer the CLI while it runs — an HTTP server standing in for the web container, say — would
// deadlock until FDK gave up on its own
const runFdk = (args, { cwd, env = {}, timeout = RUN_TIMEOUT } = {}) => new Promise((resolve, reject) => {
	const child = spawn(process.execPath, [FDK, ...args], { cwd, env: { ...process.env, ...env } });
	let stdout = '',
		stderr = '';
	const timer = setTimeout(() => {
		child.kill('SIGKILL');
		reject(new Error(`\`fdk ${args.join(' ')}\` did not finish within ${timeout}ms`));
	}, timeout);
	child.stdout.on('data', chunk => { stdout += chunk; });
	child.stderr.on('data', chunk => { stderr += chunk; });
	child.on('close', status => { clearTimeout(timer); resolve({ status, stderr, stdout }); });
});

// Several code paths end in `halt`, which calls `process.exit` and would take the test runner down
// with it. Run those in a child. `code` is evaluated with the repository root as its base, so
// `require('./lib/config')` resolves the way it does from `index.js`
const runNode = (code, { cwd, env = {}, timeout = RUN_TIMEOUT } = {}) =>
	spawnSync(process.execPath, ['-e', code], {
		cwd: cwd || path.join(__dirname, '..', '..'),
		encoding: 'utf8',
		env: { ...process.env, ...env },
		timeout,
	});

// `require` of a repository module from inside `runNode` code, whatever the child's cwd is
const requireLib = name => `require(${JSON.stringify(path.join(__dirname, '..', '..', 'lib', name))})`;

module.exports = { FDK, requireLib, runFdk, runNode };
