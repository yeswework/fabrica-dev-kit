<?php
/* =========================================================================
   Base class for YWW functions
   ========================================================================= */

namespace yww\devkit;

class Base {

	// Set Google Analytics ID
	protected $googleAnalyticsId = '';

	// Project namespace to be set in child class
	public $projectNamespace;

	// Project scripts main handle
	public $mainHandle;

	// Project vars filter tag
	public $varsTag;

	// Menus array
	public $menus;

	function __construct() {

		// Assets
		add_action('wp_enqueue_scripts', array($this, 'enqueueScripts'));
		add_action('wp_footer', array($this, 'injectAnalytics'));

		// Features
		add_action('after_setup_theme', array($this, 'themeFeatures'));

		// Menus
		add_action('init', array($this, 'menus'));
		add_filter('timber_context', array($this, 'timberMenus'));

	}

	function enqueueScripts() {

		// Load uncompressed scripts when debug mode is on
		if (WP_DEBUG === true) {
			$suffix = '';
		} else {
			$suffix = '.min';
		}

		// Load third-party libraries and project code
		wp_deregister_script('jquery');
		wp_enqueue_script($this->mainHandle, get_stylesheet_directory_uri() . '/js/main' . $suffix . '.js', array(), filemtime(get_template_directory() . '/js/main' . $suffix . '.js'), true);

		// Pass variables to JavaScript at runtime
		$scriptVars = array();
		$scriptVars = apply_filters($this->varsTag, $scriptVars);
		if (!empty($scriptVars)) {
			wp_localize_script($this->mainHandle, $this->projectNamespace, $scriptVars);
		}

		// Repeat for stylesheets, first libraries, then theme-specific
		wp_register_style($this->mainHandle, get_stylesheet_directory_uri() . '/css/main' . $suffix . '.css', $dependencies = array(), filemtime(get_template_directory() . '/css/main' . $suffix . '.css'));
		wp_enqueue_style($this->mainHandle);

	}

	function injectAnalytics() {

		$googleAnalyticsId = $this->googleAnalyticsId;
		if(isset($googleAnalyticsId) && $googleAnalyticsId != '') {

			?><script>
				(function(b,o,i,l,e,r){b.GoogleAnalyticsObject=l;b[l]||(b[l]=
				function(){(b[l].q=b[l].q||[]).push(arguments)});b[l].l=+new Date;
				e=o.createElement(i);r=o.getElementsByTagName(i)[0];
				e.src='https://www.google-analytics.com/analytics.js';
				r.parentNode.insertBefore(e,r)}(window,document,'script','ga'));
				ga('create','<?php echo $googleAnalyticsId; ?>','auto');ga('send','pageview');
			</script><?php

		}

	}

	function themeFeatures()  {

		// Featured images
		add_theme_support('post-thumbnails');

		// HTML5 semantic markup
		add_theme_support('html5', array('search-form', 'comment-form', 'comment-list', 'gallery', 'caption'));

		// Title tag manipulation
		add_theme_support('title-tag');

		// Translation
		load_theme_textdomain($this->projectNamespace, get_stylesheet_directory() . '/language');

		// Clean up wp_head output() - based on https://scotch.io/quick-tips/removing-wordpress-header-junk
		remove_action('wp_head', 'rsd_link');
		remove_action('wp_head', 'wp_generator');

		remove_action('wp_head', 'feed_links', 2);
		remove_action('wp_head', 'feed_links_extra', 3);

		remove_action('wp_head', 'index_rel_link');
		remove_action('wp_head', 'wlwmanifest_link');

		remove_action('wp_head', 'start_post_rel_link', 10, 0);
		remove_action('wp_head', 'parent_post_rel_link', 10, 0);
		remove_action('wp_head', 'adjacent_posts_rel_link', 10, 0);
		remove_action('wp_head', 'adjacent_posts_rel_link_wp_head', 10, 0);

		remove_action('wp_head', 'wp_shortlink_wp_head', 10, 0);

		remove_action('wp_head', 'print_emoji_detection_script', 7);
		remove_action('wp_print_styles', 'print_emoji_styles');

	}

	// Register menus with WP
	function menus() {

		$locations = array();
		foreach ($this->menus as $slug => $name) {
			$locations[$slug] = __($name, $this->projectNamespace);
		}
		register_nav_menus($locations);

	}

	// Register menus with Timber
	function timberMenus($context) {

		foreach($this->menus as $slug => $name) {
			$context['menus'][$slug] = new \TimberMenu($slug);
		}
		return $context;

	}

}
