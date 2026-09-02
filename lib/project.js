'use strict';

const findup = require('findup-sync'),
	path = require('path'),
	sh = require('shelljs');

const { echo } = require('./util');

// Shared mutable project state. Modules import this object and write to its properties;
// it is never reassigned, so every `require` holds the same reference. Don't spread or
// clone it — a copy stops seeing later writes
const project = {
	isInstalled: false, // command executed inside an already setup project?
};

// check if FDK is being executed inside a project that's already been setup and load its settings
const loadProjectSettings = () => {
	let rootDir = findup('.setup.yml', { cwd: process.cwd() });
	if (!rootDir) {
		rootDir = findup('config/setup.yml', { cwd: process.cwd() });
		if (!rootDir) { return; }
		rootDir = path.join(rootDir, '..');
		project.version = 2; // set up with previous FDK version
	}

	rootDir = path.normalize(path.dirname(rootDir));
	if (!sh.test('-f', `${rootDir}/docker-compose.yml`)
		|| !sh.test('-f', `${rootDir}/package.json`)) { return; }

	if (rootDir != process.cwd()) {
		// change to project root folder and add `package.json` scripts to commands
		sh.cd(rootDir);
		echo(`Working directory changed to ${rootDir}`);
	}

	project.isInstalled = true;
	project.version = project.version || 3;
	project.rootDir = rootDir;
	project.package = require(`${rootDir}/package.json`);
	project.slug = project.package.name;
	project.title = project.package.description;
};

module.exports = { loadProjectSettings, project };
