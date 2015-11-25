<?php

$context = Timber::get_context();
$post = new TimberPost();
$context[ 'post' ] = $post;
Timber::render( 'single.twig', $context );