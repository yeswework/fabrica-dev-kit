<?php
/* =========================================================================
   Project-specific functions
   ========================================================================= */

namespace yww\devkit;

require_once('project.php');

class Helpers {

	// public static variables and functions will be accessible anywhere
	// using the project namespace, eg. yww::$myVar or yww::myFunction()

}

class_alias('yww\devkit\Helpers', 'yww\devkit\\' . Project::getInstance()->projectNamespace);
