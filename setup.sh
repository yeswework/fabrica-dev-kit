#!/bin/bash

# =============================================================================
# YWW WP + Vagrant dev kit setup script
# =============================================================================
# IMPORTANT: 
# before running this script, copy site-example.yml to site.yml
# and modify it with project-specific details
# =============================================================================

# exit on error
set -e

# change to dev folder
cd www

# rename starter source folder: this will preserve changes if/when kit updated
mv dev/src-starter dev/src

# install build dependencies (Gulp + extensions)
npm install

# run Bower install to install some front-end dependencies
cd dev/src
bower install
cd ../..

# start vagrant
vagrant up

# TEMPORARILY... upgrade NodeJS in Vagrant to latest version
vagrant ssh -c "sudo npm install n -g && sudo n 4.2.2"

# TEMPORARILY (until Gulp 4 is released)
# manually uninstall Gulp 3.9 from Vagrant and install Gulp 4
vagrant ssh -c "sudo npm uninstall gulp -g && sudo npm install gulpjs/gulp-cli#4.0 -g"

# run our gulp install task which will activate the theme in WordPress
# we let Gulp do it because it needs to read slug from site.yml
gulp install

# after which, the site will be ready to run and develop locally, just run:
# vagrant ssh -c "cd /vagrant/www && gulp"