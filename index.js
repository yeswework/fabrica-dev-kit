#!/bin/sh
":" //# https://fabri.ca/; exec /usr/bin/env node --noharmony "$0" "$@"

'use strict';

const path = require('path'),
	program = require('commander'),
	Promise = require('promise'),
	sh = require('shelljs'),
	yaml = require('js-yaml');

const { echo, execWP, halt, spawn, warn } = require('./lib/util'),
	{ getProjectConfig } = require('./lib/config'),
	{ loadProjectSettings, project } = require('./lib/project'),
	{ PORTLESS_CONFIG_EXTRA, checkPortless, removePortlessAlias, setupPortlessAlias } = require('./lib/portless'),
	{ getDBPort, getServicesPorts, getSiteURL, getWebPort, waitForWebContainer } = require('./lib/docker'),
	{ init, setup } = require('./lib/setup'),
	{ deploy } = require('./lib/deploy');

// Fabrica Dev Kit version
const VERSION = require('./package.json')['version'];

// check Fabrica dependencies
const checkDependencies = () => {
	const dependencies = ['docker'];
	for (const dependency of dependencies) {
		if (sh.exec(`hash ${dependency} 2>/dev/null`, {silent: true}).code === 0) { continue; }
		halt(`Could not find dependency '${dependency}'.`);
	}
}
checkDependencies();


// ——— Project-specific (post-initialization) commands ————

const echoInfo = (siteURL, isConfig=false) => {
	// output site URLs and ports
	if (!siteURL) {
		siteURL = getSiteURL();
	}
	if (!siteURL) {
		if (!isConfig) {
			echo(`Services are not started, please run \x1b[1mfdk config:all\x1b[22m to start them\n(Note: if services fail to start, please check \x1b[1mfdk logs\x1b[22m for PHP errors)`);
		} else {
			echo(`Services have not started, please wait or check \x1b[1mfdk logs\x1b[22m for PHP errors`);
		}
		return;
	}
	const dbPort = getDBPort();
	const servicesPorts = getServicesPorts();

	// detect portless to show fallback hint
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
		if (spawn(['docker', 'compose', 'up', '-d']).status !== 0) {
			halt('Docker containers failed to start.');
		}

		// try to get site URL again
		await waitForWebContainer(true);
		siteURL = getSiteURL();
	}

	// detect if portless is active in config.yml
	const usePortless = getProjectConfig('default')?.use?.indexOf('portless') >= 0,
		portlessAvailable = checkPortless(),
		webPort = getWebPort();
	// Extract port from siteURL only if the URL actually has one (localhost:port or hostname:port)
	const sitePort = siteURL.includes(':') && siteURL.lastIndexOf(':') > siteURL.lastIndexOf('/') ? siteURL.replace(/^.*:(\d+)$/g, '$1') : null;

	let portlessURL,
		webURL = `localhost:${webPort}`;
	if (usePortless && portlessAvailable) {
		// create/refresh the portless alias and get the actual proxy URL (protocol + port)
		portlessURL = setupPortlessAlias(project.slug, webPort);
		if (portlessURL) {
			webURL = portlessURL;
		} else {
			// alias creation failed; fall back to localhost handling below
			warn('Portless alias creation failed, falling back to localhost URL.');
		}
	} 
	
	// Need to update if:
	//  (a) we have a portless URL and it differs from the current site URL, OR
	//  (b) we have a localhost URL and the Docker port changed
	const needsUpdate = portlessURL && siteURL !== webURL || !portlessURL && sitePort && sitePort !== webPort;
	if (needsUpdate) {
		// URL changed — search-replace content and update siteurl/home
		echo(`Updating WordPress URL from ${siteURL} to ${webURL}...`);
		execWP(`wp search-replace --quiet "${siteURL}" "${webURL}"`);
		if (!siteURL.startsWith('http')) {
			// `wp search-replace` supports regex but it's up to 15 times slower, so it's more efficient to just repeate the command
			execWP(`wp search-replace --quiet "http://${siteURL}" "${webURL}"`);
			execWP(`wp search-replace --quiet "https://${siteURL}" "${webURL}"`);
		}
		execWP(`bash -c \'wp option update home "${webURL}" && wp option update siteurl "${webURL}"\'`);
	}

	echoInfo(webURL, true);
};

// Check if there are any new services to add to `docker-compose.yml`
const configServices = (projectConfig, dockerConfig) => {
	let needsRestart = false;

	// Portless: migrate existing projects by injecting the forwarded-header trust snippet
	// into the wp container. Without it WordPress canonicalises to the internal backend
	// address (301 -> https://127.0.0.1/). Flagging needsRestart recreates wp so the env lands.
	const usePortless = projectConfig?.use?.indexOf('portless') >= 0;
	if (usePortless && dockerConfig.services?.wp) {
		dockerConfig.services.wp.environment ||= {};
		if (dockerConfig.services.wp.environment.WORDPRESS_CONFIG_EXTRA !== PORTLESS_CONFIG_EXTRA) {
			needsRestart = true;
			dockerConfig.services.wp.environment.WORDPRESS_CONFIG_EXTRA = PORTLESS_CONFIG_EXTRA;
		}
	}

	// Mailpit
	const useMailpit = projectConfig?.use?.indexOf('mailpit') >= 0,
		mailpitShareVolume = 'mailpit_bin:/opt/mailpit:ro';
	if (useMailpit && !dockerConfig.services?.mailpit) {
		needsRestart = true;
		dockerConfig.services.mailpit = {
			image: 'axllent/mailpit:latest',
			entrypoint: ['/bin/sh', '-c', 'cp -f /mailpit /shared/mailpit && exec /mailpit'],
			volumes: ['mailpit_bin:/shared'],
			ports: ['8025'],
		};
		dockerConfig.volumes.mailpit_bin = {};
		if (!dockerConfig.services.wp.volumes.includes(mailpitShareVolume)) {
			dockerConfig.services.wp.volumes = [mailpitShareVolume, ...dockerConfig.services.wp.volumes];
		}
		echo('\x1b[1mNB:\x1b[22m In order to use Mailpit `wp_mail_from` filter must be set, e.g.:');
		echo("    add_filter('wp_mail_from', fn($email) => 'wordpress@fabrica.dev');");
		echo("    add_filter('wp_mail_from_name', fn($name) => 'Fabrica');\n");
	} else if (!useMailpit && dockerConfig.services?.mailpit) {
		needsRestart = true;
		dockerConfig.services.wp.volumes = dockerConfig.services.wp.volumes.filter(v => v !== mailpitShareVolume);
		delete dockerConfig.volumes.mailpit_bin;
		delete dockerConfig.services.mailpit;
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

	// Portless cleanup: if 'portless' is not in the 'use' array but an alias exists, remove it
	if (!projectConfig?.use?.includes('portless')) {
		removePortlessAlias(project.slug);
	}

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
	if (spawn(['docker', 'compose', 'up', '-d', '--remove-orphans']).status !== 0) {
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
				cmds.push(`"cd ${resource}; npm run ${task}"`);
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
			.description('Update URLs in DB to match changes to WP container port set automatically by Docker. Output current access URLs and ports')
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
			.option('-f, --force', `deploy even if the remote 'acf-json' has diverged from the local one`)
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
