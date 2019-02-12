module.exports = (settings) => `<?php
/* =========================================================================
   Project-specific configuration, scripts and handlers
   ========================================================================= */

namespace Fabrica\\Devkit;

require_once('singleton.php');

// Set content width value based on the theme's design
if (!isset($content_width)) {
	$content_width = 1440;
}

class Project extends Singleton {

	// Namespace for this project
	public static $namespace = '${settings.slug}';

	// Project scripts main handle
	public static $mainHandle = '${settings.slug}-main';

	// Tag for sending variables to front-end's script
	public static $varsTag = '${settings.slug}_script_vars';

	// Menus required
	public static $menus = array('main' => 'Main menu');

	// Google Analytics ID (injected by Base class)
	public static $googleAnalyticsId = '${settings.google_analytics_id || ''}';

	public function init() {
		add_action('init', array($this, 'registerStructure'));

		// Project-specific tags, hooks and initialisations
		// add_action('action_name', array($this, 'actionHandler'));
		// add_filter('filter_name', array($this, 'filterHandler'));
	}

	// Register Custom Post Types and Taxonomies
	public function registerStructure() {

		// http://generatewp.com/ has a useful generator
	}

}

// Create a singleton instance of Project
Project::instance()->init();
`;
