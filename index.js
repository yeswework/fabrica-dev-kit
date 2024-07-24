#!/bin/sh
":" //# https://fabri.ca/; exec /usr/bin/env node --noharmony "$0" "$@"

'use strict';

const findup = require('findup-sync'),
	http = require('http'),
	merge = require('lodash/merge'),
	path = require('path'),
	program = require('commander'),
	Promise = require('promise'),
	sh = require('shelljs'),
	// `shelljs.exec` doesn't handle color and animations yet
	// https://github.com/shelljs/shelljs/issues/86
	spawn = require('shelljs-live'),
	yaml = require('js-yaml');

const execGet = cmd => sh.exec(cmd, { silent: true }).stdout.trim();
const execWP = (cmd, options) => sh.exec(`docker compose exec -u www-data -T wp ${cmd}`, options);
const execWPGet = cmd => execWP(cmd, { silent: true }).stdout.trim();

// Fabrica Dev Kit version
const VERSION = require('./package.json')['version'],
// maximum time (in milliseconds) to wait for wp container to be up and running
	WAIT_WP_CONTAINER_TIMEOUT = 360 * 1000,
	project = {
		isInstalled: false, // command executed inside an already setup project?
	};

// output functions
const echo = (message, icon='🏭') => {
	console.log(`\x1b[7m[FDK]\x1b[27m ${icon}  ${message}`);
};
const warn = message => {
	console.error(`\x1b[1m\x1b[41m[FDK]\x1b[0m ⚠️  ${message}`);
}
const halt = message => {
	warn(message);
	process.exit(1);
};
const wait = (message, callback, delay=500) => {
	return new Promise((resolve, reject) => {
		console.log();
		const spinner = ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'];
		let waitcounter = 0,
			handler,
			stopWaitInterval = (...response) => {
				clearTimeout(handler);
				console.log();
				resolve(response);
			};
		handler = setInterval(() => {
			// move cursor to beginning of line
			process.stdout.clearLine();
			process.stdout.cursorTo(0);
			// write with no line change
			process.stdout.write(`\x1b[7m[FDK]\x1b[27m ${spinner[waitcounter % 12]}  ${message}`);
			callback(stopWaitInterval);
			waitcounter++;
			// send callback a closure to stop the interval timer
		}, delay);
	});
};

// check Fabrica dependencies
const checkDependencies = () => {
	const dependencies = ['docker'];
	for (let dependency of dependencies) {
		if (sh.exec(`hash ${dependency} 2>/dev/null`, {silent: true}).code != 0) {
			halt(`Could not find dependency '${dependency}'.`);
		}
	}
}
checkDependencies();

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

const getProjectConfig = (project, resourcesConfig = false) => {
	try {
		resourcesConfig ||= yaml.load(sh.cat(`./config.yml`));
	} catch (ex) {
		warn(`Error loading 'config.yml'`);
		return {};
	}
	const projectConfig = resourcesConfig[project];
	if (!projectConfig) {
		halt(`Project '${project}' not found in the config file.`)
	} else if (projectConfig.extend && !resourcesConfig[projectConfig.extend]) {
		halt(`Project '${project}' extends '${projectConfig.extend}' which was not found in the config file.`);
	} else if (projectConfig.extend) {
		// extend project configuration from other projects in the config file
		return {
			...resourcesConfig[projectConfig.extend],
			...projectConfig
		};
	}
	return projectConfig;
};

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

