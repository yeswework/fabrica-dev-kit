<?php
/* =========================================================================
   Admin-specific configuration, scripts and handlers
   ========================================================================= */

namespace Fabrica\Devkit;

require_once('singleton.php');
require_once('project.php');

class Admin extends Singleton {

	public function init() {
		// Exit now for non-admin requests
		if (!is_admin()) { return; }

		// Hooks that need to run for both AJAX + admin requests
		// add_action('action_name', array($this, 'memberFunction'));
		// add_filter('filter_name', array($this, 'memberFunction'));

		// Exit now if AJAX request, to register pure admin-only requests after
		if (wp_doing_ajax()) { return; }

		add_editor_style('css/editor' . Project::$styleSuffix . '.css');
		add_action('admin_enqueue_scripts', array($this, 'enqueueAdminAssets'));
		add_action('enqueue_block_editor_assets', array($this, 'enqueueBlockAssets'));

		// Hooks that only need to run in pure admin mode
		// add_action('action_name', array($this, 'memberFunction'));
		// add_filter('filter_name', array($this, 'memberFunction'));
	}

	public function enqueueAdminAssets() {
		wp_enqueue_style(Project::$namespace . '-admin', get_stylesheet_directory_uri() . '/css/admin' . Project::$styleSuffix . '.css', array(), null);
	}

	public function enqueueBlockAssets() {
		wp_enqueue_script(Project::$namespace . '-blocks', get_stylesheet_directory_uri() .  '/js/blocks' . Project::$scriptSuffix . '.js', array('wp-blocks', 'wp-i18n', 'wp-element', 'wp-editor'), null);
	}
}

// Create a singleton instance of Admin
Admin::instance()->init();
