#!/bin/bash

# =============================================================================
# YWW WP + Vagrant dev kit setup script
# =============================================================================
# IMPORTANT: before running this script, rename site-example.yml to site.yml
# and modify it with project info. see README.md for more info
# =============================================================================

# exit on error
set -e

# rename starter source folder: this will preserve changes if/when kit updated
mv dev/src-starter dev/src

# install build dependencies (Gulp + extensions)
npm install

# run Bower install to install initial front-end dependencies
cd dev/src
bower install
cd ../..

# start vagrant
vagrant up

# run our gulp install task which will activate the theme in WordPress
# we let Gulp do it because it needs to read slug from site.yml
gulp install

# after which, the site will be ready to run and develop locally
# just run gulp