<?php
/* =========================================================================
   Base class for YWW functions
   ========================================================================= */

class YWWBase {

	// Set Google Analytics ID
	protected $googleAnalyticsId = '';
	// Project namespace to be set in child class
	public $projectNamespace;

	function __construct() {

		// Assets
		add_action('wp_enqueue_scripts', array($this, 'enqueueScripts'));
		add_action('wp_footer', array($this, 'injectAnalytics'));
		// Features
		add_action('after_setup_theme', array($this, 'themeFeatures'));

	}

	function enqueueScripts() {

		// Load uncompressed scripts when debug mode is on
		if (WP_DEBUG === true) {
			$suffix = '';
		} else {
			$suffix = '.min';
		}

		// Load third-party libraries, if they exist
		wp_deregister_script('jquery');
		wp_enqueue_script('yww-lib', get_stylesheet_directory_uri() . '/js/lib' . $suffix . '.js', array(), filemtime(get_template_directory() . '/js/lib' . $suffix . '.js'), true);

		// Load theme-specific code
		wp_enqueue_script('yww-main', get_stylesheet_directory_uri() . '/js/main' . $suffix . '.js', array('yww-lib'), filemtime(get_template_directory() . '/js/main' . $suffix . '.js'), true);

		// Pass variables to JavaScript at runtime; see: http://codex.wordpress.org/Function_Reference/wp_localize_script
		$scriptVars = array();
		$scriptVars = apply_filters('yww_script_vars', $scriptVars);
		if (!empty($scriptVars)) {
			wp_localize_script('yww-main', $this->projectNamespace, $scriptVars);
		}

		// Repeat for stylesheets, first libraries, then theme-specific
		wp_register_style('yww-lib', get_stylesheet_directory_uri() . '/css/lib' . $suffix . '.css', $dependencies = array(), filemtime(get_template_directory() . '/css/lib' . $suffix . '.css'));
		wp_enqueue_style('yww-lib');
		wp_register_style('yww-main', get_stylesheet_directory_uri() . '/css/main' . $suffix . '.css', $dependencies = array(), filemtime(get_template_directory() . '/css/main' . $suffix . '.css'));
		wp_enqueue_style('yww-main');

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
		load_theme_textdomain($this->projectNamespace, get_template_directory() . '/language');

		// Clean up wp_head output
		remove_action('wp_head', 'rsd_link'); // remove really simple discovery link
		remove_action('wp_head', 'wp_generator'); // remove wordpress version

		remove_action('wp_head', 'feed_links', 2); // remove rss feed links (make sure you add them in yourself if youre using feedblitz or an rss service)
		remove_action('wp_head', 'feed_links_extra', 3); // removes all extra rss feed links

		remove_action('wp_head', 'index_rel_link'); // remove link to index page
		remove_action('wp_head', 'wlwmanifest_link'); // remove wlwmanifest.xml (needed to support windows live writer)

		remove_action('wp_head', 'start_post_rel_link', 10, 0); // remove random post link
		remove_action('wp_head', 'parent_post_rel_link', 10, 0); // remove parent post link
		remove_action('wp_head', 'adjacent_posts_rel_link', 10, 0); // remove the next and previous post links
		remove_action('wp_head', 'adjacent_posts_rel_link_wp_head', 10, 0);

		remove_action('wp_head', 'wp_shortlink_wp_head', 10, 0);

		remove_action('wp_head', 'print_emoji_detection_script', 7);
		remove_action('wp_print_styles', 'print_emoji_styles');

	}
}
