/* ==========================================================================
   Yes We Work WordPress + Vagrant development kit - build tasks
   ========================================================================== */

var gulp = require( 'gulp' ),
	autoprefixer = require( 'autoprefixer' ),
	del = require( 'del' ),
	concat = require( 'gulp-concat' ),
	csslint = require( 'gulp-csslint' ),
	cssnano = require( 'gulp-cssnano' ),
	gulpFilter = require( 'gulp-filter' ),
	flatten = require( 'gulp-flatten' ),
	imagemin = require( 'gulp-imagemin' ),
	jshint = require( 'gulp-jshint' ),
	postcss = require( 'gulp-postcss' ),
	rename = require( 'gulp-rename' ),
	sourcemaps = require( 'gulp-sourcemaps' ),
	tap = require( 'gulp-tap' ),
	fs = require( 'fs' ),
	uglify = require( 'gulp-uglify' ),
	lost = require( 'lost' ),
	mainBowerFiles = require( 'main-bower-files' ),
	postcssFontpath = require( 'postcss-fontpath' ),
	postcssNested = require( 'postcss-nested' ),
	postcssNestedProps = require( 'postcss-nested-props' ),
	postcssSimpleVars = require( 'postcss-simple-vars' ),
	shell = require( 'shelljs' ),
	ftp = require( 'vinyl-ftp' ),
	YAML = require( 'yamljs' );

// Default project settings
var projectSlug = 'yww-project';
var projectUrl = 'yeswework.dev';
var projectName = 'YWW Project';
var projectAuthor = 'Yes We Work - http://yeswework.com/';

// Overwrite with defaults from Vagrant's YML file in the parent folder, if available
var projectSettings = YAML.load( '../site.yml' );
if( typeof projectSettings.slug != 'undefined' && projectSettings.slug != '' ) {
	var projectSlug = projectSettings.slug;
}
if( typeof projectSettings.hostname != 'undefined' && projectSettings.hostname != '' ) {
	var projectUrl = projectSettings.hostname;
}
if( typeof projectSettings.title != 'undefined' && projectSettings.title != '' ) {
	var projectName = projectSettings.title;
}

// Paths for remapping
var base = {
	src: './src/',
	build: './build/',
	vagrant: '../www/wordpress/wp-content/themes/' + projectSlug + '/'
};

// Globs for each file type
var glob = {
	includes: base.src + 'includes/**/*.php',
	controllers: base.src + 'templates/controllers/**/*.php',
	views: base.src + 'templates/**/*.twig',
	styles: base.src + 'assets/css/**/*.{css,pcss}',
	scripts: base.src + 'assets/js/**/*.js',
	images: base.src + 'assets/img/**/*',
	fonts: base.src + 'assets/fonts/**/*'
};

// Build folder slugs
var dest = {
	includes: 'inc',
	controllers: '', // need to go in the root theme folder
	views: 'views',
	styles: 'css',
	scripts: 'js',
	images: 'img',
	fonts: 'fonts'
};

// Plugin options
var options = {
	uglify: { mangle: false },
	imagemin: { optimizationLevel: 7, progressive: true, interlaced: true, multipass: true },
	postcss: [
		postcssSimpleVars,
		postcssFontpath,
		postcssNestedProps,
		postcssNested,
		lost,
		autoprefixer( { browsers: [ 'last 3 versions' ] } )
	]
};

// Erase build folder before each compile
gulp.task( 'clean', function( cb ) {
	del( base.build );
	del( base.vagrant, { force: true } );
	cb(); // indicate completion
});

