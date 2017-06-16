#!/usr/bin/env node --harmony

'use strict';

const program = require('commander'),
	merge = require('lodash/merge'),
	path = require('path'),
	sh = require('shelljs'),
	yaml = require('js-yaml');

// Fabrica Dev Kit version
const VERSION = '1.0.1',
// maximum time (in seconds) to wait for wp container to be up and running
	WAIT_WP_CONTAINER_TIMEOUT = 360;

// output functions
let echo = message => {
	console.log(`\x1b[7m[Fabrica]\x1b[27m 🏭  ${message}`);
}
let halt = message => {
	console.error(`\x1b[1m\x1b[41m[Fabrica]\x1b[0m ⚠️  ${message}`);
	process.exit(1)
}
let wait = (message, callback, delay=500) => {
	console.log();
	let spinner = ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'];
	let waitcounter = 0;
	let handler = setInterval(() => {
		// move cursor to beginning of line
		process.stdout.clearLine();
		process.stdout.cursorTo(0);
		// write with no line change
		process.stdout.write(`\x1b[7m[Fabrica]\x1b[27m ${spinner[waitcounter % 12]}  ${message}`);
		waitcounter++;
		// send callback a closure to stop the interval timer
		callback(() => { clearTimeout(handler); console.log(); });
	}, delay);
}

// check Fabrica dependencies
let dependencies = ['gulp', 'docker-compose', 'composer'];
for (let dependency of dependencies) {
	if (sh.exec(`hash ${dependency} 2>/dev/null`, {silent: true}).code != 0) {
		halt(`Could not find dependency '${dependency}'.`);
	}
}
let packageManager = '';
dependencies = ['yarn', 'npm'];
for (let dependency of dependencies) {
	if (sh.exec(`hash ${dependency} 2>/dev/null`, {silent: true}).code == 0) {
		packageManager = dependency;
		break;
	}
}
if (packageManager == '') {
	halt("Could not find any Node package manager ('yarn' or 'npm').");
}

let loadSettings = (reinstall = false) =>
	echo('Reading settings...');
	let settings = {};
	// auxiliar method to get settings from the files
	let mergeSettings = (filename) => {
		if (!sh.test('-f', filename)) { return; }
		try {
			let newSettings = yaml.safeLoad(fs.readFileSync(filename, 'utf8'));
		} catch (ex) {
			halt(`Failed to open settings file: ${filename}.\nException: ${ex}`);
		}
		merge(settings, newSettings);
	}

	// get user's UID/GID to match on container's user
	settings.user = {
		uid: sh.exec('id -u $(whoami)', {silent: true}).output,
		gid: sh.exec('id -g $(whoami)', {silent: true}).output,
	}

	// load default, user and project/site settings, in that order
	mergeSettings(path.join(path.dirname(__filename), 'default.yml'));
	mergeSettings(path.join(process.env.HOME, '.fabrica/settings.yml'));
	setupSettingsFilename = path.join(path.dirname(__filename), 'setup.yml');
	setupSettingsBakFilename = path.join(path.dirname(__filename), 'setup.bak.yml');
	if (!sh.test('-f', setupSettingsFilename)) {
		if (reinstall && sh.test('-f', setupSettingsFilename) {
			sh.mv(setupSettingsBakFilename, setupSettingsFilename);
		} else if (reinstall) {
			halt('Could not find "setup.yml" or setup.bak.yml". Please create this file based on "setup-example.yml".');
		} else {
			halt('Could not find "setup.yml". Please create this file based on "setup-example.yml". If the current project has been set up previously, you can set the "--reinstall" flag and "setup.bak.yml" will be used to bring the Docker containers back up and reconfigure them.');
		}
	}
	mergeSettings(setupSettingsFilename);

 	// rename/backup "setup.yml"
	sh.mv(setupSettingsFilename, setupSettingsBakFilename);

	return settings();
}

let setup = options => {
	let settings = loadSettings(options.reinstall);

	// create "www" folder (to ensure its owner is the user running the script)
	sh.mkdir('-p', 'www');

	if (!sh.test('-d', 'src')) {
		// new project: copy starter "provision" and "dev" folders
		sh.cp('-r', `${__dirname}/provision`, 'provision');
		sh.cp('-r', `${__dirname}/dev/*`, '.');

		// set configuration data in source and Wordmove files
		let templateFilenames = [
			'src/package.json',
			'src/includes/composer.json',
			'src/includes/project.php',
			'src/templates/views/base.twig',
			'docker-compose.yml'
		];
		for (let destFilename in templateFilenames) {
			// load template file and generate final version
			let srcFilename = `./${destFilename}.js`;
			if (sh.test('-f', srcFilename)) {
				let generatedFile = require(srcFilename)(settings);
				sh.echo(generatedFile).to(destFilename);
				sh.rm(srcFilename);
			} else {
				halt(`Could not find ${srcFilename} template.`);
			}
		}
	} else {
		// working on an existing project
		if (!sh.test('-f', 'src/package.json')) {
			halt('Folder \'src/\' already exists but no \'package.json\' found there.');
		}
		projectSettings = JSON.parse(File.read('src/package.json'))
		echo('Existing project \'src/package.json\' found. Overriding the following settings in \'setup.yml\' with those in this file  (old \'setup.yml\' value → new value):');
		for (let [projectKey, settingKey] of Object.entries({name: 'slug', description: 'title', author: 'author'})) {
			echo(` ◦ ${settingKey} / ${projectKey}: '${settings[settingKey]}' → '${projectSettings[projectKey]}'`);
			settings[settingKey] = projectSettings[projectKey];
		}
	}

	// install build dependencies (Gulp + extensions)
	echo('Installing build dependencies...');
	sh.exec(`${package_manager} install`);

	// install initial front-end dependencies
	echo('Installing front-end dependencies...');
	sh.cd('src');
	sh.exec(`${package_manager} install`);
	sh.cd('includes');
	sh.exec('composer install');
	sh.cd('../..');

	// start docker
	echo('Bringing Docker containers up...');
	if (sh.exec('docker-compose up -d').code != 0) {
		halt('Docker containers provision failed.');
	}

}

// set command line options
program.version(VERSION);
	// `init` command
	.command('init <slug>')
	.description('start a new project folder called <slug> containing an example setup file. <slug> must be unique and no other Docker Compose project should share it.')
	.action(init)
	// `setup` command
	.command('setup')
	.description('start a new project folder called <slug> and an example setup file')
	.option('--reinstall', 'perform setup on a previously setup project. "setup.bak.yml" will be used for configuration if "setup.yml" is not available.')
	.action(setup)
	// finalize
	.parse(process.argv);

	/* ~%%~ [TODO] ~%%~ also execute `<project>/package.json` scripts (`npm run <command> [vars...]`), either by:
	• opening `<project>/dev/package.json` and go through them and add them as
	• pre-def list of commands to add
	for already defined commands:
	• prefix with char like `:<command>`, `!<command>`, `~<command>`, `@<command>` or `\<command>` (maybe one of these could set that it should change to root project folder before running the command)
	• command for run like `. <command>` or `run <command>`
	// ~%%~ */
