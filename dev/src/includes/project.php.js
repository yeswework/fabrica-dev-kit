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

	// Assets timestamp + environment suffixes
	public static $scriptSuffix, $styleSuffix;

	public function init() {

		// Load uncompressed scripts when debug mode is on
		if (WP_DEBUG === true) {
			self::$scriptSuffix = '';
			self::$styleSuffix = '';
		} else {
			self::$scriptSuffix = '.' . SCRIPT_BUILD_TIME . '.min';
			self::$styleSuffix = '.' . STYLE_BUILD_TIME . '.min';
		}

		// Setup hooks
		add_theme_support('align-wide');
		add_theme_support('align-full');
		add_action('enqueue_block_editor_assets', array($this, 'enqueueAssets'));
		add_action('init', array($this, 'registerStructure'));

		// Project-specific tags, hooks and initialisations
		// add_action('action_name', array($this, 'actionHandler'));
		// add_filter('filter_name', array($this, 'filterHandler'));
	}

	// Register Custom Post Types and Taxonomies
	public function registerStructure() {

		// http://generatewp.com/ has a useful generator
	}

	public function enqueueAssets() {
		wp_enqueue_script(
			'${settings.slug}-blocks',
			get_stylesheet_directory_uri() .  '/js/blocks' . self::$scriptSuffix . '.js',
			array('wp-blocks', 'wp-i18n', 'wp-element', 'wp-editor'),
			null
		);
	}
}

// Create a singleton instance of Project
Project::instance()->init();
`;
