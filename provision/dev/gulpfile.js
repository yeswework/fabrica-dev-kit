var gulp = require('gulp'),
	autoprefixer = require('autoprefixer'),
	browserSync = require('browser-sync').create(),
	del = require('del'),
	concat = require('gulp-concat'),
	changed = require('gulp-changed'),
	cssnano = require('gulp-cssnano'),
	imagemin = require('gulp-imagemin'),
	jshint = require('gulp-jshint'),
	postcss = require('gulp-postcss'),
	rename = require('gulp-rename'),
	sourcemaps = require('gulp-sourcemaps'),
	tap = require('gulp-tap'),
	fs = require('fs'),
	uglify = require('gulp-uglify'),
	lost = require('lost'),
	postcssImport = require('postcss-import'),
	postcssFontpath = require('postcss-fontpath'),
	postcssEach = require('postcss-each'),
	postcssMixins = require('postcss-mixins'),
	postcssNested = require('postcss-nested'),
	postcssNestedProps = require('postcss-nested-props'),
	postcssReporter = require('postcss-reporter'),
	postcssSimpleVars = require('postcss-simple-vars'),
	posthtml = require('gulp-posthtml'),
	posthtmlBem = require('posthtml-bem'),
	stylelint = require('stylelint'),
	webpackStream = require('webpack-stream'),
	webpack = require('webpack'),
	exec = require('child_process').execSync;

// Load project and local settings
var projectSettings, localSettings;
try {
	projectSettings = require('./src/package.json');
} catch (ex) {
	console.error('Error loading source `package.json` file.', ex);
	return;
}
var projectSlug = projectSettings.name,
	projectTitle = projectSettings.description,
	projectAuthor = projectSettings.author;
try {
	var projectWebPort = exec('docker-compose port web 80').toString().replace(/^.*:(\d+)\n$/g, '$1'),
		projectDBPort = exec('docker-compose port db 3306').toString().replace(/^.*:(\d+)\n$/g, '$1');
} catch (ex) {
	console.error('Error obtaining containers access ports.', ex);
	return;
}

// Paths for remapping
var base = {
	dev: './',
	src: './src/',
	acfRelativeSrc: '../../../../dev/src/',
	theme: '../www/wp-content/themes/' + projectSlug + '/'
};

// Globs for each file type
var path = {
	functions: base.src + 'includes/*.php',
	includes: base.src + 'includes/**/*',
	controllers: base.src + 'templates/controllers/**/*.php',
	views: base.src + 'templates/views/**/*.twig',
	styles: base.src + 'assets/css/**/*.{css,pcss}',
	scripts: base.src + 'assets/js/**/*.js',
	images: base.src + 'assets/img/**/*',
	fonts: base.src + 'assets/fonts/**/*',
	styleMain: base.src + 'assets/css/main.pcss',
	scriptMain: base.src + 'assets/js/main.js',
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
	fonts: 'fonts'
};

