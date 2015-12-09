<?php
/* =========================================================================
   Project-specific functions
   ========================================================================= */

require_once('YWWProject.php');

class YWWHelpers {

	// public static variables and functions will be accessible anywhere
	// using the project namespace, eg. yww:$myVar() or yww::myFunction()

}

class_alias('YWWHelpers', $ywwProject->projectNamespace);
