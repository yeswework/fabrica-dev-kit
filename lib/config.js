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
		// `bw` ends its answer with a line break, which isn't part of the password; any other
		// whitespace may be
		secrets.set(value, result.stdout.replace(/\r?\n$/, ''));
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

const RESOURCE_TYPES = ['themes', 'plugins'];

// Settings an older FDK read, under a name or in a form this one doesn't, would otherwise go
// unread without a word: a `wp:` block left in place drops the home check before a push over SSH,
// and an entry that isn't a path throws from `projectResources`
const checkSettings = (projectName, projectConfig) => {
	if (projectConfig.wp) {
		halt(`'${projectName}' in 'config.yml' has 'wp:' settings, which FDK now reads as 'rest:': rename the key, and 'appPassword' under it to 'application_password'.`);
	} else if (projectConfig.rest?.appPassword !== undefined) {
		halt(`'rest.appPassword' under '${projectName}' in 'config.yml' is now 'rest.application_password': rename the key.`);
	}
	for (const resourceType of RESOURCE_TYPES) {
		const list = projectConfig[resourceType] || [];
		if (!Array.isArray(list) || list.some(resource => typeof resource !== 'string' || !resource)) {
			halt(`'${resourceType}' under '${projectName}' in 'config.yml' must be a list of paths, each written as '- ./path': not '- path: ./path', and no empty '-'.`);
		}
	}
	return projectConfig;
};

// Follows `extend` to the root section, laying each section over the one it extends. `ftp:` merges
// key by key, so a variant can add `params` without restating the host and credentials
const resolveSection = (resourcesConfig, sectionName, chain = []) => {
	const section = resourcesConfig[sectionName];
	if (chain.includes(sectionName)) {
		halt(`Sections in 'config.yml' extend each other in a loop: '${[...chain, sectionName].join(`' extends '`)}'.`);
	} else if (!section) {
		halt(chain.length
			? `Project '${chain.at(-1)}' extends '${sectionName}' which was not found in the config file.`
			: `Project '${sectionName}' not found in the config file.`);
	} else if (typeof section !== 'object' || Array.isArray(section)) {
		// valid YAML of the wrong shape reads as a section with no themes and no plugins, which
		// is the same unmount-everything outcome by another route
		halt(`Project '${sectionName}' in 'config.yml' is not a set of settings.`);
	}
	if (!section.extend) { return section; }
	const parent = resolveSection(resourcesConfig, section.extend, [...chain, sectionName]);
	return {
		...parent,
		...section,
		...(parent.ftp && section.ftp && { ftp: { ...parent.ftp, ...section.ftp } }),
	};
};

// `projectName` is a section name in `config.yml` — `default`, `staging` — not the project state
// object exported by `./project`. Nothing here calls that identifier `project`, so a later edit
// can't reach for the state and silently get a string instead; see fabrica-dev-kit-5kx
const getProjectConfig = (projectName, resourcesConfig = loadConfig()) =>
	checkSettings(projectName, resolveSection(resourcesConfig, projectName));

// Every theme and plugin a section lists, with the folder name WordPress knows it by
const projectResources = projectConfig => RESOURCE_TYPES.flatMap(resourceType =>
	(projectConfig[resourceType] || []).map(resource => ({
		resourceType,
		resource,
		name: resource.replace(/\/$/, '').split('/').pop(),
	})));

module.exports = { RESOURCE_TYPES, getProjectConfig, loadConfig, projectResources, resolveSecret };
