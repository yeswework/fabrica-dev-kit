<?php
/* =========================================================================
   Admin-specific configuration, scripts and handlers
   ========================================================================= */

namespace yww\devkit;

require_once('singleton.php');

class Admin extends Singleton {

	function __construct() {

		if (is_admin() && !(defined('DOING_AJAX') && DOING_AJAX)) {
			// Admin-specific tags, hooks and initialisations
		}

		parent::__construct();

	}

}

if (is_admin() && !(defined('DOING_AJAX') && DOING_AJAX)) {
	// Create a singleton instance of Admin
	Admin::instance();
}
