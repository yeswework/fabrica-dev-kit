var autoprefixer = require('autoprefixer'),
	browserSync = require('browser-sync').create(),
	changed = require('gulp-changed'),
	cssnano = require('gulp-cssnano'),
	del = require('del'),
	exec = require('child_process').execSync,
	fs = require('fs'),
	gulp = require('gulp'),
	imagemin = require('gulp-imagemin'),
	mergeStream = require('merge-stream'),
	named = require('vinyl-named');
	path = require('path'),
	postcss = require('gulp-postcss'),
	postcssEach = require('postcss-each'),
	postcssEasyMediaQuery = require('postcss-easy-media-query'),
	postcssFontpath = require('postcss-fontpath'),
	postcssImport = require('postcss-import'),
	postcssMixins = require('postcss-mixins'),
	postcssNested = require('postcss-nested'),
	postcssNestedProps = require('postcss-nested-props'),
	postcssReporter = require('postcss-reporter'),
	postcssSimpleVars = require('postcss-simple-vars'),
	posthtml = require('gulp-posthtml'),
	posthtmlBem = require('posthtml-bem'),
	rename = require('gulp-rename'),
	sourcemaps = require('gulp-sourcemaps'),
	stylelint = require('stylelint'),
	tap = require('gulp-tap'),
	uglify = require('gulp-uglify'),
	webpack = require('webpack-stream'),
	yaml = require('js-yaml');

// Initialise assets timestamps, later set by respective functions, and used by functions()
var scriptBuildTime, styleBuildTime;

// Load project settings
var packageData;
try {
	packageData = require('./src/package.json');
} catch (ex) {
	console.error('Error loading source `package.json` file.', ex);
	return;
}
var settings = {
	slug: packageData.name,
	title: packageData.description,
	author: packageData.author,
};
try {
	settings.webPort = exec('docker-compose port web 80').toString().replace(/^.*:(\d+)\n$/g, '$1');
	settings.dbPort = exec('docker-compose port db 3306').toString().replace(/^.*:(\d+)\n$/g, '$1');
} catch (ex) {
	console.error('Error obtaining containers access ports.', ex);
	return;
}

// Load optional imports file
try {
	settings.imports = yaml.safeLoad(fs.readFileSync('./config/imports.yml', 'utf8'));
} catch (ex) {
	settings.imports = {}; // ignore
}
var processImportData = function(dataOrPath) {
	var importData = (dataOrPath instanceof Object) ? dataOrPath : { path: dataOrPath };

	importData.path = path.resolve(importData.path.replace(/^~/, require('os').homedir()));
	importData.watch = importData.watch || '**/*.{php,css,js}';
	importData.watchPath = path.join(importData.path, importData.watch);
	importData.include = importData.include || '**';
	importData.src = [path.join(importData.path, importData.include)];
	if (importData.exclude) {
		importData.src.push('!' + path.join(importData.path, importData.exclude));
	}

	return importData;
};
settings.imports.plugins = settings.imports.plugins || [];
settings.imports.plugins = settings.imports.plugins.map(processImportData);
settings.imports.themes = settings.imports.themes || [];
settings.imports.themes = settings.imports.themes.map(processImportData);

// Paths for remapping
var base = {
	dev: './',
	src: './src/',
	acfRelativeSrc: '../../../../src/',
	theme: './www/wp-content/themes/' + settings.slug + '/',
	themes: './www/wp-content/themes/',
	plugins: './www/wp-content/plugins/',
};

// Source files for compilation
var src = {
	functions: base.src + 'includes/*.php',
	includes: base.src + 'includes/**/*.php',
	controllers: base.src + 'templates/controllers/**/*.php',
	views: base.src + 'templates/views/**/*.twig',
	images: base.src + 'assets/img/**/*',
	fonts: base.src + 'assets/fonts/**/*',
	styles: base.src + 'assets/css/*.css',
	stylesGlob: base.src + 'assets/css/**/*.css', /* also watch included files */
	scripts: base.src + 'assets/js/*.js',
	scriptsGlob: base.src + 'assets/js/**/*.js', /* also watch included files */
};

// Build folder slugs
var dest = {
	acf: 'acf-json',
	includes: 'inc',
	controllers: '', // Templates go in the theme's root folder
	views: 'views',
	styles: 'css',
	scripts: 'js',
	images: 'img',
	fonts: 'fonts',
};

// Plugin options
var options = {
	uglify: { mangle: false },
	imageminPlugins: imagemin.svgo({
		plugins: [
			{ cleanupIDs: false }
		]
	}),
	imagemin: { optimizationLevel: 7, progressive: true, interlaced: true, multipass: true },
	postcss: [
		postcssImport({ plugins: [stylelint()] }),
		postcssEasyMediaQuery,
		postcssMixins,
		postcssEach,
		postcssSimpleVars({
			unknown: function (node, name, result) {
				node.warn(result, 'Unknown variable ' + name);
			}
		}),
		postcssNestedProps,
		postcssNested,
		postcssFontpath,
		autoprefixer({ browsers: ['last 3 versions'] }),
		postcssReporter({ clearReportedMessages: true })
	],
	posthtmlBem: {
		elemPrefix: '__',
		modPrefix: '--',
		modDlmtr: '-'
	}
};

