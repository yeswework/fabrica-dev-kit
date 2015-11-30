<?php

$data = Timber::get_context();
Timber::render( '404.twig', $data );