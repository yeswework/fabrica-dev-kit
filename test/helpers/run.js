'use strict';

const { spawnSync } = require('child_process'),
	path = require('path');

const FDK = path.join(__dirname, '..', '..', 'index.js');

// The CLI as a user runs it. `index.js` is a shell/node hybrid whose first two lines re-exec node,
// so invoke it through node directly rather than relying on the shim and an executable bit
const runFdk = (args, { cwd, env = {} } = {}) =>
	spawnSync(process.execPath, [FDK, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });

// Several code paths end in `halt`, which calls `process.exit` and would take the test runner down
// with it. Run those in a child. `code` is evaluated with the repository root as its base, so
// `require('./lib/config')` resolves the way it does from `index.js`
const runNode = (code, { cwd, env = {} } = {}) =>
	spawnSync(process.execPath, ['-e', code], {
		cwd: cwd || path.join(__dirname, '..', '..'),
		encoding: 'utf8',
		env: { ...process.env, ...env },
	});

// `require` of a repository module from inside `runNode` code, whatever the child's cwd is
const requireLib = name => `require(${JSON.stringify(path.join(__dirname, '..', '..', 'lib', name))})`;

module.exports = { FDK, requireLib, runFdk, runNode };
