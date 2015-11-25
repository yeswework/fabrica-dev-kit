#!/bin/bash

# ===================================================================
# YWW WP + Vagrant dev kit setup script
# ===================================================================
# IMPORTANT: 
# before running this script, copy project-example.yml to project.yml
# and modify it with project-specific details
# ===================================================================

# exit on error
set -e

# change to dev folder
cd www

# rename starter files + folders 
# this trick preserves them if the dev kit is updated later
mv dev-starter dev

# install build dependencies (Gulp + extensions)
npm install

# run Bower install to install some front-end dependencies
cd dev/src
bower install
cd ../..

# start vagrant
vagrant up

# run our gulp install task which will activate the theme in WordPress
# we let Gulp do it because it needs to read slug from site.yml
gulp install

# after which, the site will be ready to run and develop locally
# during development, run the following processes simultaneously:
# gulp watch (in the dev folder)
# vagrant ssh -c “cd /vagrant/www && gulp browser-sync”
# see README.md for more