// Bower: concatenate the "main files" into library script and stylesheet and copy
gulp.task( 'bower', function() {
	var jsFilter = gulpFilter( '**/*.js', { restore: true } );
	var cssFilter = gulpFilter( '**/*.css', { restore: true } );
	return gulp.src( mainBowerFiles() )
		.pipe( jsFilter )
		.pipe( concat( 'lib.js' ) )
		.pipe( sourcemaps.init() )
		.pipe( gulp.dest( base.build + dest.scripts ) )
		.pipe( gulp.dest( base.vagrant + dest.scripts ) )
		.pipe( uglify( options.uglify ) )
		.pipe( rename( 'lib.min.js' ) )
		.pipe( sourcemaps.write( '.' ) )
		.pipe( gulp.dest( base.build + dest.scripts ) )
		.pipe( gulp.dest( base.vagrant + dest.scripts ) )
		.pipe( jsFilter.restore )
		.pipe( cssFilter )
		.pipe( concat( 'lib.css' ) )
		.pipe( sourcemaps.init() )
		.pipe( gulp.dest( base.build + dest.styles ) )
		.pipe( gulp.dest( base.vagrant + dest.styles ) )
		.pipe( cssnano() )
		.pipe( rename( 'lib.min.css' ) )
		.pipe( sourcemaps.write( '.' ) )
		.pipe( gulp.dest( base.build + dest.styles ) )
		.pipe( gulp.dest( base.vagrant + dest.styles ) );
});

// style.css: auto-create our theme's style.css using project info we already have
gulp.task( 'style.css', function( cb ) {
	var data = '/*\r\n' 
		+ 'Theme Name: ' + projectName + '\r\n' 
		+ 'Theme URI: http://' + projectUrl + '\r\n' 
		+ 'Author: ' + projectAuthor + '\r\n' + '*/';
	fs.writeFileSync( base.build + 'style.css', data );
	fs.writeFileSync( base.vagrant + 'style.css', data );
	cb(); // indicate completion
});

// Includes: copy internal PHP dependencies to an inc folder and auto-create functions.php with includes
gulp.task( 'includes', function() {
	fs.writeFileSync( base.build + 'functions.php', '<?php\r\n' ); // create a blank functions.php
	fs.writeFileSync( base.vagrant + 'functions.php', '<?php\r\n' );
	return gulp.src( glob.includes )
		.pipe( flatten() )
		.pipe( tap( function( file, t ) { // write an include for this file to our functions.php automatically
			fs.appendFileSync( base.build + 'functions.php', "require_once( get_stylesheet_directory() . '/" + dest.includes + "/" + file.path.replace( file.base, '' ) + "' );\r\n" );
			fs.appendFileSync( base.vagrant + 'functions.php', "require_once( get_stylesheet_directory() . '/" + dest.includes + "/" + file.path.replace( file.base, '' ) + "' );\r\n" );
		}))
		.pipe( gulp.dest( base.build + dest.includes ) )
		.pipe( gulp.dest( base.vagrant + dest.includes ) );
});

// Controllers: copy PHP files, flattening tree
gulp.task( 'controllers', function() {
	return gulp.src( glob.controllers )
		.pipe( flatten() )
		.pipe( gulp.dest( base.build + dest.controllers ) )
		.pipe( gulp.dest( base.vagrant + dest.controllers ) );
});

// Views: copy Twig files, flattening tree
gulp.task( 'views', function() {
	return gulp.src( glob.views )
		.pipe( flatten() )
		.pipe( gulp.dest( base.build + dest.views ) )
		.pipe( gulp.dest( base.vagrant + dest.views ) );
});

// Styles (CSS): lint, concatenate into one file, write source map, postcss, save full and minified versions, then copy
gulp.task( 'styles', function() {
	var lintFilter = gulpFilter( [ '**/*', '!defaults.css', '!helpers.css' ], { restore: true } );
	return gulp.src( glob.styles )
		.pipe( postcss( options.postcss ) )
		.pipe( lintFilter ) // don't lint certain files which we use on all projects
		.pipe( csslint() )
		.pipe( csslint.reporter() )
		.pipe( lintFilter.restore ) // restore all files after linting
		.pipe( concat( 'main.css' ) )
		.pipe( sourcemaps.init() )
		.pipe( gulp.dest( base.build + dest.styles ) )
		.pipe( gulp.dest( base.vagrant + dest.styles ) )
		.pipe( cssnano() )
		.pipe( rename( 'main.min.css' ) )
		.pipe( sourcemaps.write( '.' ) )
		.pipe( gulp.dest( base.build + dest.styles ) )
		.pipe( gulp.dest( base.vagrant + dest.styles ) );
});

