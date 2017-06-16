<?php

$data = \Timber\Timber::get_context();
$data['title'] = single_cat_title('', false);
$data['posts'] = \Timber\Timber::get_posts();
\Timber\Timber::render('archive.twig', $data);
