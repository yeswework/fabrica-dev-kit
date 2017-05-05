<?php

$data = \Timber\Timber::get_context();
\Timber\Timber::render('404.twig', $data);
