'use strict';

const fs = require('fs'),
	path = require('path');

const { makeTmpDir } = require('./tmpdir');

// A directory of fake executables to put at the front of PATH. Each one appends its name and
// arguments to a shared log before running the body it was given, so a test can assert on the
// command a binary was actually called with rather than on whatever it printed. The log is shared
// across every stub in the folder, which is why each entry carries the name.
//
//   const lftp = stubBin({ lftp: 'exit 0' });
//   await runFdk(['deploy'], { env: { PATH: lftp.path } });
//   assert.ok(lftp.calls().some(call => call.includes('--reverse')));
//
// `absent` names commands the test needs to be *missing*: they get no stub, and PATH is narrowed
// to the stub folder so the developer's own copy can't stand in. `isolate` narrows PATH the same
// way without naming anything — use it when every binary the code path reaches is stubbed and you
// want to keep it that way.
const stubBin = (stubs, { absent = [], isolate = false } = {}) => {
	const dir = makeTmpDir('fdk-stub-bin-'),
		log = path.join(dir, 'invocations.log');
	fs.writeFileSync(log, '');

	for (const [name, body] of Object.entries(stubs)) {
		const file = path.join(dir, name);
		// NUL-terminated records: a command line can contain anything else, newlines included
		fs.writeFileSync(file, `#!/bin/sh\nprintf '%s\\0' "${name} $*" >> '${log}'\n${body}\n`);
		fs.chmodSync(file, 0o755);
	}

	const narrowed = isolate || absent.length > 0;
	// `node` has to stay reachable for helpers that re-enter it in a child process
	if (narrowed) {
		fs.symlinkSync(process.execPath, path.join(dir, 'node'));
	}

	return {
		dir,
		// one `<name> <arguments>` entry per invocation, in call order
		calls: () => fs.readFileSync(log, 'utf8').split('\0').slice(0, -1),
		// PATH to hand a child process. Narrowed to this directory alone when isolated
		path: narrowed ? dir : `${dir}:${process.env.PATH}`,
	};
};

module.exports = { stubBin };