// Scripts (JS): lint, concatenate into one file, save full and minified versions, then copy
gulp.task( 'scripts', function() {
	return gulp.src( glob.scripts )
		.pipe( jshint() )
		.pipe( jshint.reporter() )
		.pipe( concat( 'main.js' ) )
		.pipe( sourcemaps.init() )
		.pipe( gulp.dest( base.build + dest.scripts ) )
		.pipe( gulp.dest( base.vagrant + dest.scripts ) )
		.pipe( uglify( options.uglify ) )
		.pipe( rename( 'main.min.js' ) )
		.pipe( sourcemaps.write( '.' ) )
		.pipe( gulp.dest( base.build + dest.scripts ) )
		.pipe( gulp.dest( base.vagrant + dest.scripts ) );
});

// Images: optimise and copy, maintaining tree
gulp.task( 'images', function() {
	return gulp.src( glob.images )
		.pipe( imagemin( options.imagemin ) )
		.pipe( gulp.dest( base.build + dest.images ) )
		.pipe( gulp.dest( base.vagrant + dest.images ) );
});

// Fonts: just copy, maintaining tree
gulp.task( 'fonts', function() {
	return gulp.src( glob.fonts )
		.pipe( gulp.dest( base.build + dest.fonts ) )
		.pipe( gulp.dest( base.vagrant + dest.fonts ) );
});

// Build: sequences all the other tasks 
gulp.task( 'build', gulp.series( 'clean', 'bower', gulp.parallel( 'style.css', 'includes', 'controllers', 'views', 'styles', 'scripts', 'images', 'fonts' ) ) );

// Post-install: tells Vagrant itself to activate the built theme
// called by npm postinstall
gulp.task( 'install', gulp.series( 'build', install ) );
function install( cb ) {
	shell.exec( 'vagrant up && vagrant ssh -c "wp theme activate ' + projectSlug + '"' );
	cb(); // indicate completion
}

// Watch: fire build, then watch for changes
gulp.task( 'watch', gulp.series( 'build', watch ) );
function watch() {
	gulp.watch( glob.includes, gulp.parallel( 'includes' ) );
	gulp.watch( glob.controllers, gulp.parallel( 'controllers' ) );
	gulp.watch( glob.views, gulp.parallel( 'views' ) );
	gulp.watch( glob.styles, gulp.parallel( 'styles' ) );
	gulp.watch( glob.scripts, gulp.parallel( 'scripts' ) );
	gulp.watch( glob.images, gulp.parallel( 'images' ) );
	gulp.watch( glob.fonts, gulp.parallel( 'fonts' ) );
}

// Deploy: fire build, then upload to server via FTP
gulp.task( 'deploy', gulp.series( 'build', deploy ) );
function deploy() {
	if( typeof projectSettings.ftp.host == 'undefined' || projectSettings.ftp.host == null || projectSettings.ftp.host == '' ) {
		console.log( 'FTP host is not set in ../site.yml, cannot deploy' );
	} else if( typeof projectSettings.ftp.user == 'undefined' || projectSettings.ftp.user == null || projectSettings.ftp.user == '' ) {
		console.log( 'FTP user is not set in ../site.yml, cannot deploy' );
	} else if( typeof projectSettings.ftp.pass == 'undefined' || projectSettings.ftp.pass == null || projectSettings.ftp.pass == '' ) {
		console.log( 'FTP pass is not set in ../site.yml, cannot deploy' );
	} else {
		var conn = ftp.create( {
			host: projectSettings.ftp.host,
			user: projectSettings.ftp.user,
			pass: projectSettings.ftp.pass,
			parallel: 5,
			log: 'ftp.log'
		});
		if( typeof projectSettings.ftp.dir == 'undefined' || projectSettings.ftp.dir == null ) {
			projectSettings.ftp.dir = '/';
		}
		console.log( 'Beginning FTP deployment...' );
		return gulp.src( base.build + '**/*', { base: base.build, buffer: false } )
			.pipe( conn.newer( projectSettings.ftp.dir ) ) // only upload newer files 
			.pipe( conn.dest( projectSettings.ftp.dir ) );
	}
}

// Default
gulp.task ( 'default', gulp.series( 'build' ) );