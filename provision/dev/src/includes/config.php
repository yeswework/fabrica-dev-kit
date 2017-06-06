<?php

// Load config according to environment
if (!array_key_exists('SERVER_NAME', $_SERVER) || $_SERVER['SERVER_NAME'] == 'localhost') {
	require_once('config/dev.php');
} else {
	require_once('config/prod.php');
}
