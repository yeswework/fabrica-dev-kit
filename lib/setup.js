'use strict';

const merge = require('lodash/merge'),
	path = require('path'),
	sh = require('shelljs'),
	yaml = require('js-yaml');

const { echo, execGet, execWP, halt, spawn, warn } = require('./util'),
	{ getProjectConfig } = require('./config'),
	{ setupPortlessAlias } = require('./portless'),
	{ WAIT_WP_CONTAINER_TIMEOUT, waitForWebContainer } = require('./docker');

// package root: the starter `dev` folder and the `setup.yml` template sit beside `index.js`,
// one level up from this module
const FDK_ROOT = path.join(__dirname, '..');

const getSetupPackageManager = (settings) => {
	let packageManager = '';

	if (settings.package_manager && sh.exec(`hash ${settings.package_manager} 2>/dev/null`, {silent: true}).code == 0) {
		return settings.package_manager;
	}

	const dependencies = ['npm', 'yarn'];
	for (let dependency of dependencies) {
		if (sh.exec(`hash ${dependency} 2>/dev/null`, {silent: true}).code == 0) {
			packageManager = dependency;
			break;
		}
	}
	if (packageManager == '') {
		halt('Could not find any Node package manager (\'npm\' or \'yarn\').');
	}
	return packageManager;
}

// load all settings files
const loadSetupSettings = (reinstall) => {
	echo('Reading settings...');
	let settings = {
		reinstall: reinstall || false,
	};
	// auxiliar method to get settings from the files
	let mergeSettings = (filename) => {
		if (!sh.test('-f', filename)) { return; }
		let newSettings;
		try {
			newSettings = yaml.load(sh.cat(filename));
		} catch (ex) {
			halt(`Failed to open settings file: ${filename}.\nException: ${ex}`);
		}
		merge(settings, newSettings);
	}

	// load default, user and project/site settings, in that order
	mergeSettings(`${process.env.HOME}/.fabrica/settings.yml`);
	const setupSettingsFilename = './setup.yml',
		setupSettingsBakFilename = './.setup.yml';
	if (!sh.test('-f', setupSettingsFilename)) {
		if (settings.reinstall && sh.test('-f', setupSettingsBakFilename)) {
			sh.mv(setupSettingsBakFilename, setupSettingsFilename);
		} else if (settings.reinstall) {
			halt('Could not find \'setup.yml\' or \'.setup.yml\' to reinstall project. Please use the \'fdk init <slug>\' command to create a new project folder and \'setup.yml\'.');
		} else {
			halt('Could not find \'setup.yml\'. Please use the \'fdk init <slug>\' command to create a new project folder and \'setup.yml\'. If the current project has been set up previously, you can run \'fdk setup --reinstall\' and \'.setup.yml\' will be used to bring the Docker containers back up and reconfigure them.');
		}
	}
	mergeSettings(setupSettingsFilename);

	// check if there's already a Docker container for the project slug
	if (execGet(`docker ps -aqf name=${settings.slug}_wp`)) {
		if (settings.reinstall) {
			echo(`Docker container with '${settings.slug}_wp' found but ignored because '--reinstall' flag is set`);
		} else {
			halt(`There's already a Docker container called '${settings.slug}_wp'. If this container belongs to another project remove all containers for that project or rename this one before running setup. Otherwise run \'fdk setup --reinstall\' to re-use already existing Docker containers for this project.`);
		}
	}

 	// move/backup 'setup.yml'
	sh.mv(setupSettingsFilename, setupSettingsBakFilename);

	return settings;
};

