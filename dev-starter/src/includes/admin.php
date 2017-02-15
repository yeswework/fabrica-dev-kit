<?php
/* =========================================================================
   Admin-specific configuration, scripts and handlers
   ========================================================================= */

namespace fabrica;

require_once('singleton.php');

class Admin extends Singleton {

	public function __construct() {
		if (!is_admin() || (defined('DOING_AJAX') && DOING_AJAX)) { return; }

		// Admin-specific tags, hooks and initialisations
		// add_action('action_name', array($this, 'memberFunction'));
		// add_filter('filter_name', array($this, 'memberFunction'));
	}
}

// Create a singleton instance of Admin
Admin::instance();
