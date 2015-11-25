<?php
/* ==========================================================================
   Project-specific code
   ========================================================================== */

// Set Google Analytics ID
// $googleAnalyticsId = '';


// Set content width value based on the theme's design
if ( ! isset( $content_width ) ) {
	$content_width = 1440;
}

// Register menus
if ( ! function_exists( 'yww_menus' ) ) {

	function yww_menus() {

		$locations = array(
			'main' => __( 'Main menu', 'yww' ),
		);
		register_nav_menus( $locations );

	}
	add_action( 'init', 'yww_menus' );

	function yww_timber_menus( $context ) {

		$context[ 'menus' ][ 'main' ] = new TimberMenu( 'main' );
		return $context;

	}
	add_filter( 'timber_context', 'yww_timber_menus' );

}


// Send script variables to front end
// TODO: Add nonce for AJAX requests
if ( ! function_exists( 'yww_update_script_vars' ) ) {

	function yww_update_script_vars( $scriptVars = array() ) {

		// Non-destructively merge script variables according to page or query conditions (eg. is_single() )
		if ( 1 == 1 ) {
			$scriptVars = array_merge( $scriptVars, array(
				'ajaxUrl' => admin_url( 'admin-ajax.php' ),
				'nameSpaced' => array(
					'key1' => __( 'value one', 'yww' ),
					'key2' => __( 'value two', 'yww' )
			) ) );
		}
		return $scriptVars;

	}
	add_filter( 'yww_script_vars', 'yww_update_script_vars' );

}


// Handle AJAX requests
// based on http://www.garyc40.com/2010/03/5-tips-for-using-ajax-in-wordpress/
// TODO – add nonce check: https://codex.wordpress.org/Function_Reference/check_ajax_referer
if ( ! function_exists( 'yww_ajax_handler' ) ) {

	function yww_ajax_handler() {

		// Get the submitted parameters
		$postID = $_POST[ 'postID' ];

		// Generate the response
		$response = json_encode( array( 'success' => true ) );

		// Output response
		header( 'Content-Type: application/json' );
		echo $response;

		// IMPORTANT: don't forget to "exit"
		exit;

	} 
	add_action( 'wp_ajax_nopriv_ajax-ACTION', 'yww_ajax_handler' );
	add_action( 'wp_ajax_ajax-ACTION', 'yww_ajax_handler' );

}