// create and copy project folders
const createFolders = settings => {
	// set up folder content
	if (!sh.test('-f', 'package.json')) {
		// new project: copy starter development folder
		sh.cp('-r', [`${FDK_ROOT}/dev/*`, `${FDK_ROOT}/dev/.*`], '.');
		// create 'www' folder (to ensure its owner is the user running the script)
		sh.mkdir('-p', 'www');

		// set configuration data in external files
		let templateFilenames = [
			'package.json',
			'docker-compose.yml',
			'provision/web/wordpress-fpm.conf'
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
		let projectSettings = JSON.parse(sh.cat('package.json'));
		echo('Existing project \'package.json\' found. Overriding the following settings in \'setup.yml\' with those in this file  (old \'.setup.yml\' value → new value):');
		let keys = {name: 'slug', description: 'title'};
		const simpleDiff = (value1, value2) => {
			if (value1 == value2) {
				return `${JSON.stringify(value1)} (unchanged)`;
			}
			return `${JSON.stringify(value1)} → ${JSON.stringify(value2)}`;
		}
		for (let projectKey of Object.keys(keys)) {
			let settingKey = keys[projectKey],
				diffMessage = ` ◦ ${settingKey}${settingKey != projectKey ? ` / ${projectKey}` : ''}: `;
			if (typeof projectSettings[projectKey] == 'object') {
				echo(`${diffMessage}`);
				Object.keys(projectSettings[projectKey]).forEach((key) =>
					echo(`   • ${key}: ${simpleDiff(settings[settingKey][key], projectSettings[projectKey][key])}`)
				);
			} else {
				echo(`${diffMessage} ${simpleDiff(settings[settingKey], projectSettings[projectKey])}`);
			}
			settings[settingKey] = projectSettings[projectKey];
		}
	}
};

// install build dependencies
const installDependencies = (packageManager) => {
	echo('Installing build dependencies...');
	spawn([packageManager, 'install']);
};

// install and configure WordPress in the Docker container
const installWordPress = (webPort, settings) => {
	echo('Installing WordPress...');
	const wp = command => execWP(`wp ${command}`).code == 0 || halt(`Failed to execute: 'wp ${command}' on wp container`);

	// set up portless alias if enabled in config.yml 'use' array and capture the actual proxy URL
	const usePortless = getProjectConfig('default')?.use?.indexOf('portless') >= 0,
		portlessURL = usePortless && setupPortlessAlias(settings.slug, webPort);
	if (portlessURL) {
		echo(`Portless URL: ${portlessURL}`);
	}
	
	// use stdout stream to filter out known WP CLI warning
	const install = execWP(['wp core install',
		`--url=${portlessURL || `localhost:${webPort}`}`,
		`--title="${settings.title}"`,
		`--admin_user=${settings.wp.admin.user}`,
		`--admin_password=${settings.wp.admin.pass}`,
		`--admin_email="${settings.wp.admin.email}"`].join(' '),
		{silent: true, async: true});
	install.stdout.on('data', data => {
		let output = data.toString('utf8');
		// filter out WP CLI warning
		process.stdout.write(output.replace('sh: 1: -t: not found', ''));
	}).on('error', error => {
		halt(`Failed to install WordPress:\n${error}`);
	}).on('end', () => {
		if (install.exitCode) {
			halt(`Failed to install WordPress`);
		}

		// WordPress installed succesfully: proceed with configuration
		wp(`rewrite structure "${settings.wp.rewrite_structure}"`);
		if (settings.wp.lang == 'ja') {
			// activate multibyte patch for Japanese language
			wp('plugin activate wp-multibyte-patch');
		}

		// remove default WordPress plugins and themes
		if (!settings.reinstall && settings.wp.skip_default_plugins) {
			wp(`plugin delete "hello" "akismet"`);
		}
		if (!settings.reinstall && settings.wp.skip_default_themes) {
			wp(`theme delete --all`);
		}
		// install and activate WordPress plugins
		for (let plugin of (settings.wp.plugins || [])) {
			wp(`plugin install "${plugin}" --activate`);
		}
		if (settings.wp.acf_pro_key) {
			if (execWP([`bash -c 'curl "http://connect.advancedcustomfields.com/index.php?p=pro&a=download&k=${settings.wp.acf_pro_key}" > /tmp/acf-pro.zip`,
				`&& wp plugin install /tmp/acf-pro.zip --activate`,
				`&& rm /tmp/acf-pro.zip'`].join(' ')).code != 0) {
				warn('Error installing or configuring ACF Pro.');
			}
		}
		// WordPress options
		for (let option of Object.keys(settings.wp.options || {})) {
			let value = settings.wp.options[option];
			wp(`option update ${option} "${value}"`);
		}
		// Default post
		if (!settings.reinstall) {
			wp(`post update 1 --post_name='welcome-to-fabrica-dev-kit' --post_title='Welcome to Fabrica Dev Kit' --post_content='For more information about developing with Fabrica Dev Kit, <a href="https://github.com/fabrica-wp/fabrica-dev-kit">see the documentation</a>.'`);
		}

		// the site will be ready to run and develop locally
		echo('Setup complete. To develop locally, setup the resources to import automatically in \'config.yml\', run \'fdk config:all\' to update the Docker configuration and then \'fdk start\'.');
	});
}

// start Docker containers and wait for them to be up to start installing and configuring WP
const startContainersAndInstall = settings => {
	echo('Bringing Docker containers up...');
	if (spawn(['docker', 'compose', 'up', '-d']).status != 0) {
		halt('Docker containers provision failed.');
	}

	// wait until `web` container is up to install WordPress
	waitForWebContainer().then(([success, webPort]) => {
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

const init = (slug, options) => {
	if (options.createDir) {
		if (!slug) {
			halt(`If the flag to create project folder is set, a <slug> must be provided.`);
		}
		if (sh.test('-e', slug)) {
			halt(`There's already a file or folder called '${slug}'.`);
		}
		echo(`Creating '${slug}' folder...`);

		sh.mkdir(slug);
		sh.cd(slug);
	}

	if (!slug) {
		slug = path.basename(path.resolve()).toLowerCase()
			.replace(/[^\w\-]+/g, '')       // Remove all non-word chars
			.replace(/\-*\s+\-*/g, '-')     // Replace spaces with -
			.replace(/^\-+|\-+$/g, '')      // Trim
		echo(`No <slug> parameter was provided, using '${slug}' as project slug. You can edit this setting in 'setup.yml'.`);
	}

	if (sh.test('-e', 'setup.yml')) {
		halt(`'setup.yml' already exists. File was not changed. Edit settings in this file with a text editor to setup the project.`);
	}
	echo(`Creating the 'setup.yml' file...`);
	let data = Object.assign({ slug: slug }, options),
		generatedFile = require(`${FDK_ROOT}/setup.yml.js`)(data);
	sh.ShellString(generatedFile).to(`./setup.yml`);
	echo(`Project initial 'setup.yml' file created. Edit settings in this file and run 'fdk setup' to setup the project.`);
};

const setup = options => {
	const settings = loadSetupSettings(options.reinstall),
		packageManager = getSetupPackageManager(settings);
	createFolders(settings);
	installDependencies(packageManager);
	startContainersAndInstall(settings);
};

module.exports = { init, setup };
