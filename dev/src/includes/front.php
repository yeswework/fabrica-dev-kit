<?php
/* =========================================================================
   Front-end-specific configuration, scripts and handlers
   ========================================================================= */

namespace Fabrica\Devkit;

require_once('singleton.php');
require_once('project.php');

class Front extends Singleton {

	public function init() {
		if (is_admin() || wp_doing_ajax()) { return; }

		add_filter(Project::$varsTag, array($this, 'updateScriptVars'));

		// Front-end-specific tags, hooks and initialisations
		// add_action('action_name', array($this, 'actionHandler'));
		// add_filter('filter_name', array($this, 'filterHandler'));
	}

	// Send script variables to front end
	public function updateScriptVars($scriptVars = array()) {

		// Non-destructively merge script variables according to page or query conditions
		if (is_single()) {
			$scriptVars = array_merge($scriptVars, array(
				'nameSpaced' => array(
					'key1' => __('value one', Project::$namespace),
					'key2' => __('value two', Project::$namespace)
				)
			));
		}
		return $scriptVars;
	}
}

// Create a singleton instance of Front
Front::instance()->init();
