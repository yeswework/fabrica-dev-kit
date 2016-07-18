<?php
/* =========================================================================
   Front-end-specific configuration, scripts and handlers
   ========================================================================= */

namespace yww\devkit;

require_once('singleton.php');
require_once('project.php');

class Front extends Singleton {

	function __construct() {

		// Front-end-specific tags, hooks and initialisations

		add_filter(Project::$varsTag, array($this, 'updateScriptVars'));

	}

	// Send script variables to front end
	function updateScriptVars($scriptVars = array()) {

		// Non-destructively merge script variables according to page or query conditions
		if (is_single()) {
			$scriptVars = array_merge($scriptVars, array(
				'nameSpaced' => array(
					'key1' => __('value one', Project::$projectNamespace),
					'key2' => __('value two', Project::$projectNamespace)
				)
			));
		}
		return $scriptVars;

	}

}

// Create a singleton instance of Front
Front::instance();
