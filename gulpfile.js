/* ==========================================================================
   Yes We Work Vagrant/WP machine Browser-sync tasks
   ========================================================================== */

var gulp = require( 'gulp' ),
	browserSync = require( 'browser-sync' ).create(),
	YAML = require( 'yamljs' );

// defaults
projectSlug = '';
projectUrl = '';

// retrieve project settings
var projectSettings = YAML.load( 'site.yml' );

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
var glob = 'www/wordpress/wp-content/themes/' + projectSlug + '/**/*.css';

gulp.task('browser-sync', function() {
	browserSync.init({
		proxy: 'bookflash.es',
		open: false
	});
	gulp.watch( glob, [ 'stream' ] ); // TODO - switch to Gulp 4 task style
});

gulp.task( 'stream', function(){
	return gulp.src( glob )
		.pipe( browserSync.stream() );
})