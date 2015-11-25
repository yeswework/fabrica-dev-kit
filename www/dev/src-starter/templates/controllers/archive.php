<?php

$context = Timber::get_context();
$context[ 'title' ] = single_cat_title( '', false );
$context[ 'posts' ] = Timber::get_posts();
Timber::render( 'archive.twig', $context );