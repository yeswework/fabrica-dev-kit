const path = require('path'),
	fs = require('fs'),
	yaml = require('js-yaml');

const echo = (message) => console.log('FDK:', message);
const warn = (message) => console.warn('FDK:', message);
const error = (message, halt = true) => {
	console.error('FDK:', message);
	if (halt) { process.exit(1); }
}

module.exports = env => {
	// Set up
	let resources;
	const resourcesConfigPath = `./resources/${env.fdk_project || 'index'}.yml`;
	try {
		resources = yaml.safeLoad(fs.readFileSync(resourcesConfigPath));
	} catch (ex) {
		error(`Error loading project settings file at '${resourcesConfigPath}'`);
	}
	const configList = [],
		wpContentPath = 'www/wp-content/';

	// Compile resource configs
	const defaultEntryIndex = path.resolve(__dirname, 'src/index.js'),
		defaultOutputPath = path.resolve(__dirname, 'build');
	let foundResources = false;
	Object.entries(resources).forEach(([resourceType, resource]) => {

		if (!resource) {
			echo(`No ${resourceType} found in the resource file.`);
			return;
		}

		// Process each resource config
		resource.forEach(resourcePath => {
			const resourceName = resourcePath.replace(/\/$/, '').split('/').pop(),
				sourcePath = path.resolve(__dirname, resourcePath),
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
					warn(`Error loading webpack config for ${resourceName}. Copying content anyway`);
				} else {
					warn(`No webpack config found for ${resourceName}. Copying content anyway`);
				}
			}
		});
	});

	if (!foundResources) {
		warn(`No resources found in the resource file. Setup resources to import in ${resourcesConfigPath}.`);
	}

	// Add extra config to copy all compiled files into active WP installation
	configList.push({
		entry: path.resolve(__dirname, 'resources/index.js'),
		output: { path: path.resolve(__dirname, wpContentPath) },
	});

	return configList;
}
