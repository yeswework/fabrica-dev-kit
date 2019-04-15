<?php
/* =========================================================================
   Basic configuration
   ========================================================================= */

namespace Fabrica\Devkit;

require_once(__DIR__ . '/vendor/autoload.php');
require_once('singleton.php');
require_once('project.php');

class Base extends Singleton {

	public function __construct() {
		new \Timber\Timber();
		\Timber\Timber::$dirname = array('views');
	}

	public function init() {
		// Assets
		add_action('wp_footer', array($this, 'injectAnalytics'));

		// Features
		add_action('after_setup_theme', array($this, 'registerFeatures'));

		// Menus
		add_action('init', array($this, 'registerMenus'));
		add_filter('timber_context', array($this, 'exposeMenus'));
	}

	// Output Google Analytics tracking code
	public function injectAnalytics() {
		$googleAnalyticsId = Project::$googleAnalyticsId;
		if (isset($googleAnalyticsId) && $googleAnalyticsId != '') {

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

	// Register WP theme features and deregister some messy WP defaults
	public function registerFeatures()  {

		// Featured images
		add_theme_support('post-thumbnails');

		// HTML5 semantic markup
		add_theme_support('html5', array('search-form', 'comment-form', 'comment-list', 'gallery', 'caption'));

		// Title tag manipulation
		add_theme_support('title-tag');

		// Translation
		load_theme_textdomain(Project::$namespace, get_stylesheet_directory() . '/language');

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
	public function registerMenus() {
		$locations = array();
		foreach (Project::$menus as $slug => $name) {
			$locations[$slug] = __($name, Project::$namespace);
		}
		register_nav_menus($locations);
	}

	// Expose menus globally via Timber context
	public function exposeMenus($context) {
		foreach(Project::$menus as $slug => $name) {
			$context['menus'][$slug] = new \Timber\Menu($slug);
		}
		return $context;
	}
}

// Create a singleton instance of Project
Base::instance()->init();
