<?php
/* =========================================================================
   Project-specific code
   ========================================================================= */

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

		// Non-destructively merge script variables according to page or query conditions
		if ( is_single() ) {
			$scriptVars = array_merge( $scriptVars, array(
				'ajaxUrl' => admin_url( 'admin-ajax.php' ),
				'postNonce' => wp_create_nonce( 'yww-post-nonce' ),
				'nameSpaced' => array(
					'key1' => __( 'value one', 'yww' ),
					'key2' => __( 'value two', 'yww' )
			) ) );
		}
		return $scriptVars;

	}
	add_filter( 'yww_script_vars', 'yww_update_script_vars' );

}

// Send AJAX responses
if ( ! function_exists( 'yww_send_ajax_response' ) ) {

	function yww_send_ajax_response( $response ) {
		
		header( 'Content-Type: application/json' );
		echo json_encode( $response );
		exit;
	}

}

// Handle AJAX requests
if ( ! function_exists( 'yww_ajax_handler' ) ) {

	function yww_ajax_handler() {

		if ( isset( $_POST[ 'postNonce' ] ) ) {
			$nonce = $_POST[ 'postNonce' ];
		} else {
			yww_send_ajax_response( array( 'success' => false, 'error' => "Couldn't retrieve nonce." ) );
		}

		if ( ! wp_verify_nonce( $nonce, 'yww-post-nonce' ) ) {
			yww_send_ajax_response( array( 'success' => false, 'error' => 'Invalid nonce.' ) );
		}

		// Retrieve submitted parameters
		// $postID = $_POST[ 'postID' ];

		// Now do whatever we need to do

		yww_send_ajax_response( array( 'success' => true ) );

	} 
	add_action( 'wp_ajax_nopriv_ajax-ACTION', 'yww_ajax_handler' );
	add_action( 'wp_ajax_ajax-ACTION', 'yww_ajax_handler' );

}