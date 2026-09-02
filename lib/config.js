'use strict';

const sh = require('shelljs'),
	yaml = require('js-yaml');

const { halt, warn } = require('./util');

// NB: `project` here is a section name in `config.yml`, not the project state object
// exported by `./project` — see fabrica-dev-kit-5kx before importing both into one file
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

module.exports = { getProjectConfig };
