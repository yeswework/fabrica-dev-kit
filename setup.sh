#!/bin/bash

# =============================================================================
# YWW WP + Vagrant dev kit setup script
# =============================================================================
# IMPORTANT: before running this script, rename site-example.yml to site.yml
# and modify it with project info. see README.md for more info
# =============================================================================

# exit on error
set -e

# copy starter source folder: this will preserve changes if/when kit updated
cp -r dev/src-starter dev/src

# get project info from user and replace values in package.json
read -r -p "[setup.sh] Project slug (mandatory, lowercase, no spaces, URL-friendly): " slug
if [ -z "$slug" ]; then
	echo "Project slug is mandatory. Setup cannot proceed without this value, please try again."
	exit
fi
sed -i '' -e 's%{{projectSlug}}%'"$slug"'%g' dev/src/package.json

read -r -p "[setup.sh] Project title [Yes We Work development kit project front-end]: " title
title=${title:-Yes We Work development kit project front-end}
sed -i '' -e 's%{{projectTitle}}%'"$title"'%g' dev/src/package.json

read -r -p "[setup.sh] Project autor [Yes We Work <info@yeswework> (http://yeswework.com)]: " author
author=${author:-"Yes We Work <info@yeswework> (http://yeswework.com)"}
sed -i '' -e 's%{{projectAuthor}}%'"$author"'%g' dev/src/package.json

read -r -p "[setup.sh] Project homepage [http://yeswework.com]: " homepage
homepage=${homepage:-"http://yeswework.com"}
sed -i '' -e 's%{{projectHomepage}}%'"$homepage"'%g' dev/src/package.json

# install build dependencies (Gulp + extensions)
echo "[setup.sh] Installing build dependencies..."
npm install

# install initial front-end dependencies
echo "[setup.sh] Installing front-end dependencies..."
cd dev/src
npm install
cd ../..

start vagrant
echo "[setup.sh] Starting Vagrant VM..."
vagrant up

# run our gulp install task which will activate the theme in WordPress
# we let Gulp do it because it needs to read slug from site.yml
echo "[setup.sh] Activating theme in WordPress..."
gulp install

# after which, the site will be ready to run and develop locally
# just run gulp
echo "[setup.sh] Setup complete. To run and develop locally just run 'gulp'."