const waitForWebContainer = (forcePortCheck=false) => {
	let startTime = Date.now(), getting = false, webPort;
	return wait(`Waiting for 'web' container...`, stopWaitInterval => {
		// get port dynamically assigned by Docker to expose web container's port 80
		webPort = forcePortCheck ? getWebPort(true) : (webPort || getWebPort());
		if (webPort && !getting) {
			// check if WordPress is already available at the expected URL
			getting = true;
			http.get(`http://localhost:${webPort}/wp-admin/install.php`, response => {
				getting = false;
				if (response.statusCode == '200') {
					// container is up
					stopWaitInterval(true, webPort);
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
	});
};

// create and copy project folders
const createFolders = settings => {
	// set up folder content
	if (!sh.test('-f', 'package.json')) {
		// new project: copy starter development folder
		sh.cp('-r', [`${__dirname}/dev/*`, `${__dirname}/dev/.*`], '.');
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
let installWordPress = (webPort, settings) => {
	echo('Installing WordPress...');
	let wp = command => execWP(`wp ${command}`).code == 0 || halt(`Failed to execute: 'wp ${command}' on wp container`);

	// use stdout stream to filter out known WP CLI warning
	let install = execWP([`wp core ${settings.wp.multisite ? 'multisite-' : ''}install`,
		`--url=${settings.wp.multisite ? `${settings.slug}.local --subdomains` : `localhost:${webPort}`}`,
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
		if (settings.wp.skip_default_plugins) {
			wp(`plugin delete "hello" "akismet"`);
		}
		if (settings.wp.skip_default_themes) {
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

// add custom domain to /etc/hosts for multisite setups
// [FIXME] currently not working properly -- proxy like jwilder/nginx-proxy or Traefik to redirect a URLs to container ports
const setupMultisiteCustomDomain = settings => {
	if (!settings.wp.multisite) { return; }

	try {
		if (execGet(`cat /etc/hosts | grep "${settings.slug}.local"`)) {
			echo(`'${settings.slug}.local' already in in /etc/hosts.`);
		} else {
			echo(`sudo access required to add '${settings.slug}.local' to /etc/hosts`, '🔐');
			execGet(`echo "127.0.0.1 ${settings.slug}.local" | sudo tee -a /etc/hosts`);
		}
	} catch (ex) {
		warn(`Error setting up custom local domain '${settings.slug}.local' in /etc/hosts.`);
	}
}

// start Docker containers and wait for them to be up to start installing and configuring WP
const startContainersAndInstall = settings => {
	echo('Bringing Docker containers up...');
	if (spawn(['docker', 'compose', 'up', '-d']) != 0) {
		halt('Docker containers provision failed.');
	}

	// wait until `web` container is up to install WordPress
	waitForWebContainer().then(([success, webPort]) => {
		// wait is over: containers are up or timeout has expired
		if (!success) {
			halt(`More than ${WAIT_WP_CONTAINER_TIMEOUT / 1000} seconds elapsed while waiting for WordPress container to start.`);
		}
		echo(`Web server running at port ${webPort}`);

		setupMultisiteCustomDomain(settings);
		installWordPress(webPort, settings);
	}).catch(error => {
		halt(`Error installing or configuring WordPress:\n${error}`);
	});
}

// Get external Docker port
const getDockerPort = (service, port) => {
	return execGet(`docker compose port ${service} ${port}`).replace(/^.*:(\d+)$/g, '$1');
}

// Get current web Docker container automatically assigned port
const getWebPort = (force=false) => {
	if (!force && project && project.webPort) { return project.webPort; }

	const webPort = getDockerPort('web', 80);
	if (project) {
		project.webPort = webPort;
	}

	return webPort;
}

// Get current db Docker container automatically assigned port
const getDBPort = () => {
	if (project && project.dbPort) { return project.dbPort; }

	const dbPort = getDockerPort('db', 3306);
	if (project) {
		project.dbPort = dbPort;
	}

	return dbPort;
}

// Get current Docker automatically assigned ports for extra services
const getServicesPorts = () => {
	const dockerConfig = yaml.load(sh.cat(`./docker-compose.yml`)),
		ports = [];
	if (dockerConfig.services?.mailhog) {
		const mailhogPort = getDockerPort('mailhog', 8025);
		ports.push({
			icon: '📨',
			name: 'Mailhog',
			port: mailhogPort,
		});
	}
	return ports;
}

// Get current db Docker container automatically assigned port
const getSiteURL = () => {
	if (project && project.siteURL) { return project.siteURL; }

	const siteURL = execWPGet('wp option get siteurl');
	if (project) {
		project.siteURL = siteURL;
	}

	return siteURL;
}

// ——— Project initialization Commands ————

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
		generatedFile = require(`${__dirname}/setup.yml.js`)(data);
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

// ——— Project-specific (post-initialization) commands ————

const echoInfo = (siteURL) => {
	// output site URLs and ports
	if (!siteURL) {
		siteURL = getSiteURL();
	}
	const dbPort = getDBPort();
	const servicesPorts = getServicesPorts();
	const outputSeparator = ` \x1b[36m${'-'.repeat(siteURL.length + 21)}\x1b[0m`;
	echo(`\x1b[1m${project.title} (${project.slug}) access URLs:\x1b[22m`);
	echo(outputSeparator);
	echo(` 🌍  WordPress: \x1b[35m${siteURL}/\x1b[0m`);
	echo(` 🔧  Admin: \x1b[35m${siteURL}/wp-admin/\x1b[0m`);
	echo(` 💿  Database: \x1b[35mlocalhost:${dbPort}/\x1b[0m`);
	for (const service of servicesPorts) {
		echo(` ${service.icon}  ${service.name}: \x1b[35mlocalhost:${service.port}/\x1b[0m`);
	}
	echo(outputSeparator);
};

// Get current site and port for WordPress to check if it matches the current Docker-assigned Web container port (in a singlesite project). Output current project access URLs and ports
const configURL = async () => {
	let siteURL = getSiteURL();

	if (siteURL.trim().length <= 0) {
		// Docker stopped: restart
		if (spawn(['docker', 'compose', 'up', '-d']) !== 0) {
			halt('Docker containers failed to start.');
		}

		// try to get site URL again
		await waitForWebContainer(true);
		siteURL = getSiteURL();
	}

	if (siteURL.indexOf('localhost:') >= 0 || siteURL.indexOf('127.0.0.1:') >= 0) {
		// not in a multisite/custom domain project: check if automatic port set by Docker needs to be updated in the DB
		const webPort = getWebPort(),
			wpPort = siteURL.replace(/^.*:(\d+)$/g, '$1');
		if (wpPort != webPort) {
			// port needs to be updated
			echo('Updating WordPress port from ' + wpPort + ' to ' + webPort + '...');
			execWP(`wp search-replace --quiet "localhost:${wpPort}" "localhost:${webPort}"`);
			execWP(`bash -c \'wp option update home "http://localhost:${webPort}" && wp option update siteurl "http://localhost:${webPort}"\'`);
			siteURL = `http://localhost:${webPort}`;
		}
	}

	echoInfo(siteURL);
};

// Check if there are any new services to add to `docker-compose.yml`
const configServices = (projectConfig, dockerConfig) => {
	let needsRestart = false;

	// Mailhog
	const useMailhog = projectConfig?.use?.indexOf('mailhog') >= 0;
	if (useMailhog && !dockerConfig.services?.mailhog) {
		needsRestart = true;
		dockerConfig.services.mailhog = {
			image: 'mailhog/mailhog:v1.0.0',
			ports: ['1025:1025', '8025'],
		};
		echo('\x1b[1mNB:\x1b[22m In order to use Mailhog `wp_mail_from` filter must be set, e.g.:');
		echo("    add_filter('wp_mail_from', fn($email) => 'wordpress@fabrica.dev');");
		echo("    add_filter('wp_mail_from_name', fn($name) => 'Fabrica');\n");
	} else if (!useMailhog && dockerConfig.services?.mailhog) {
		needsRestart = true;
		delete dockerConfig.services.mailhog;
	}

	// PHPUnit
	const usePhpUnit = projectConfig?.use?.indexOf('phpunit') >= 0;
	if (usePhpUnit && !dockerConfig.services?.wp_tests) {
		needsRestart = true;
		dockerConfig.services.db_tests = {...dockerConfig.services.db};
		dockerConfig.services.db_tests.volumes = ['db-tests:/var/lib/mysql'];
		dockerConfig.services.wp_tests = {...dockerConfig.services.wp};
		const volumeIndex = dockerConfig.services.wp_tests.volumes.indexOf('./www:/var/www/html');
		if (volumeIndex >= 0) {
			dockerConfig.services.wp_tests.volumes[volumeIndex] = 'www_tests:/var/www/html';
		}
		dockerConfig.services.wp_tests.volumes.push('./provision/phpunit:/var/www/phpunit');
		dockerConfig.services.wp_tests.environment.WORDPRESS_DB_HOST = 'db_tests';
	}

	return [needsRestart, dockerConfig];
}

// Check if there are any new resources and add paths accordingly to `docker-compose.yml` volumes
const configResources = (project='default') => {
	const projectConfig = getProjectConfig(project);
	let dockerConfig, needsRestart;
	try {
		dockerConfig = yaml.load(sh.cat(`./docker-compose.yml`));
	} catch (ex) {
		warn(`Error loading 'docker-compose.yml' or 'config.yml'`);
		return;
	}

	// look for resources that haven't got a matching volume configured
	const isResourceVolume = volume => !/^\.\/(www$|provision\/)/.test(volume.split(':')[0]),
		volumes = [];
	let existsNewVolumes = false,
		oldVolumes = dockerConfig.services.wp.volumes.filter(isResourceVolume);
	if (!projectConfig || projectConfig.length == 0) {
		warn('No resources found in the config file.');
		return;
	}

	// setup themes and plugins volumes
	['themes', 'plugins'].forEach(resourceType => {
		const resources = projectConfig[resourceType];
		if (!resources) {
			echo(`No ${resourceType} found in the config file.`);
			return;
		}
		volumes.splice(volumes.length, 0, ...resources.map(data => {
			const sourcePath = typeof data === 'object' ? data.path : data,
				resourceName = sourcePath.replace(/\/$/, '').split('/').pop(),
				destPath = path.resolve('/var/www/html/wp-content/', resourceType, resourceName),
				rest = oldVolumes.filter(volume => volume.split(':')[0] != sourcePath);
			if (rest.length == oldVolumes.length) {
				echo(`New volume for '${sourcePath}'`);
				existsNewVolumes = true;
			}
			oldVolumes = rest;
			return `${sourcePath}:${destPath}`;
		}));
	});
	// no changes if all resources were found in volumes and all volumes found in resources
	const volumesChanged = existsNewVolumes || oldVolumes.length != 0;

	[needsRestart, dockerConfig] = configServices(projectConfig, dockerConfig);
	needsRestart ||= volumesChanged;

	if (!needsRestart) {
		// no containers changed: no need to wait for new port
		return new Promise(resolve => resolve());
	}

	if (volumesChanged) {
		// there are new volumes: write new Docker Compose configuration and restart containers
		dockerConfig.services.web.volumes = dockerConfig.services.web.volumes.filter(
			volume => !isResourceVolume(volume)
		).concat(volumes);
		dockerConfig.services.wp.volumes = dockerConfig.services.wp.volumes.filter(
			volume => !isResourceVolume(volume)
		).concat(volumes);
	}

	// Save configuration changes and restart
	sh.ShellString(yaml.dump(dockerConfig)).to('docker-compose.yml');
	echo('Bringing Docker containers up to update resources volumes...');
	if (spawn(['docker', 'compose', 'up', '-d', '--remove-orphans']) !== 0) {
		halt('Docker containers failed to start.');
	}

	return waitForWebContainer(true);
}

// Build resources concurrently
const buildResources = (project='default', task='build') => {
	const projectConfig = getProjectConfig(project);

	try {
		let names = [],
			cmds = [];
		['themes', 'plugins'].forEach(resourceType => {
			const resources = projectConfig[resourceType];
			if (!resources) { return; }
			for (let resource of resources) {
				const name = resource.replace(/\/$/, '').split('/').pop();
				if (!sh.test('-f', `${resource}/package.json`)) {
					warn(`'package.json' for resource '${name}' not found in '${resource}/package.json'`);
					continue;
				}

				names.push(name);
				cmds.push(`"cd ${resource}; npx wp-scripts ${task}"`);
			}
		});
		if (names.length <= 0) {
			halt('No resources found in the config file to build or watch.');
		}
		echo(`npx concurrently -c white.dim -n ${names.join(',')} ${cmds.join(' ')}`);
		spawn(['npx', 'concurrently', '-c', 'white.dim', '-n', names.join(','), ...cmds]);
	} catch (ex) {
		warn('Error watching: ' + ex);
	}
}

// Upload resources built files to server
const deploy = (project='default', options) => {
	const buildIgnoreParams = (distignore) => {
		if (!distignore) { return ''; }
		return distignore.map(item => {
			let glob = item.replace(/#.*/, '').trim(),
				option = 'exclude';
			// invert ignore (includes)
			if (glob.startsWith('!')) {
				option = 'include';
				glob = glob.substr(1);
			}
			// lftp doesn't support exclude for folders on root only through globs: add exclude folder glob and a recursive glob to include all subfolders with folder
			if (glob.search(/^\.?\//) >= 0) {
				glob = glob.replace(/^\.?\//, '');
				glob = `${glob} --${option == 'exclude' ? 'include' : 'exclude'}-glob **/${glob}`;
			}
			return glob !== '' ? `--${option}-glob ${glob}` : '';
		}).join(' ');
	}

	try {
		const projectConfig = getProjectConfig(project),
			ftp = projectConfig.ftp;
		if (!projectConfig || !ftp || !ftp.host) {
			warn('Settings for FTP upload not found');
			return;
		}
		['themes', 'plugins'].forEach(resourceType => {
			const resources = projectConfig[resourceType];
			if (!resources) { return; }
			for (let resource of resources) {
				const name = resource.replace(/\/$/, '').split('/').pop();
				if (!sh.test('-d', resource)) {
					warn(`Path for resource '${name}' not found`);
					continue;
				}
				echo(`Deploying resource '${name}' to '${ftp.host}'...`);

				// file patterns to exclude
				const distignorePath = path.join(resource, '.distignore'),
					ignore = sh.test('-f', distignorePath) ? buildIgnoreParams(sh.cat(distignorePath).split('\n')) : '';

				// extra `mirror` parameters
				const params = ftp?.params ? ftp.params.join(' ') : '',
					destPath = path.join(ftp.path || '', `wp-content/${resourceType}`),
					url = `${ftp?.scheme || 'ftp'}://${encodeURIComponent(ftp.user)}${ftp.password ? `:${encodeURIComponent(ftp.password)}` : ''}@${ftp.host}${ftp.port ? `:${ftp.port}` : ''}`,
					commands = [...ftp.commands];

				// open command
				commands.push(`open ${url}`);

				if (options.backup) {
					// copy old folder
					const backupName = `${name}_${(new Date()).toISOString()}`;
					commands.push(...[
						`echo "Copying original resource folder '${name}' to '${backupName}' in '${ftp.host}'..."`,
						'set ftp:use-fxp yes',
						`mirror ${path.join(destPath, name)} ${new URL(path.join(destPath, backupName), url).href}`,
						`echo "Original theme backed up. Uploading updated files to '${name}'..."`
					]);
				}

				// mirror command
				commands.push(`mirror --reverse --verbose=1 ${params} ${ignore} ${resource} ${path.join(destPath, name)}`);
				spawn(['lftp', '-c', commands.join('; ') + '; ']);
			}
		});
	} catch (ex) {
		warn('Error deploying: ' + ex);
	}
}

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

// add commands for project's root `package.json` if current path is part of a project
const addScriptCommands = () => {
	if (!project.isInstalled) { return; }

	const packageManager = sh.test('-f', `${project.rootDir}/yarn.json`) ? 'yarn' : 'npm';

	const scripts = project.package.scripts,
		scriptsInfo = (project.package.fabrica_dev_kit || {}).scripts_info || {};
	for (let command of Object.keys(scripts)) {
		let script = scripts[command],
			commandInfo = scriptsInfo[command],
			argumentsInfo = '';
		if (!commandInfo) {
			commandInfo = '`' + (script.length > 80 ? script.substr(0, 80) + '…' : script) + '`';
		} else if (Array.isArray(commandInfo)) {
			[commandInfo, argumentsInfo] = commandInfo;
			argumentsInfo = ' ' + argumentsInfo;
		}
		program.command(command + argumentsInfo)
			.description(`from 'package.json': ${commandInfo}`)
			.action(() => {
				spawn([packageManager, 'run', ...process.argv.slice(2)]);
			});
	}
};

// add project-specific commands (ie., not available on folders outside a project that hasn't been set up yet)
const addProjectCommands = () => {
	if (!project.isInstalled) { return; }

	if (project.version >= 3) {
		program.command('config:url')
			.description('Update URLs in DB to match changes to WP container port set automatically by Docker (except for multisite projects, where a custom local host/domain is used). Output current access URLs and ports')
			.action(configURL);
		program.command('config:resources [project]')
			.description(`Configure Docker volumes to match resources' paths in the 'config.yml' settings file if there are new resources under <project>. If no <project> is passed,  resources under 'default' will be checked`)
			.action(configResources);
		program.command('config:all [project]')
			.description('Run all project configuration tasks (config:url and config:resources)')
			.action((project) => {
				configResources(project)
				.then(configURL);
			});
		program.command('urls')
			.description('Output current access URLs and ports')
			.action(() => echoInfo());
		program.command('build [project]')
			.description(`Run a simultaneous build on all project resources`)
			.action((project = 'default') => buildResources(project, 'build'));
		program.command('start [project]')
			.description(`Run a simultaneous watch on all project resources`)
			.action((project = 'default') => buildResources(project, 'start'));
		program.command('deploy [project]')
			.description(`Deploy resources to server according to configuration in 'config.yml' file. If no <project> is passed, settings under 'default' will be loaded. Files and folders matching patterns in resource '.distignore' file will be ignored`)
			.option('-k, --backup', 'backup existing resources folders before updating')
			.action(deploy);
	}
	addScriptCommands();
};


// fabrica-wp/fabrica-dev-kit#34 / docker/compose#5696 fix
sh.env['COMPOSE_INTERACTIVE_NO_CLI'] = 1;
// set command line options
program.version(VERSION)
	.usage('[options] <command>')
	.description(`Run 'init [slug]' to start a new project.\n\n    fdk <command> -h\tquick help on <command>`);
// `init` command
program.command('init [slug]')
	.description('Start a new project folder called <slug> containing the \'setup.yml\' configuration file. <slug> must be unique and no other Docker Compose project should share this name. All optional arguments will be set in the \'setup.yml\' file and can be modified there.')
	.option('-d, --create-dir', 'create folder for project with <slug> name (current folder will be used for new project if not passed)')
	.option('-t, --title <title>', 'project title')
	.option('--wp_admin_user <username>', 'WordPress admin username')
	.option('--wp_admin_pass <password>', 'WordPress admin password')
	.option('--wp_admin_email <email>', 'WordPress admin email')
	.option('-m, --multisite', 'support multisite network')
	.action(init);
// `setup` command
program.command('setup')
	.description('Setup project based on setting on \'setup.yml\' file')
	.option('--reinstall', 'Reuse settings for previously setup project and ignore if Docker containers are already in use for project <slug>. \'.setup.yml\' will be used for configuration if \'setup.yml\' is not available.')
	.action(setup);
// load settings if executed in a project that's already been set up
loadProjectSettings();
if (project.isInstalled) {
	// add project-specific scripts (including those in `package.json`)
	addProjectCommands();
}
// default
program.command('*', null, { noHelp: true })
	.action(() => {
		console.warn(`Invalid command: ${program.args.join(' ')}\n`);
		program.help();
	});
// finalize `commander` config
program.parse(process.argv);
// show help if no arguments are passed
if (!process.argv.slice(2).length) { program.help(); }
