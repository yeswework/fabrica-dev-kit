<?php
/* =========================================================================
   Check required plugins are installed + active, and autoload Composer deps
   ========================================================================= */

// Autoload any Composer dependencies
if (file_exists('vendor/autoload.php')) {
	include_once('vendor/autoload.php');
}

// Timber: https://github.com/jarednova/timber/
if (!class_exists('Timber')) {

	if (is_admin()) {

		add_action('admin_notices', function() {
			echo '<div class="error"><p>Error: theme requires <strong>Timber</strong> plugin to be installed and activated.</p></div>';
		});

	} else {

		die('Error: Timber not installed.');

	}

} else {

	Timber::$dirname = array('views');

}

// Advanced Custom Fields: http://www.advancedcustomfields.com/
if (!class_exists('acf')) {

	if (is_admin()) {

		add_action('admin_notices', function() {
			echo '<div class="error"><p>Error: theme requires <strong>Advanced Custom Fields</strong> plugin to be installed and activated.</p></div>';
		});

	} else {

		die('Error: Advanced Custom Fields not installed.');

	}

}