// Plugin options
var options = {
	uglify: {mangle: false},
	imagemin: {optimizationLevel: 7, progressive: true, interlaced: true, multipass: true},
	postcss: [
		stylelint(),
		postcssReporter({clearMessages: true}),
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
		postcssImport,
		lost,
		autoprefixer({browsers: ['last 3 versions']})
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
		+ 'Theme Name: ' + projectTitle + '\r\n'
		+ 'Author: ' + projectAuthor['name'] + '\r\n'
		+ (projectAuthor['url'] ? 'Author URI: ' + projectAuthor['url'] + '\r\n' : '')
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

// Functions: auto-create functions.php with root level PHP includes
function functions(cb) {
	fs.writeFileSync(base.theme + 'functions.php', '<?php\r\n');
	return gulp.src(path.functions)
		.pipe(tap(function(file) {
			fs.appendFileSync(base.theme + 'functions.php', "require_once(get_stylesheet_directory() . '/" + dest.includes + '/' + file.path.replace(file.base, '') + "');\r\n");
		}));
	cb();
}

// Includes: copy all project and vendor includes
function includes() {
	return gulp.src(path.includes)
		.pipe(changed(base.theme + dest.includes))
		.pipe(gulp.dest(base.theme + dest.includes))
		.pipe(browserSync.stream());
}

// Controllers: copy PHP files
function controllers() {
	return gulp.src(path.controllers)
		.pipe(changed(base.theme + dest.controllers))
		.pipe(gulp.dest(base.theme + dest.controllers))
		.pipe(browserSync.stream());
}

// Views: copy Twig files
function views() {
	return gulp.src(path.views)
		.pipe(changed(base.theme + dest.views))
		.pipe(posthtml([posthtmlBem(options.posthtmlBem)]))
		.pipe(gulp.dest(base.theme + dest.views))
		.pipe(browserSync.stream());
}

// Styles (CSS): lint, concatenate into one file, write source map, preprocess, save full and minified versions, then copy
function styles() {
	return gulp.src(path.styleMain)
		.pipe(postcss(options.postcss)
			.on('error', function(error) {
				console.error(error.message);
				this.emit('end');
			})
		)
		.pipe(concat('main.css'))
		.pipe(sourcemaps.init())
		.pipe(changed(base.theme + dest.styles))
		.pipe(gulp.dest(base.theme + dest.styles))
		.pipe(browserSync.stream({match: '**/*.css'}))
		.pipe(cssnano())
		.pipe(rename('main.min.css'))
		.pipe(sourcemaps.write('.'))
		.pipe(changed(base.theme + dest.styles))
		.pipe(gulp.dest(base.theme + dest.styles))
		.pipe(browserSync.stream({match: '**/*.css'}));
}

// Scripts (JS): get third-party dependencies, concatenate all scripts into one file, save full and minified versions, then copy
function scripts(done) {
	return gulp.src(path.scriptMain)
		.pipe(jshint())
		.pipe(jshint.reporter())
		.pipe(changed(base.theme + dest.scripts))
		.pipe(webpackStream({output: {filename: 'main.js'}}, webpack))
		.pipe(sourcemaps.init({loadMaps: true}))
		.pipe(gulp.dest(base.theme + dest.scripts))
		.pipe(browserSync.stream())
		.pipe(uglify(options.uglify))
		.pipe(rename('main.min.js'))
		.pipe(sourcemaps.write('.'))
		.pipe(changed(base.theme + dest.scripts))
		.pipe(gulp.dest(base.theme + dest.scripts))
		.pipe(browserSync.stream());
}

// Images: optimise and copy, maintaining tree
function images() {
	return gulp.src(path.images)
		.pipe(changed(base.theme + dest.images))
		.pipe(imagemin(options.imagemin))
		.pipe(gulp.dest(base.theme + dest.images))
		.pipe(browserSync.stream());
}

// Fonts: just copy, maintaining tree
function fonts() {
	return gulp.src(path.fonts)
		.pipe(changed(base.theme + dest.fonts))
		.pipe(gulp.dest(base.theme + dest.fonts))
		.pipe(browserSync.stream());
}

// Wordmove: add full Wordpress path to the final Movefile with the almost complete template
function wordmove(cb) {
	try {
		exec('erb Movefile.erb > Movefile', {env: {WEB_PORT: projectWebPort, DB_PORT: projectDBPort}});
	} catch (ex) {
		console.error('Error generating Movefile:', ex);
	}
	cb();
}

// Update WP config URLs with access port dynamically assigned by Docker to expose Web container port 80
function wpconfig(cb) {
	// Get current port in WordPress to check if it matches the current Web container port
	var dockerCmd = 'docker exec ' + projectSlug + '_wp',
		wpPort = exec(dockerCmd + ' wp option get siteurl').toString().replace(/^.*:(\d+)\n$/g, '$1');
	if (wpPort != projectWebPort) {
		// Ports needs to be updated
		console.log('Updating WordPress port from ' + wpPort + ' to ' + projectWebPort + '...');
		exec(dockerCmd + ' wp search-replace --quiet "localhost:' + wpPort + '" "localhost:' + projectWebPort + '"');
		exec(dockerCmd + ' bash -c \'wp option update home "http://localhost:' + projectWebPort + '" && wp option update siteurl "http://localhost:' + projectWebPort + '"\'');
	}
	outputSeparator = ' \x1b[36m' + '-'.repeat(37 + projectWebPort.toString().length) + '\x1b[0m';
	console.log('\x1b[1m' + projectTitle + ' (' + projectSlug + ') access URLs:\x1b[22m');
	console.log(outputSeparator);
	console.log(' 🌍  WordPress: \x1b[35mhttp://localhost:' + projectWebPort + '/\x1b[0m');
	console.log(' 🔧  Admin: \x1b[35mhttp://localhost:' + projectWebPort + '/wp-admin/\x1b[0m');
	console.log(' 🗃  Database: \x1b[35mlocalhost:' + projectDBPort + '\x1b[0m');
	console.log(outputSeparator);
	cb();
}

function watch() {
	// Initialise BrowserSync
	console.log('Starting BrowserSync...');
	browserSync.init({
		proxy: 'localhost:' + projectWebPort,
		open: false
	});
	gulp.watch(path.functions, gulp.series(functions));
	gulp.watch(path.includes, gulp.series(includes));
	gulp.watch(path.controllers, gulp.series(controllers));
	gulp.watch(path.views, gulp.series(views));
	gulp.watch(path.styles, gulp.series(styles));
	gulp.watch(path.scripts, gulp.series(scripts));
	gulp.watch(path.images, gulp.series(images));
	gulp.watch(path.fonts, gulp.series(fonts));
}

// Build: sequences all the other tasks
gulp.task('build', gulp.series(clean, gulp.parallel(header, acf, functions, includes, controllers, views, styles, scripts, images, fonts, wordmove)));

// Wpconfig: update Docker dynamic ports in Wordpress config
gulp.task('wpconfig', wpconfig);

// Watch: fire build, then watch for changes
gulp.task('default', gulp.series('build', 'wpconfig', watch));
