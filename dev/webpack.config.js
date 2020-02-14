const path = require('path'),
	copyPlugin = require('copy-webpack-plugin'),
	glob = require('glob'),
	del = require('del'),
	fs = require('fs'),
	yaml = require('js-yaml');

module.exports = env => {
	// Set up
	let resources;
	const resourcesConfigPath = `./resources/${env.fdk_project || 'index'}.yml`;
	try {
		resources = yaml.safeLoad(fs.readFileSync(resourcesConfigPath));
	} catch (ex) {
		console.error(`Error loading project settings file at '${resourcesConfigPath}'`);
		process.exit(1);
	}
	const resourceTypes = Object.keys(resources),
		configList = [],
		copyList = [],
		wpContentPath = 'www/wp-content/',
		ignores = [
			'node_modules/**',
			'.git/**',
			'src/**',
			'.gitignore',
			'.gitmodules',
			'webpack.config.js',
			'package.json',
			'package-lock.json',
			'.DS_Store',
		];

	// Compile resource configs
	const defaultEntryIndex = path.resolve(__dirname, 'src/index.js'),
		defaultOutputPath = path.resolve(__dirname, 'build');
	resourceTypes.forEach(resourceType => {

		// Process each resource config
		resources[resourceType].forEach(resourcePath => {

			let resourceName = resourcePath.split('/').pop();
			console.log('FDK: processing ' + resourceType + ': ' + resourceName);
			const sourcePath = path.resolve(__dirname, resourcePath);
			if (!fs.existsSync(sourcePath)) {
				console.log('FDK: cannot find source folder');
				return;
			}

			// If this resource has a webpack config, use it to build
			// Change default relative paths to absolute ones where necessary
			try {
				const config = require(path.resolve(sourcePath, 'webpack.config.js'));
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
				console.log('FDK: ' + resourceName + ' does not have a webpack config, copying anyway');
			}

			// Assemble list of files to copy, pre-filtered for ignores
			// (the `ignores` setting slows down the copy plugin/watch immensely)
			const destPath = path.resolve(wpContentPath, resourceType, resourceName);
			glob('*', { cwd: sourcePath, ignore: ignores }, (er, files) => {
				files.forEach(file => {
					copyList.push({ from: path.resolve(sourcePath, file), to: path.resolve(destPath, file) });
				});
			});

			// Empty resource folder ready for fresh version
			console.log('FDK: emptying ' + path.resolve(destPath));
			del([path.resolve(destPath)], { force: true });
		});
	});

	// Add extra config to copy all compiled files into active WP installation
	configList.push({
		entry: path.resolve(__dirname, 'resources/index.js'),
		output: { path: path.resolve(__dirname, wpContentPath) },
		plugins: [new copyPlugin(copyList)],
	});

	return configList;
}
