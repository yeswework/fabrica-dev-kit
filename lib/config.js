'use strict';

const { spawnSync } = require('child_process'),
	sh = require('shelljs'),
	yaml = require('js-yaml');

const { halt } = require('./util');

// A password written as a Bitwarden reference (`bw://<item name>`) keeps the secret out of
// `config.yml`, so the file can be committed. Resolved only where a connection is opened, not when
// the section is read: many projects keep `ftp:` under `default`, which `fdk start` reads, and that
// must not prompt for Bitwarden. Cached because deploy and drift connect once per resource
const secrets = new Map();
let bwSession;
const resolveSecret = value => {
	if (typeof value !== 'string' || !value.startsWith('bw://')) {
		return value;
	}
	if (!secrets.has(value)) {
		// `bw` reads only from an unlocked session: the one exported in BW_SESSION, or else the one
		// saved in the login keychain, which reaches shells that keep no exports, such as an agent's
		bwSession ??= process.env.BW_SESSION
			|| spawnSync('security', ['find-generic-password', '-s', 'bw-session', '-w'], { encoding: 'utf8' }).stdout?.trim();
		if (!bwSession) {
			halt(`'config.yml' reads '${value}' from Bitwarden, which needs an unlocked vault: save one with \`security add-generic-password -U -a "$USER" -s bw-session -w "$(bw unlock --raw)"\`, or export BW_SESSION`);
		}
		const result = spawnSync('bw', ['get', 'password', '--nointeraction', value.slice('bw://'.length)],
			{ encoding: 'utf8', env: { ...process.env, BW_SESSION: bwSession } });
		if (result.error) {
			halt(`'config.yml' reads '${value}' from Bitwarden, but the Bitwarden CLI ('bw') could not be run: ${result.error.message}`);
		} else if (result.status !== 0) {
			halt(`Could not read '${value}' from Bitwarden:\n${result.stderr.trim()}`);
		}
		secrets.set(value, result.stdout);
	}
	return secrets.get(value);
};

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

module.exports = { getProjectConfig, loadConfig, resolveSecret };
