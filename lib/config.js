'use strict';

const sh = require('shelljs'),
	yaml = require('js-yaml');

const { halt } = require('./util');

// A config that can't be read has to stop the command rather than stand in for an empty one:
// callers diff what comes back against `docker-compose.yml`, so 'no resources' reads as 'unmount
// every theme and plugin'. Each failure needs its own check — `sh.cat` doesn't throw on a file
// that isn't there, and `yaml.load` of an empty one returns `undefined`, so neither would ever
// reach the catch
const loadConfig = () => {
	if (!sh.test('-f', './config.yml')) {
		halt(`Could not find 'config.yml' in '${process.cwd()}'.`);
	}
	let resourcesConfig;
	try {
		resourcesConfig = yaml.load(sh.cat('./config.yml').toString());
	} catch (ex) {
		halt(`Error loading 'config.yml':\n${ex.message}`);
	}
	if (!resourcesConfig || typeof resourcesConfig !== 'object') {
		halt(`'config.yml' holds no configuration.`);
	}
	return resourcesConfig;
};

// `projectName` is a section name in `config.yml` — `default`, `staging` — not the project state
// object exported by `./project`. Nothing here calls that identifier `project`, so a later edit
// can't reach for the state and silently get a string instead; see fabrica-dev-kit-5kx
const getProjectConfig = (projectName, resourcesConfig = loadConfig()) => {
	const projectConfig = resourcesConfig[projectName];
	if (!projectConfig) {
		halt(`Project '${projectName}' not found in the config file.`)
	} else if (typeof projectConfig !== 'object' || Array.isArray(projectConfig)) {
		// valid YAML of the wrong shape reads as a section with no themes and no plugins, which
		// is the same unmount-everything outcome by another route
		halt(`Project '${projectName}' in 'config.yml' is not a set of settings.`);
	} else if (projectConfig.extend && !resourcesConfig[projectConfig.extend]) {
		halt(`Project '${projectName}' extends '${projectConfig.extend}' which was not found in the config file.`);
	} else if (projectConfig.extend) {
		// extend project configuration from other projects in the config file
		return {
			...resourcesConfig[projectConfig.extend],
			...projectConfig
		};
	}
	return projectConfig;
};

const RESOURCE_TYPES = ['themes', 'plugins'];

// Every theme and plugin a section lists, with the folder name WordPress knows it by
const projectResources = projectConfig => RESOURCE_TYPES.flatMap(resourceType =>
	(projectConfig[resourceType] || []).map(resource => ({
		resourceType,
		resource,
		name: resource.replace(/\/$/, '').split('/').pop(),
	})));

module.exports = { RESOURCE_TYPES, getProjectConfig, loadConfig, projectResources };
