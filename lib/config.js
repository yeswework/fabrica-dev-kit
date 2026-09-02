'use strict';

const sh = require('shelljs'),
	yaml = require('js-yaml');

const { halt } = require('./util');

// NB: `project` here is a section name in `config.yml`, not the project state object
// exported by `./project` — see fabrica-dev-kit-5kx before importing both into one file
const getProjectConfig = (project, resourcesConfig = false) => {
	if (!resourcesConfig) {
		// A config that can't be read has to stop the command rather than stand in for an empty
		// one: callers diff what comes back against `docker-compose.yml`, so 'no resources' reads
		// as 'unmount every theme and plugin'. Each failure needs its own check — `sh.cat` doesn't
		// throw on a file that isn't there, and `yaml.load` of an empty one returns `undefined`,
		// so neither would ever reach the catch
		if (!sh.test('-f', './config.yml')) {
			halt(`Could not find 'config.yml' in '${process.cwd()}'.`);
		}
		try {
			resourcesConfig = yaml.load(sh.cat('./config.yml').toString());
		} catch (ex) {
			halt(`Error loading 'config.yml':\n${ex.message}`);
		}
		if (!resourcesConfig || typeof resourcesConfig !== 'object') {
			halt(`'config.yml' holds no configuration.`);
		}
	}
	const projectConfig = resourcesConfig[project];
	if (!projectConfig) {
		halt(`Project '${project}' not found in the config file.`)
	} else if (typeof projectConfig !== 'object' || Array.isArray(projectConfig)) {
		// valid YAML of the wrong shape reads as a section with no themes and no plugins, which
		// is the same unmount-everything outcome by another route
		halt(`Project '${project}' in 'config.yml' is not a set of settings.`);
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

module.exports = { getProjectConfig };
