#!/usr/bin/env node --harmony

'use strict';

const findup = require('findup-sync'),
	http = require('http'),
	merge = require('lodash/merge'),
	path = require('path'),
	program = require('commander'),
	Promise = require('promise'),
	sh = require('shelljs'),
	yaml = require('js-yaml');

// Fabrica Dev Kit version
const VERSION = '1.0.1',
// maximum time (in milliseconds) to wait for wp container to be up and running
	WAIT_WP_CONTAINER_TIMEOUT = 360 * 1000;

// output functions
let echo = message => {
	console.log(`\x1b[7m[Fabrica]\x1b[27m 🏭  ${message}`);
};
let halt = message => {
	console.error(`\x1b[1m\x1b[41m[Fabrica]\x1b[0m ⚠️  ${message}`);
	process.exit(1)
};
let wait = (message, callback, delay=500) => {
	return new Promise((resolve, reject) => {
		console.log();
		let spinner = ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'],
			waitcounter = 0,
			handler,
			stopWaitInterval = response => {
				clearTimeout(handler);
				console.log();
				resolve(response);
			};
		handler = setInterval(() => {
			// move cursor to beginning of line
			process.stdout.clearLine();
			process.stdout.cursorTo(0);
			// write with no line change
			process.stdout.write(`\x1b[7m[Fabrica]\x1b[27m ${spinner[waitcounter % 12]}  ${message}`);
			callback(stopWaitInterval);
			waitcounter++;
			// send callback a closure to stop the interval timer
		}, delay);
	});
};

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
	halt('Could not find any Node package manager (\'yarn\' or \'npm\').');
}

// load all settings files
let loadSettings = (reinstall = false) => {
	echo('Reading settings...');
	let settings = {};
	// auxiliar method to get settings from the files
	let mergeSettings = (filename) => {
		if (!sh.test('-f', filename)) { return; }
		let newSettings;
		try {
			newSettings = yaml.safeLoad(sh.cat(filename));
		} catch (ex) {
			halt(`Failed to open settings file: ${filename}.\nException: ${ex}`);
		}
		merge(settings, newSettings);
	}

	// get user's UID/GID to match on container's user
	settings.user = {
		uid: sh.exec('id -u $(whoami)', {silent: true}).stdout,
		gid: sh.exec('id -g $(whoami)', {silent: true}).stdout,
	}

	// load default, user and project/site settings, in that order
	mergeSettings(`${__dirname}/default.yml`);
	mergeSettings(`${process.env.HOME}/.fabrica/settings.yml`);
	let setupSettingsFilename = './setup.yml',
		setupSettingsBakFilename = './setup.bak.yml';
	if (!sh.test('-f', setupSettingsFilename)) {
		if (reinstall && !sh.test('-f', setupSettingsFilename)) {
			sh.mv(setupSettingsBakFilename, setupSettingsFilename);
		} else if (reinstall) {
			halt('Could not find \'setup.yml\' or \'setup.bak.yml\'. Please use the \'fdk init <slug>\' command to create a new project folder and \'setup.yml\'.');
		} else {
			halt('Could not find \'setup.yml\'. Please use the \'fdk init <slug>\' command to create a new project folder and \'setup.yml\'. If the current project has been set up previously, you can run \'fdk setup --reinstall\' and \'setup.bak.yml\' will be used to bring the Docker containers back up and reconfigure them.');
		}
	}
	mergeSettings(setupSettingsFilename);

 	// rename/backup 'setup.yml'
	sh.mv(setupSettingsFilename, setupSettingsBakFilename);

	return settings;
};

