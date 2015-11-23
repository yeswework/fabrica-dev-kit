#!/bin/bash

# YWW / VCCW Vagrant development setup script
# make sure site.yml is filled in correctly before running this

# clone YWW WP skeleton theme
git clone https://andrewstaffell@bitbucket.org/yeswework/yww-wp-theme-skeleton.git dev/src

# change into new dev directory
cd dev

# run NPM install which will subsequently trigger bower install, gulp build, vagrant up
# (as well as activating the new theme in WP and modifying hosts file for local use)
npm install

# run our gulp post-install task to compile the theme for the first time and activate it
gulp post-install --vagrant

# after which, the site will be ready to run and develop locally