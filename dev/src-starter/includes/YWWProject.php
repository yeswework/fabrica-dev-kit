<?php
/* =========================================================================
   Project-specific configuration, scripts and handlers
   ========================================================================= */

require_once('YWWBase.php');

// Set content width value based on the theme's design
if (!isset($content_width)) {
	$content_width = 1440;
}

class YWWProject extends YWWBase {

	function __construct() {

		// Namespace for this project
		$this->projectNamespace = '{{projectSlug}}';

		// Google Analytics ID (injected by parent class)
		$this->googleAnalyticsId = '';

		// Menus required
		$this->menus = array('main' => 'Main menu');

		// AJAX handler functions as required
		add_action('wp_ajax_nopriv_ajax-ACTION', array($this, 'ajaxHandler'));
		add_action('wp_ajax_ajax-ACTION', array($this, 'ajaxHandler'));

		// Namespaced handles and tags
		$this->mainHandle = $this->projectNamespace . '-main';
		$this->varsTag = $this->projectNamespace . '_script_vars';
		$this->postNonce = $this->projectNamespace . '-post-nonce';

		add_filter($this->varsTag, array($this, 'updateScriptVars'));

		parent::__construct();

	}

	// Send script variables to front end
	function updateScriptVars($scriptVars = array()) {

		// Non-destructively merge script variables according to page or query conditions
		if (is_single()) {
			$scriptVars = array_merge($scriptVars, array(
				'ajaxUrl' => admin_url('admin-ajax.php'),
				'postNonce' => wp_create_nonce($this->postNonce),
				'nameSpaced' => array(
					'key1' => __('value one', $this->projectNamespace),
					'key2' => __('value two', $this->projectNamespace)
			)));
		}
		return $scriptVars;

	}

	// Handle AJAX requests
	function ajaxHandler() {

		if (isset($_POST['postNonce'])) {
			$nonce = $_POST['postNonce'];
		} else {
			$this->sendAjaxResponse(array('success' => false, 'error' => "Couldn't retrieve nonce."));
		}

		if (!wp_verify_nonce($nonce, $this->postNonce)) {
			$this->sendAjaxResponse(array('success' => false, 'error' => 'Invalid nonce.'));
		}

		// Retrieve submitted data
		// $postID = $_POST['postID'];

		// Act on it

		// Add data to response + send!
		$this->sendAjaxResponse(array('success' => true));

	}

	// Send AJAX responses
	function sendAjaxResponse($response) {

		header('Content-Type: application/json');
		echo json_encode($response);
		exit;

	}

}

$ywwProject = new YWWProject();
