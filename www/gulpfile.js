/* ==========================================================================
   Yes We Work Vagrant/WP machine Browsersync tasks
   ========================================================================== */

var gulp = require( 'gulp' ),
	browserSync = require( 'browser-sync' ).create(),
	YAML = require( 'yamljs' );

// defaults
projectSlug = '';
projectUrl = '';

// retrieve project settings
var projectSettings = YAML.load( '../site.yml' );

if( typeof projectSettings.slug != 'undefined' && projectSettings.slug != '' ) {
	var projectSlug = projectSettings.slug;
}
if( typeof projectSettings.hostname != 'undefined' && projectSettings.hostname != '' ) {
	var projectUrl = projectSettings.hostname;
}

// confirm settings being used
console.log( 'using proxy: ' + projectUrl );
console.log( 'watching WP theme: ' + projectSlug );

// glob for files to watch
var glob = {
	styles: 'wordpress/wp-content/themes/' + projectSlug + '/**/*.css',
	scripts: 'wordpress/wp-content/themes/' + projectSlug + '/**/*.js',
	views: 'wordpress/wp-content/themes/' + projectSlug + '/**/*.twig'
}

// tasks
gulp.task( 'browser-sync', function() {
	browserSync.init( {
		proxy: 'bookflash.es',
		open: false
	});
	gulp.watch( glob.styles, [ 'styles' ] ); // TODO - switch to Gulp 4 with new task syntax
	gulp.watch( glob.scripts, [ 'scripts' ] );
	gulp.watch( glob.views, [ 'views' ] );
});
gulp.task( 'styles', function() {
	return gulp.src( glob.styles )
		.pipe( browserSync.stream() );
});
gulp.task( 'scripts', function() {
	return gulp.src( glob.scripts )
		.pipe( browserSync.stream() );
});
gulp.task( 'views', function() {
	return gulp.src( glob.views )
		.pipe( browserSync.stream() );
});