<?php

$data = Timber::get_context();
$data['title'] = single_cat_title('', false);
$data['posts'] = Timber::get_posts();
Timber::render('archive.twig', $data);
