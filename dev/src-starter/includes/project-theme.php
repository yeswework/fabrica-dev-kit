<?php
/* =========================================================================
   Project-specific code
   ========================================================================= */

require_once('yww-theme.php');

class ProjectTheme extends YWWTheme {

	// Set Google Analytics ID
	// protected $googleAnalyticsId = '';

	// Set content width value based on the theme's design
	public $content_width = 1440;

	function __construct() {

		add_action('init', array($this, 'menus'));
		add_filter('timber_context', array($this, 'timberMenus'));
		add_filter('yww_script_vars', array($this, 'updateScriptVars'));
		// AJAX requests
		add_action('wp_ajax_nopriv_ajax-ACTION', array($this, 'ajaxHandler'));
		add_action('wp_ajax_ajax-ACTION', array($this, 'ajaxHandler'));
		parent::__construct();

	}

	// Register menus with WP
	function menus() {

		$locations = array(
			'main' => __('Main menu', 'yww'),
		);
		register_nav_menus($locations);

	}

	// Register menus with Timber
	function timberMenus($context) {

		$context['menus']['main'] = new TimberMenu('main');
		return $context;

	}

	// Send script variables to front end
	function updateScriptVars($scriptVars = array()) {

		// Non-destructively merge script variables according to page or query conditions
		if (is_single()) {
			$scriptVars = array_merge($scriptVars, array(
				'ajaxUrl' => admin_url('admin-ajax.php'),
				'postNonce' => wp_create_nonce('yww-post-nonce'),
				'nameSpaced' => array(
					'key1' => __('value one', 'yww'),
					'key2' => __('value two', 'yww')
			)));
		}
		return $scriptVars;

	}

	// Send AJAX responses
	function sendAjaxResponse($response) {

		header('Content-Type: application/json');
		echo json_encode($response);
		exit;

	}

	// Handle AJAX requests
	function ajaxHandler() {

		if (isset($_POST['postNonce'])) {
			$nonce = $_POST['postNonce'];
		} else {
			$this->sendAjaxResponse(array('success' => false, 'error' => "Couldn't retrieve nonce."));
		}

		if (!wp_verify_nonce($nonce, 'yww-post-nonce')) {
			$this->sendAjaxResponse(array('success' => false, 'error' => 'Invalid nonce.'));
		}

		// Retrieve submitted parameters
		// $postID = $_POST['postID'];

		// Now do whatever we need to do

		$this->sendAjaxResponse(array('success' => true));

	}

}

new ProjectTheme();
