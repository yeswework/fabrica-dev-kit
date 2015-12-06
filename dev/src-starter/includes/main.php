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


// Register menus with WP
if ( ! function_exists( 'ywwMenus' ) ) {

	function ywwMenus() {

		$locations = array(
			'main' => __( 'Main menu', 'yww' ),
		);
		register_nav_menus( $locations );

	}
	add_action( 'init', 'ywwMenus' );

}


// Register menus with Timber
if ( ! function_exists( 'ywwTimberMenus' ) ) {

	function ywwTimberMenus( $context ) {

		$context[ 'menus' ][ 'main' ] = new TimberMenu( 'main' );
		return $context;

	}
	add_filter( 'timber_context', 'ywwTimberMenus' );

}


// Send script variables to front end
// TODO: Add nonce for AJAX requests
if ( ! function_exists( 'ywwUpdateScriptVars' ) ) {

	function ywwUpdateScriptVars( $scriptVars = array() ) {

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
	add_filter( 'yww_script_vars', 'ywwUpdateScriptVars' );

}

// Send AJAX responses
if ( ! function_exists( 'ywwSendAjaxResponse' ) ) {

	function ywwSendAjaxResponse( $response ) {
		
		header( 'Content-Type: application/json' );
		echo json_encode( $response );
		exit;
	}

}

// Handle AJAX requests
if ( ! function_exists( 'ywwAjaxHandler' ) ) {

	function ywwAjaxHandler() {

		if ( isset( $_POST[ 'postNonce' ] ) ) {
			$nonce = $_POST[ 'postNonce' ];
		} else {
			ywwSendAjaxResponse( array( 'success' => false, 'error' => "Couldn't retrieve nonce." ) );
		}

		if ( ! wp_verify_nonce( $nonce, 'yww-post-nonce' ) ) {
			ywwSendAjaxResponse( array( 'success' => false, 'error' => 'Invalid nonce.' ) );
		}

		// Retrieve submitted parameters
		// $postID = $_POST[ 'postID' ];

		// Now do whatever we need to do

		ywwSendAjaxResponse( array( 'success' => true ) );

	} 
	add_action( 'wp_ajax_nopriv_ajax-ACTION', 'ywwAjaxHandler' );
	add_action( 'wp_ajax_ajax-ACTION', 'ywwAjaxHandler' );

}