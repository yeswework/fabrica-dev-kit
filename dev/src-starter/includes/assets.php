<?php
/* =========================================================================
   Auto-load theme-specific assets
   ========================================================================= */

// Enqueue front-end scripts and styles
if ( !function_exists( 'ywwEnqueueScripts' ) ) { 
	
	function ywwEnqueueScripts() {

		// Load uncompressed scripts when debug mode is on
		if ( WP_DEBUG === true ) {
			$suffix = '';
		} else {
			$suffix = '.min';
		}

		// Load third-party libraries, if they exist
		wp_deregister_script( 'jquery' );
		wp_enqueue_script( 'yww-lib', get_stylesheet_directory_uri() . '/js/lib' . $suffix . '.js', array(), filemtime( get_template_directory() . '/js/lib' . $suffix . '.js' ), true );	

		// Load theme-specific code
		wp_enqueue_script( 'yww-main', get_stylesheet_directory_uri() . '/js/main' . $suffix . '.js', array( 'yww-lib' ), filemtime( get_template_directory() . '/js/main' . $suffix . '.js' ), true );

		// Pass variables to JavaScript at runtime; see: http://codex.wordpress.org/Function_Reference/wp_localize_script
		$scriptVars = array();
		$scriptVars = apply_filters( 'yww_script_vars', $scriptVars );
		if ( !empty( $scriptVars ) ) {
			wp_localize_script( 'yww-main', 'yww', $scriptVars );
		}

		// Repeat for stylesheets, first libraries, then theme-specific
		wp_register_style( 'yww-lib', get_stylesheet_directory_uri() . '/css/lib' . $suffix . '.css', $dependencies = array(), filemtime( get_template_directory() . '/css/lib' . $suffix . '.css' ) );
		wp_enqueue_style( 'yww-lib' );
		wp_register_style( 'yww-main', get_stylesheet_directory_uri() . '/css/main' . $suffix . '.css', $dependencies = array(), filemtime( get_template_directory() . '/css/main' . $suffix . '.css' ) );
		wp_enqueue_style( 'yww-main' );

	} 
	add_action( 'wp_enqueue_scripts', 'ywwEnqueueScripts' );

}

// Inject Google Analytics snippet to footer if ID set
if ( !function_exists( 'ywwInjectAnalytics' ) ) { 

	function ywwInjectAnalytics() {

		global $googleAnalyticsId; 
		if( isset( $googleAnalyticsId ) && $googleAnalyticsId != '' ) {

			?><script>
				(function(b,o,i,l,e,r){b.GoogleAnalyticsObject=l;b[l]||(b[l]=
				function(){(b[l].q=b[l].q||[]).push(arguments)});b[l].l=+new Date;
				e=o.createElement(i);r=o.getElementsByTagName(i)[0];
				e.src='https://www.google-analytics.com/analytics.js';
				r.parentNode.insertBefore(e,r)}(window,document,'script','ga'));
				ga('create','<?php echo $googleAnalyticsId; ?>','auto');ga('send','pageview');
			</script><?php

		}
		
	}
	add_action( 'wp_footer', 'ywwInjectAnalytics' );

}