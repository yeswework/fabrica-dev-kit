module.exports = (settings) => `<?php
/* =========================================================================
   Project-specific configuration, scripts and handlers
   ========================================================================= */

namespace Fabrica\\Devkit;

require_once('singleton.php');

class Project extends Singleton {

	// Namespace for this project
	public static $namespace = '${settings.slug}';

	// Tag for passing data to front-end scripts
	public static $varsTag = '${settings.slug}_script_vars';

	// Handle for front-end assets
	public static $frontHandle = '${settings.slug}-front';

	// Menus required
	public static $menus = array('main' => 'Main menu');

	// Google Analytics ID (injected by Base class)
	public static $googleAnalyticsId = '${settings.google_analytics_id || ''}';

	// Assets timestamp + environment suffixes
	public static $scriptSuffix, $styleSuffix = '';

	public function init() {

		// If in production mode, load minified timestamped assets
		if (WP_DEBUG !== true) {
			self::$scriptSuffix = '.' . SCRIPT_BUILD_TIME . '.min';
			self::$styleSuffix = '.' . STYLE_BUILD_TIME . '.min';
		}

		// Extra theme support options
		add_theme_support('editor-styles');
		add_theme_support('align-wide');
		add_theme_support('align-full');

		// Setup hooks
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