// Erase build and theme folders before each compile
function clean() {
	return del([base.theme], {force: true})
		.then(function() {
			fs.mkdirSync(base.theme);
		});
}

// Header: auto-create style.css using project info we already have
function header(cb) {
	var data = '/*\r\n'
		+ 'Theme Name: ' + settings.title + '\r\n'
		+ 'Author: ' + settings.author['name'] + '\r\n'
		+ (settings.author['url'] ? 'Author URI: ' + settings.author['url'] + '\r\n' : '')
		+ '*/';
	fs.writeFileSync(base.theme + 'style.css', data);
	cb();
}

// Acf: create a symlink to ACF JSON in theme folder so that the source and theme are always in sync
function acf(cb) {
	// Symlink to absolute path in VM (it must be synced on the guest but not necessarily on the host)
	fs.symlinkSync(base.acfRelativeSrc + dest.acf, base.theme + dest.acf);
	cb();
}
// Includes: copy all project and vendor includes
function includes() {
	return gulp.src(src.includes)
		.pipe(changed(base.theme + dest.includes))
		.pipe(gulp.dest(base.theme + dest.includes))
		.pipe(browserSync.stream());
}

// Controllers: copy PHP files
function controllers() {
	return gulp.src(src.controllers)
		.pipe(changed(base.theme + dest.controllers))
		.pipe(gulp.dest(base.theme + dest.controllers))
		.pipe(browserSync.stream());
}

// Views: copy Twig files
function views() {
	return gulp.src(src.views)
		.pipe(changed(base.theme + dest.views))
		.pipe(posthtml([posthtmlBem(options.posthtmlBem)]))
		.pipe(gulp.dest(base.theme + dest.views))
		.pipe(browserSync.stream());
}

// Styles (CSS): lint write source map, preprocess, save full and minified versions, then copy
function styles() {
	styleBuildTime = Date.now();
	return gulp.src(src.styles)
		.pipe(named())
		.pipe(postcss(options.postcss))
		.on('error', function(error) {
			console.error(error.message);
			this.emit('end');
		})
		.pipe(sourcemaps.init())
		.pipe(gulp.dest(base.theme + dest.styles))
		.pipe(browserSync.stream())
		.pipe(cssnano())
		.pipe(rename(function(path){
			path.basename += '.' + styleBuildTime + ".min";
		}))
		.pipe(sourcemaps.write('.'))
		.pipe(gulp.dest(base.theme + dest.styles))
		.pipe(browserSync.stream());
}

// Scripts (JS): get third-party dependencies, concatenate all scripts into one file, save full and minified versions, then copy
function scripts() {
	scriptBuildTime = Date.now();
	return gulp.src(src.scripts)
		.pipe(named())
		.pipe(webpack(require('./webpack.config.js')))
		.on('error', function(error) {
			console.error(error.message);
			this.emit('end');
		})
		.pipe(sourcemaps.init({loadMaps: true}))
		.pipe(gulp.dest(base.theme + dest.scripts))
		.pipe(browserSync.stream())
		.pipe(uglify(options.uglify))
		.pipe(rename(function(path){
			path.basename += '.' + scriptBuildTime + ".min";
		}))
		.pipe(sourcemaps.write('.'))
		.pipe(gulp.dest(base.theme + dest.scripts))
		.pipe(browserSync.stream());
}

// Functions: auto-create functions.php with root level PHP includes and assets timestamp constants
function functions(cb) {
	fs.writeFileSync(base.theme + 'functions.php', '<?php\r\ndefine(\'SCRIPT_BUILD_TIME\', \'' + scriptBuildTime + '\');\r\ndefine(\'STYLE_BUILD_TIME\', \'' + styleBuildTime + '\');\r\n');
	return gulp.src(src.functions)
		.pipe(tap(function(file) {
			fs.appendFileSync(base.theme + 'functions.php', "require_once(get_stylesheet_directory() . '/" + dest.includes + file.path.replace(file.base, '') + "');\r\n");
		}));
	cb();
}

// Images: optimise and copy, maintaining tree
function images() {
	return gulp.src(src.images)
		.pipe(changed(base.theme + dest.images))
		.pipe(imagemin([options.imageminPlugins, options.imagemin]))
		.pipe(gulp.dest(base.theme + dest.images))
		.pipe(browserSync.stream());
}

// Fonts: just copy, maintaining tree
function fonts() {
	return gulp.src(src.fonts)
		.pipe(changed(base.theme + dest.fonts))
		.pipe(gulp.dest(base.theme + dest.fonts))
		.pipe(browserSync.stream());
}

// Import plugins: external plugins to be copied when changed
function importPlugins(cb) {
	var importsPipes = [];
	settings.imports.plugins.forEach(function(plugin) {
		importsPipes.push(
			gulp.src(plugin.src)
				.pipe(changed(base.plugins + path.basename(plugin.path)))
				.pipe(gulp.dest(base.plugins + path.basename(plugin.path)))
				.pipe(browserSync.stream())
		)
	});
	if (importsPipes.length > 0) {
		return mergeStream(importsPipes);
	}
	cb();
}

