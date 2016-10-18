var gulp = require('gulp'),
	autoprefixer = require('autoprefixer'),
	browserSync = require('browser-sync').create(),
	del = require('del'),
	beml = require('gulp-beml'),
	concat = require('gulp-concat'),
	changed = require('gulp-changed'),
	cssnano = require('gulp-cssnano'),
	gulpFilter = require('gulp-filter'),
	flatten = require('gulp-flatten'),
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
	stylelint = require('stylelint'),
	webpack = require('webpack-stream'),
	exec = require('child_process').exec,
	yaml = require('yamljs');

// Load project and local settings from package.json and vagrant.yml
var projectSettings, localSettings;
try {
	projectSettings = require('./src/package.json');
} catch (ex) {
	console.error('Error loading source `package.json` file.', ex);
	return;
}
try {
	localSettings = yaml.load('../vagrant.yml');
} catch (ex) {
	localSettings = {host_document_root: 'www'}; // Fallback default
}
var projectSlug = projectSettings.name,
	projectTitle = projectSettings.description,
	projectAuthor = projectSettings.author,
	projectDevUrl = localSettings.dev_url,
	projectDocRoot = localSettings.host_document_root;

// Paths for remapping
var base = {
	dev: './',
	src: './src/',
	acfRelativeSrc: projectDocRoot.replace(/[^\/]+(\/|$)/, '../') + '../../../src/',
	theme: './' + projectDocRoot + '/wp-content/themes/' + projectSlug + '/'
};

// Globs for each file type
var path = {
	includes: [base.src + 'includes/**/*', base.src + 'includes/.env'],
	controllers: base.src + 'templates/controllers/**/*.php',
	views: base.src + 'templates/**/*.twig',
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
	beml: {
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

// Includes: copy internal PHP dependencies to an inc folder and auto-create functions.php with includes
function includes() {
	fs.writeFileSync(base.theme + 'functions.php', '<?php\r\n');
	var nonVendorFilter = gulpFilter('*.php', {restore: true}); // only require top-level files in functions.php
	return gulp.src(path.includes)
		.pipe(nonVendorFilter)
		.pipe(tap(function(file, t) {// write an include for this file to our functions.php automatically
			fs.appendFileSync(base.theme + 'functions.php', "require_once(get_stylesheet_directory() . '/" + dest.includes + '/' + file.path.replace(file.base, '') + "');\r\n");
		}))
		.pipe(nonVendorFilter.restore)
		.pipe(changed(base.theme + dest.includes))
		.pipe(gulp.dest(base.theme + dest.includes))
		.pipe(browserSync.stream());
}

// Controllers: copy PHP files, flattening tree
function controllers() {
	return gulp.src(path.controllers)
		.pipe(flatten())
		.pipe(changed(base.theme + dest.controllers))
		.pipe(gulp.dest(base.theme + dest.controllers))
		.pipe(browserSync.stream());
}

// Views: copy Twig files, flattening tree
function views() {
	return gulp.src(path.views)
		.pipe(flatten())
		.pipe(changed(base.theme + dest.views))
		.pipe(beml(options.beml))
		.pipe(gulp.dest(base.theme + dest.views))
		.pipe(browserSync.stream());
}

// Styles (CSS): lint, concatenate into one file, write source map, preprocess, save full and minified versions, then copy
function styles() {
	return gulp.src(path.styleMain)
		.pipe(postcss(options.postcss))
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
		.pipe(webpack({output: {filename: 'main.js'}}))
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
	exec('erb Movefile.erb > Movefile', {'env': {'HOST_DOCUMENT_ROOT': projectDocRoot}}, function (error, stdout, stderr) {
		if (error) {
			console.error('Error generating Movefile:', error);
		}
	});
	cb();
}

// Build: sequences all the other tasks
gulp.task('build', gulp.series(clean, gulp.parallel(header, acf, includes, controllers, views, styles, scripts, images, fonts, wordmove)));

// Watch: fire build, then watch for changes
gulp.task('default', gulp.series('build', watch));
function watch() {
	if (projectDevUrl) {
		browserSync.init({
			proxy: projectDevUrl,
			open: false
		});
	}
	gulp.watch(path.styles, gulp.series(styles));
	gulp.watch(path.includes, gulp.series(includes));
	gulp.watch(path.controllers, gulp.series(controllers));
	gulp.watch(path.views, gulp.series(views));
	gulp.watch(path.scripts, gulp.series(scripts));
	gulp.watch(path.images, gulp.series(images));
	gulp.watch(path.fonts, gulp.series(fonts));
}
