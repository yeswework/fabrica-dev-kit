#!/bin/bash

# YWW WP Vagrant dev kit setup script
# make sure site.yml is filled in correctly before running this

# clone YWW WP skeleton theme
git clone https://andrewstaffell@bitbucket.org/yeswework/yww-wp-theme-skeleton.git dev/src

# change to dev folder
cd dev

# install build dependencies (Gulp + extensions)
npm install

# run Bower install to install some front-end dependencies
bower install

# start vagrant
vagrant up

# run our gulp install task which will compile the theme, start vagrant, then activate the theme in WordPress
# we let Gulp do it because it needs to read the theme name from the site.yml folder
gulp install

# go to web server folder
cd ../www

# install server dependencies (Browsersync)
npm install

# after which, the site will be ready to run and develop locally