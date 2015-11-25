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
cd dev

# rename template files + folders (this saves them being overwritten)
# by future updates
mv bower-starter.json bower.json

# install build dependencies (Gulp + extensions)
npm install

# run Bower install to install some front-end dependencies
bower install

# start vagrant
vagrant up

# run our gulp install task which will activate the theme in WordPress
# we let Gulp do it because it needs to read slug from site.yml
gulp install

# go to web server folder
cd ../www

# install server dependencies (Browsersync)
npm install

# after which, the site will be ready to run and develop locally
# during development, run the following processes simultaneously:
# gulp watch (in the dev folder)
# vagrant ssh -c “cd /vagrant/www && gulp browser-sync”
# see README.md for more