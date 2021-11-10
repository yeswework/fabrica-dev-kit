const path = require('path'),
	fs = require('fs'),
	yaml = require('js-yaml');

const echo = (message) => console.log('FDK:', message);
const warn = (message) => console.warn('FDK:', message);
const error = (message, halt = true) => {
	console.error('FDK:', message);
	if (halt) { process.exit(1); }
}

module.exports = projectPath => (env=[]) => {
	// Set up
	let resourcesConfig;
	const resourcesConfigPath = path.resolve(projectPath, `config.yml`);
	try {
		resourcesConfig = yaml.safeLoad(fs.readFileSync(resourcesConfigPath))[env.fdk_project || 'default'];
	} catch (ex) {
		error(`Error loading project settings file at '${resourcesConfigPath}'`);
	}
	const configList = [],
		wpContentPath = 'www/wp-content/';

	// Compile resource configs
	const defaultEntryIndex = path.resolve(projectPath, 'src/index.js'),
		defaultOutputPath = path.resolve(projectPath, 'build');
	let foundResources = false;
	['plugins', 'themes'].forEach(resourceType => {
		const resources = resourcesConfig[resourceType];
		if (!resources) {
			echo(`No ${resourceType} found in the config file.`);
			return;
		}

		// Process each resource config
		resources.forEach(resource => {
			const resourcePath = typeof resource === 'object' ? resource.path : resource,
				resourceName = resourcePath.replace(/\/$/, '').split('/').pop(),
				sourcePath = path.resolve(projectPath, resourcePath),
				sourceConfigPath = path.resolve(sourcePath, 'webpack.config.js');
			echo(`Processing ${resourceType}: ${resourceName}`);
			if (!fs.existsSync(sourcePath)) {
				warn('Cannot find source folder');
				return;
			}
			foundResources = true;

			// If this resource has a webpack config, use it to build
			// Change default relative paths to absolute ones where necessary
			try {
				const config = require(sourceConfigPath);
				if (config.entry.index == defaultEntryIndex) {
					config.entry.index = path.resolve(sourcePath, 'src/index.js');
				}
				if (config.output.path == defaultOutputPath) {
					config.output.path = path.resolve(sourcePath, 'build');
				}
				config.resolve = { modules: [path.resolve(sourcePath, 'node_modules')] };
				config.resolveLoader = { modules: [path.resolve(sourcePath, 'node_modules')] };
				configList.push(config);
			} catch (e) { // No webpack config
				if (fs.existsSync(sourceConfigPath)) {
					warn(`Error loading webpack config for ${resourceName}: '${e}'`);
				} else {
					warn(`No webpack config found for ${resourceName}`);
				}
			}
		});
	});

	if (!foundResources) {
		warn(`No resources found in the config file. Setup resources to import in ${resourcesConfigPath}`);
	}

	// Add extra config to copy all compiled files into active WP installation
	configList.push({
		entry: path.resolve(projectPath, 'index.js'),
		output: { path: path.resolve(projectPath, wpContentPath) },
	});

	return configList;
}
