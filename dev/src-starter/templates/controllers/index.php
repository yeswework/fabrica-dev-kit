<?php

$data = Timber::get_context();
Timber::render('index.twig', $data);
