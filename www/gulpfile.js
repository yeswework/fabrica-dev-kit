/* ==========================================================================
   Yes We Work WordPress + Vagrant development kit - Browsersync tasks
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
	gulp.watch( glob.scripts, browserSync.reload );
	gulp.watch( glob.views, browserSync.reload );
});
gulp.task( 'styles', function() {
	return gulp.src( glob.styles )
		.pipe( browserSync.stream() );
});