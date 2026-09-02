'use strict';

const fs = require('fs'),
	path = require('path');

const { makeTmpDir } = require('./tmpdir');

// A directory of fake executables to put at the front of PATH. Each one appends its full command
// line to a shared log before running the body it was given, so a test can assert on the
// arguments a command was actually called with rather than on whatever it printed.
//
//   const lftp = stubBin({ lftp: 'exit 0' });
//   runFdk(['deploy'], { env: { PATH: lftp.path } });
//   assert.ok(lftp.calls().some(c => c.includes('--reverse')));
//
// `absent` names commands to hide rather than fake: the stub directory gets nothing for them and
// PATH is narrowed to itself, which is how a missing binary is simulated.
const stubBin = (stubs, { absent = [] } = {}) => {
	const dir = makeTmpDir('fdk-stub-bin-'),
		log = path.join(dir, 'invocations.log');
	fs.writeFileSync(log, '');

	for (const [name, body] of Object.entries(stubs)) {
		const file = path.join(dir, name);
		// NUL-terminated records: a command line can contain anything else, newlines included
		fs.writeFileSync(file, `#!/bin/sh\nprintf '%s\\0' "$*" >> '${log}'\n${body}\n`);
		fs.chmodSync(file, 0o755);
	}

	// `node` has to stay reachable for helpers that re-enter it in a child process
	if (absent.length) {
		fs.symlinkSync(process.execPath, path.join(dir, 'node'));
	}

	return {
		dir,
		// one entry per invocation, in call order
		calls: () => fs.readFileSync(log, 'utf8').split('\0').slice(0, -1),
		// PATH to hand a child process. With `absent`, nothing but this directory is on it
		path: absent.length ? dir : `${dir}:${process.env.PATH}`,
	};
};

module.exports = { stubBin };
