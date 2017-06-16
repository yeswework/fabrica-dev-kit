<?php
/* =========================================================================
   Singleton pattern implementation
   ========================================================================= */

namespace Fabrica\Devkit;

class Singleton {

	// Returns the singleton instance of this class
	public static function instance() {
		static $instance;
		if ($instance === null) {

			// Late static binding (PHP 5.3+)
			$instance = new static();
		}
		return $instance;
	}

	// Private constructor, so class can't be instantiated elsewhere
	private function __construct() {}

	// Private __clone method, so instance can't be cloned
	private function __clone() {}

	// Private __sleep method, so instance can't be serialized
	private function __sleep() {}

	// Private __wakeup method, so instance can't be unserialized
	private function __wakeup() {}
}
