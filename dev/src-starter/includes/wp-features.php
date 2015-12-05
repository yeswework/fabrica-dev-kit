<?php
/* =========================================================================
   Register / deregister WP standard theme features
   ========================================================================= */

if ( ! function_exists( 'yww_theme_features' ) ) {

	function yww_theme_features()  {

		// Featured images
		add_theme_support( 'post-thumbnails' );

		// HTML5 semantic markup
		add_theme_support( 'html5', array( 'search-form', 'comment-form', 'comment-list', 'gallery', 'caption' ) );

		// Title tag manipulation
		add_theme_support( 'title-tag' );

		// Translation
		load_theme_textdomain( 'yww', get_template_directory() . '/language' );

		// Clean up wp_head output
		remove_action( 'wp_head', 'rsd_link' ); // remove really simple discovery link
		remove_action( 'wp_head', 'wp_generator' ); // remove wordpress version

		remove_action( 'wp_head', 'feed_links', 2 ); // remove rss feed links (make sure you add them in yourself if youre using feedblitz or an rss service)
		remove_action( 'wp_head', 'feed_links_extra', 3 ); // removes all extra rss feed links

		remove_action( 'wp_head', 'index_rel_link' ); // remove link to index page
		remove_action( 'wp_head', 'wlwmanifest_link' ); // remove wlwmanifest.xml (needed to support windows live writer)

		remove_action( 'wp_head', 'start_post_rel_link', 10, 0 ); // remove random post link
		remove_action( 'wp_head', 'parent_post_rel_link', 10, 0 ); // remove parent post link
		remove_action( 'wp_head', 'adjacent_posts_rel_link', 10, 0 ); // remove the next and previous post links
		remove_action( 'wp_head', 'adjacent_posts_rel_link_wp_head', 10, 0 );

		remove_action( 'wp_head', 'wp_shortlink_wp_head', 10, 0 );

		remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
		remove_action( 'wp_print_styles', 'print_emoji_styles' );

	}
	add_action( 'after_setup_theme', 'yww_theme_features' );

}