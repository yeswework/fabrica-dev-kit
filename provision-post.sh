#!/usr/bin/env bash

# YWW / VCCW Vagrant development post-provision script
# currently installs Browsersync and gets it ready for use

# switch into the Vagrant www folder
cd /vagrant/www

# install NPM dependencies, ie. Browsersync and Gulp
sudo npm install

# after which, you can run `gulp browser-sync` to start a watch