// Import themes: external themes to be copied when changed
function importThemes(cb) {
	var importsPipes = [];
	settings.imports.themes.forEach(function(theme) {
		importsPipes.push(
			gulp.src(theme.src)
				.pipe(changed(base.themes + path.basename(theme.path)))
				.pipe(gulp.dest(base.themes + path.basename(theme.path)))
				.pipe(browserSync.stream())
		)
	});
	if (importsPipes.length > 0) {
		return mergeStream(importsPipes);
	}
	cb();
}

// Wordmove: add full Wordpress path to the final Movefile with the almost complete template
function wordmove(cb) {
	// Load Wordmove settings file
	try {
		var wordmove = yaml.safeLoad(fs.readFileSync('./config/wordmove.yml', 'utf8')) || {};
		wordmove.local = wordmove.local || {};
		wordmove.local.vhost = `localhost:${settings.webPort}`;
		wordmove.local.wordpress_path = path.resolve(`${__dirname}/www/`);
		wordmove.local.database = wordmove.local.database || {};
		wordmove.local.database.name = 'wordpress';
		wordmove.local.database.user = 'wordpress';
		wordmove.local.database.password = 'wordpress';
		wordmove.local.database.host = '127.0.0.1';
		wordmove.local.database.port = settings.dbPort;
		fs.writeFileSync('Movefile', yaml.safeDump(wordmove));
	} catch (ex) {
		console.error('Error generating Movefile:', ex);
	}
	cb();
}

// Update WP config URLs with access port dynamically assigned by Docker to expose Web container port 80
function wpconfig(cb) {
	// Get current port in WordPress to check if it matches the current Web container port
	var dockerCmd = 'docker-compose exec -u www-data -T wp',
		siteURL = exec(dockerCmd + ' wp option get siteurl').toString().replace("\n", '');
	
	if (siteURL.indexOf('localhost:') >= 0 && siteURL.indexOf('127.0.0.1:') >= 0) {
		// Not in a custom domain: check if automatic port set by Docker needs to be updated in the DB
		var wpPort = siteURL.replace(/^.*:(\d+)$/g, '$1');
		if (wpPort != settings.webPort) {
			// Ports needs to be updated
			console.log('Updating WordPress port from ' + wpPort + ' to ' + settings.webPort + '...');
			exec(dockerCmd + ' wp search-replace --quiet "localhost:' + wpPort + '" "localhost:' + settings.webPort + '"');
			exec(dockerCmd + ' bash -c \'wp option update home "http://localhost:' + settings.webPort + '" && wp option update siteurl "http://localhost:' + settings.webPort + '"\'');
		}
	}

	outputSeparator = ' \x1b[36m' + '-'.repeat(siteURL.length + 21) + '\x1b[0m';
	console.log('\x1b[1m' + settings.title + ' (' + settings.slug + ') access URLs:\x1b[22m');
	console.log(outputSeparator);
	console.log(' 🌍  WordPress: \x1b[35m' + siteURL + '/\x1b[0m');
	console.log(' 🔧  Admin: \x1b[35m' + siteURL + '/wp-admin/\x1b[0m');
	console.log(' 🗃  Database: \x1b[35mlocalhost:' + settings.dbPort + '\x1b[0m');
	console.log(outputSeparator);
	cb();
}

function watch() {
	// Initialise BrowserSync
	console.log('Starting BrowserSync...');
	browserSync.init({
		proxy: 'localhost:' + settings.webPort,
		open: false,
		logPrefix: settings.slug + ' http://localhost:' + settings.webPort
	});
	gulp.watch(src.functions, gulp.series(functions));
	gulp.watch(src.includes, gulp.series(includes));
	gulp.watch(src.controllers, gulp.series(controllers));
	gulp.watch(src.views, gulp.series(views));
	gulp.watch(src.stylesGlob, gulp.series(styles, functions));
	gulp.watch(src.scriptsGlob, gulp.series(scripts, functions));
	gulp.watch(src.images, gulp.series(images));
	gulp.watch(src.fonts, gulp.series(fonts));
	settings.imports.plugins.forEach(function(plugin) {
		gulp.watch(plugin.watchPath, gulp.series(importPlugins));
	});
	settings.imports.themes.forEach(function(theme) {
		gulp.watch(theme.watchPath, gulp.series(importThemes));
	});
}

function deploy(cb) {
	exec('wordmove push --themes', { stdio: 'inherit' });
	cb();
}

// Build: sequences all the other tasks
gulp.task('build', gulp.series(clean, gulp.parallel(header, acf, includes, controllers, views, styles, scripts, functions, images, fonts, importPlugins, importThemes, wordmove)));

// Wpconfig: update Docker dynamic ports in Wordpress config
gulp.task('wpconfig', wpconfig);

// Watch: fire build, then watch for changes
gulp.task('default', gulp.series('build', 'wpconfig', watch));

// Deploy: run another build (clean folders etc) and then wordmove
gulp.task('deploy', gulp.series('build', deploy));
