'use strict';

const { execFileSync } = require('child_process'),
	fs = require('fs'),
	path = require('path');

const { makeTmpDir } = require('./tmpdir');

// A directory FDK will treat as an installed project: `loadProjectSettings` walks up looking for
// `.setup.yml` and then insists on a `docker-compose.yml` and a `package.json` beside it.
//
//   makeProject({
//     config: 'default:\n  themes:\n    - ./mytheme\n',
//     resources: { mytheme: { files: { 'style.css': '/* x */' }, dirty: {...}, git: false } },
//   })
//
// `files` are written before the initial commit, `dirty` after it, so a test can set up work the
// deploy guard is meant to refuse to overwrite. Pass `git: false` for a resource that is not a
// repository at all.
const makeProject = ({ config, resources = {}, git = true, slug = 'testproj' } = {}) => {
	const dir = makeTmpDir('fdk-project-');
	fs.writeFileSync(path.join(dir, '.setup.yml'), `slug: ${slug}\n`);
	fs.writeFileSync(path.join(dir, 'docker-compose.yml'), 'services: {}\n');
	fs.writeFileSync(path.join(dir, 'package.json'),
		JSON.stringify({ name: slug, description: 'Test Project', scripts: {} }));
	if (config !== undefined) { fs.writeFileSync(path.join(dir, 'config.yml'), config); }

	for (const [name, spec] of Object.entries(resources)) {
		const root = path.join(dir, name),
			write = (file, body) => {
				fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
				fs.writeFileSync(path.join(root, file), body);
			};
		fs.mkdirSync(root, { recursive: true });
		for (const [file, body] of Object.entries(spec.files || {})) { write(file, body); }

		if (spec.git ?? git) {
			const run = args => execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
			run(['init', '-q']);
			run(['add', '-A']);
			run(['-c', 'user.email=test@fdk', '-c', 'user.name=test', 'commit', '-qm', 'initial']);
		}
		// after the commit, so these read as uncommitted work
		for (const [file, body] of Object.entries(spec.dirty || {})) { write(file, body); }
	}
	return dir;
};

module.exports = { makeProject };
