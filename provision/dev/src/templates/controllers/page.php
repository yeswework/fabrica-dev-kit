<?php

$data = \Timber\Timber::get_context();
$data['post'] = new \Timber\Post();
\Timber\Timber::render('page.twig', $data);
