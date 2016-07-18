<?php

$data = \Timber\Timber::get_context();
$post = new \Timber\Post();
$data['post'] = $post;
\Timber\Timber::render('page.twig', $data);
