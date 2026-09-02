'use strict';

const fs = require('fs'),
	os = require('os'),
	path = require('path');

// Every temporary tree the suite builds goes through here, so one `cleanTmpDirs()` in an `after`
// hook is enough to leave no litter in the system temp folder whatever the test did
const roots = [];

const makeTmpDir = (prefix = 'fdk-test-') => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	roots.push(dir);
	return dir;
};

const cleanTmpDirs = () => {
	while (roots.length) {
		fs.rmSync(roots.pop(), { recursive: true, force: true });
	}
};

module.exports = { cleanTmpDirs, makeTmpDir };
