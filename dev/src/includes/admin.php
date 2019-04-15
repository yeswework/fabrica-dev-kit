<?php
/* =========================================================================
   Admin-specific configuration, scripts and handlers
   ========================================================================= */

namespace Fabrica\Devkit;

require_once('singleton.php');

class Admin extends Singleton {

	public function init() {
		// Exit now for non-admin requests
		if (!is_admin()) { return; }

		add_theme_support('editor-styles');
		add_editor_style('css/editor' . self::$styleSuffix . '.css');
		add_action('admin_enqueue_scripts', array($this, 'enqueueAssets'));

		// Hooks that need to run for both AJAX + admin requests
		// add_action('action_name', array($this, 'memberFunction'));
		// add_filter('filter_name', array($this, 'memberFunction'));

		// Exit now if AJAX request, to register pure admin-only requests after
		if (wp_doing_ajax()) { return; }

		// Hooks that only need to run in pure admin mode
		// add_action('action_name', array($this, 'memberFunction'));
		// add_filter('filter_name', array($this, 'memberFunction'));
	}

	public function enqueueAssets() {
		wp_enqueue_style(
			'${settings.slug}-admin',
			get_stylesheet_directory_uri() . '/css/admin' . self::$styleSuffix . '.css',
			array(),
			null
		);
	}
}

// Create a singleton instance of Admin
Admin::instance()->init();
