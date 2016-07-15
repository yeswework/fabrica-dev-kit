<?php
/* =========================================================================
   Ajax calls and handlers
   ========================================================================= */

namespace yww\devkit;

require('project.php');

class Ajax {

	// Reference to singleton instance of this class
	private static $instance;

	function __construct() {
		// Namespaced tags
		$this->postNonce = Project::getInstance()->projectNamespace . '-post-nonce';

		// AJAX handler functions as required
		add_action('wp_ajax_nopriv_ajax-ACTION', array($this, 'ajaxHandler'));
		add_action('wp_ajax_ajax-ACTION', array($this, 'ajaxHandler'));
	}

	// Returns the singleton instance of this class
	public static function getInstance() {
		if (null === self::$instance) {
			self::$instance = new self();
		}

		return self::$instance;
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

Ajax::getInstance();
