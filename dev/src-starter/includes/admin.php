<?php
/* =========================================================================
   Admin-specific configuration, scripts and handlers
   ========================================================================= */

namespace yww\devkit;

require_once('singleton.php');

class Admin extends Singleton {

	public function __construct() {

		if (!is_admin() || (defined('DOING_AJAX') && DOING_AJAX)) { return; }

		// Admin-specific tags, hooks and initialisations

	}

}

// Create a singleton instance of Admin
Admin::instance();
