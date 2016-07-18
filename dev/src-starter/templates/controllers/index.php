<?php

$data = \Timber\Timber::get_context();
\Timber\Timber::render('index.twig', $data);
