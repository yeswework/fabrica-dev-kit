#!/usr/bin/env bash

# YWW / VCCW Vagrant development post-provision script
# currently installs Browser-sync and gets it ready for use

# switch into the Vagrant root dir
cd /vagrant

# install NPM dependencies, ie. Browser-sync and Gulp
sudo npm install

# after which, you can run `gulp browser-sync` to start a watch