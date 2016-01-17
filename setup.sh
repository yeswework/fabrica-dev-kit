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

# get project info from user
echo "[setup.sh] Project slug (lowercase, no spaces, URL-friendly):"
read slug
echo "[setup.sh] Project title:"
read title

# replace project info in package.json
sed -i -e 's/{{projectSlug}}/'"$slug"'/g' dev/src/package.json
sed -i -e 's/{{projectTitle}}/'"$title"'/g' dev/src/package.json

# install build dependencies (Gulp + extensions)
echo "[setup.sh] Installing build dependencies..."
npm install

# install initial front-end dependencies
echo "[setup.sh] Installing front-end dependencies..."
cd dev/src
npm install
cd ../..

# start vagrant
echo "[setup.sh] Starting Vagrant VM..."
vagrant up

# run our gulp install task which will activate the theme in WordPress
# we let Gulp do it because it needs to read slug from site.yml
echo "[setup.sh] Activating theme in WordPress..."
gulp install

# after which, the site will be ready to run and develop locally
# just run gulp
echo "[setup.sh] Setup complete. To run and develop locally just run 'gulp'."
