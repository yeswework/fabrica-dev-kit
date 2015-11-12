# YWW Vagrant/WP virtual machine #

## Instructions ##

1. Install [VCCW](http://vccw.cc/)
2. Clone this repository
3. Edit `site.yml` with basic site details (slug, domain, name, etc)
4. Run the `./setup.sh` shell script which will automatically:
    * clone the [YWW WordPress development kit](https://bitbucket.org/yeswework/yww-wp-dev-kit) into a `dev` folder
    * activate the Vagrant virtual machine
    * install WordPress and our selected plugins (eg. ACF and Timber) in the virtual machine
    * add a line to the hosts file for local access to the site while Vagrant is up
    * install all development and front-end dependencies via NPM and Bower
    * compile the site (with gulp) for an initial run
    * activate the theme in WordPress

NB. You will probably be asked for a password to modify the hosts file, but this should be the only user input needed during the set up.

## What next? ##

The site will then be up and running and accessible locally on the domain you specified in `site.yml`, and development should be carried out in the `dev/src` folder.

Instructions on available gulp tasks to run after installation can be found in the [dev kit readme](https://bitbucket.org/yeswework/yww-wp-dev-kit).