// create and copy project folders
let createFolders = settings => {
	// create 'www' folder (to ensure its owner is the user running the script)
	sh.mkdir('-p', 'www');
	// create 'src' folder if not existing
	if (!sh.test('-d', 'src')) {
		// new project: copy starter 'provision' and 'dev' folders
		sh.cp('-r', `${__dirname}/provision`, './provision');
		sh.cp('-r', `${__dirname}/dev/*`, '.');

		// set configuration data in source and Wordmove files
		let templateFilenames = [
			'src/package.json',
			'src/includes/composer.json',
			'src/includes/project.php',
			'src/templates/views/base.twig',
			'docker-compose.yml'
		];
		for (let destFilename of templateFilenames) {
			// load template file and generate final version
			let srcFilename = `${process.cwd()}/${destFilename}.js`;
			if (sh.test('-f', srcFilename)) {
				let generatedFile = require(srcFilename)(settings);
				sh.ShellString(generatedFile).to(destFilename);
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
		let projectSettings = JSON.parse(sh.cat('src/package.json'));
		echo('Existing project \'src/package.json\' found. Overriding the following settings in \'setup.yml\' with those in this file  (old \'setup.yml\' value → new value):');
		for (let [projectKey, settingKey] of Object.entries({name: 'slug', description: 'title', author: 'author'})) {
			echo(` ◦ ${settingKey} / ${projectKey}: '${settings[settingKey]}' → '${projectSettings[projectKey]}'`);
			settings[settingKey] = projectSettings[projectKey];
		}
	}
};

// install build dependencies (Gulp + extensions)
let installDependencies = () => {
	echo('Installing build dependencies...');
	// `shelljs.exec` doesn't handle color and animations yet
	// https://github.com/shelljs/shelljs/issues/86
	let spawn = require('child_process').spawnSync;
	spawn(`${packageManager}`, ['install'], { stdio: 'inherit' });

	// install initial front-end dependencies
	echo('Installing front-end dependencies...');
	sh.cd('src');
	spawn(`${packageManager}`, ['install'], { stdio: 'inherit' });
	sh.cd('includes');
	spawn('composer', ['install'], { stdio: 'inherit' });
	sh.cd('../..');
};


// install and configure WordPress in the Docker container
let installWordPress = (webPort, settings) => {
	echo('Installing WordPress...');
	let wpContainer = `${settings['slug']}_wp`,
		wp = command => {
			if (sh.exec(`docker exec ${wpContainer} wp ${command}`).code != 0) {
				halt(`Failed to execute: 'docker exec ${wpContainer} wp ${command}'`);
			}
		};

	wp(['core install',
		`--url=localhost:${webPort}`,
		`--title="${settings.title}"`,
		`--admin_user=${settings.wp.admin.user}`,
		`--admin_password=${settings.wp.admin.pass}`,
		`--admin_email="${settings.wp.admin.email}"`].join(' '));
	wp(`rewrite structure "${settings.wp.rewrite_structure}"`);
	if (settings.wp.lang == 'ja') {
		// activate multibyte patch for Japanese language
		wp('plugin activate wp-multibyte-patch');
	}

	// run our gulp build task and build the WordPress theme
	echo('Building WordPress theme...');
	if (sh.exec('gulp build').code != 0) {
		halt('Gulp \'build\' task failed');
	}
	// create symlink to theme folder for quick access
	sh.ln('-s', `../www/wp-content/themes/${settings.slug}/`, 'build');
	// activate theme
	wp(`theme activate "${settings.slug}"`);

	// install and activate WordPress plugins
	for (let plugin of (settings.wp.plugins || [])) {
		wp(`plugin install "${plugin}" --activate`);
	}
	if (settings.wp.acf_pro_key) {
		let execCode = sh.exec([`docker exec ${wpContainer} bash -c 'curl "http://connect.advancedcustomfields.com/index.php?p=pro&a=download&k=${settings.wp.acf_pro_key}" > /tmp/acf-pro.zip`,
			`&& wp plugin install /tmp/acf-pro.zip --activate`
			`&& rm /tmp/acf-pro.zip'`].join(' ')).code;
	}
	// remove default WordPress plugins and themes
	if (settings.wp.skip_default_plugins) {
		wp(`plugin delete "hello" "akismet"`);
	}
	if (settings.wp.skip_default_themes) {
		wp(`theme delete "twentyseventeen" "twentysixteen" "twentyfifteen"`);
	}
	// WordPress options
	for (let [option, value] of Object.entries(settings.wp.options || {})) {
		wp(`option update ${option} "${value}"`);
	}
	// Default post
	wp(`post update 1 --post_name='welcome-to-fabrica-dev-kit' --post_title='Welcome to Fabrica Dev Kit' --post_content='For more information about developing with Fabrica Dev Kit, <a href="https://github.com/fabrica-wp/fabrica-dev-kit">see the documentation</a>.'`);

	// the site will be ready to run and develop locally
	echo('Setup complete. To develop locally, \'cd dev\' then run \'gulp\'.');
}

let startContainersAndInstall = settings => {
	// start docker
	echo('Bringing Docker containers up...');
	if (sh.exec('docker-compose up -d').code != 0) {
		halt('Docker containers provision failed.');
	}

	// wait until `wp` container is up to install WordPress
	let startTime = Date.now(), getting = false, webPort;
	wait(`Waiting for '${settings['slug']}_wp' container...`, stopWaitInterval => {
		// get port dynamically assigned by Docker to expose web container's port 80
		webPort = webPort ||
			sh.exec('docker-compose port web 80', {silent: true})
				.stdout.replace(/^.*:(\d+)\n$/, '$1');
		if (webPort && !getting) {
			// check if WordPress is already available at the expected URL
			getting = true;
			http.get(`http://localhost:${webPort}/wp-admin/install.php`, response => {
				getting = false;
				if (response.statusCode == '200') {
					// container is up
					stopWaitInterval(true);
				}
			}).on('error', error => {
				// ignore errors (container still not up)
				getting = false;
			});
		}
		if (Date.now() - startTime > WAIT_WP_CONTAINER_TIMEOUT) {
			// timeout
			stopWaitInterval(false);
		}
	}).then(success => {
		// wait is over: containers are up or timeout has expired
		if (!success) {
			halt(`More than ${WAIT_WP_CONTAINER_TIMEOUT / 1000} seconds elapsed while waiting for WordPress container to start.`);
		}
		echo(`Web server running at port ${webPort}`);

		installWordPress(webPort, settings);
	}).catch(error => {
		halt(`Error installing or configuring WordPress:\n${error}`);
	});
}

// Commands

let init = (slug, options) => {
	if (sh.test('-e', slug)) {
		halt(`There's already a file or folder called ${slug}.`);
	}
	echo(`Creating '${slug}' folder and the 'setup.yml' file...`);
	let data = Object.assign({ slug: slug }, options),
		generatedFile = require(`${__dirname}/setup.yml.js`)(data);

	sh.mkdir(slug);
	sh.cd(slug);
	sh.ShellString(generatedFile).to(`./setup.yml`);
	echo(`Project '${slug}' folder and initial 'setup.yml' file created. Edit this file and run 'fdk setup' to setup the project.`);
};

let setup = options => {
	let settings = loadSettings(options.reinstall);

	createFolders(settings);
	installDependencies();
	startContainersAndInstall(settings);
};

// add commands for project's root `package.json` if current path is part of a project
let addScriptCommands = () => {
	// check if we're inside a project
	let rootDir = findup('setup.bak.yml', {cwd: process.cwd()});
	if (!rootDir) { return; }
	rootDir = path.dirname(rootDir);
	if (!sh.test('-f', `${rootDir}/docker-compose.yml`) || !sh.test('-f', `${rootDir}/package.json`)) {
		return;
	}
	if (rootDir != process.cwd()) {
		// change to project root folder and add `package.json` scripts to commands
		sh.cd(rootDir);
		echo(`Working directory changed to ${rootDir}`);
	}

	let packageSettings = JSON.parse(sh.cat('package.json'));
	for (let [command, script] of Object.entries(packageSettings.scripts)) {
		program.command(command)
			.description(`'package.json' script: \`${script.length > 80 ? script.substr(0, 80) + '…' : script}\``)
			.action(options => { sh.exec(script); });
	}
}

// set command line options
program.version(VERSION)
	.usage('[options] <command>')
	.description(`Run 'init <slug>' to start a new project.\n\n    fdk <command> -h\tquick help on <command>`);
// `init` command
program.command('init <slug>')
	.description('Start a new project folder called <slug> containing the \'setup.yml\' configuration file. <slug> must be unique and no other Docker Compose project should share this name. All optional arguments will be set in the \'setup.yml\' file and can be modified there.')
	.option('-t, --title <title>', 'project title')
	.option('--author_name <name>', 'project author\'s name')
	.option('--author_email <email>', 'project author\'s email')
	.option('--author_url <url>', 'project author\'s url')
	.option('--wp_admin_user <username>', 'WordPress admin username')
	.option('--wp_admin_pass <password>', 'WordPress admin password')
	.option('--wp_admin_email <email>', 'WordPress admin email')
	.action(init);
// `setup` command
program.command('setup')
	.description('Setup project based on setting on \'setup.yml\' file')
	.option('--reinstall', 'Reuse settings for previously setup project. \'setup.bak.yml\' will be used for configuration if \'setup.yml\' is not available.')
	.action(setup);
addScriptCommands();
// finalize `commander` config
program.parse(process.argv);
// show help if no arguments are passed
if (program.args.length === 0) { program.help(); }
