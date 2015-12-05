# YWW WP + Vagrant development kit #

## Contents ##

* WP-tailored Vagrant virtual machine based on [VCCW](http://vccw.cc/)
* Starter theme, ready for quick development (PHP, Twig, JS, CSS resources)
* NPM and Bower package files, ready to install development dependencies
* Gulp script to build, optimise, lint and sync browsers in development (see below for more details)

## Requirements ##

* [Node.js and npm](http://blog.teamtreehouse.com/install-node-js-npm-mac)
* Only tested on Mac OS X El Capitan, may or may not work on other versions / systems

## Installation ##

1. Follow steps 1-4 (only) of the [VCCW](http://vccw.cc/) installation guide
2. Clone this repository into a project folder, eg. `git clone https://.../yww-wp-vagrant-dev-kit.git project.dev`
3. Rename `site-example.yml` to `site.yml` and edit it with basic site details (slug, domain, name, FTP details, etc)
4. Run the `./setup.sh` shell script which will automatically:
	* install all development and front-end dependencies via NPM and Bower
    * provision and activate the Vagrant virtual machine
    * add a line to the hosts file for local access to the site while Vagrant is up
    * install WordPress and our selected plugins (ACF, Timber and some utilities) in the virtual machine
    * compile the starter site ready for immediate viewing / editing
    * activate the new theme in WordPress

NB. You will probably be asked for a password to modify the hosts file, but this should be the only user input needed during the set up.

## Then what? ##

The site will then be up and running and accessible locally on the domain you specified in `site.yml`, and development should be carried out in the `dev/src` folder.

To launch the main task which will run an initial build and then watch for changes and push them live to browsers via Browsersync, just run `gulp`. The Browsersync proxy will be accessible at `localhost:3000` until gulp is halted with Ctrl-C.

To shut down the Vagrant box temporarily (eg. to remove the hosts file entry), use `vagrant halt`; to resume it again `vagrant up`.

To install a front-end dependency, use `bower install --save <package>` in the `dev/src` folder  (they will be automatically loaded into the theme).

To install a back-end dependency use `composer require <package>` and then `composer install` in the `dev/src/includes` folder (they will be automatically loaded into the theme).

## Further info ##

The Gulp build routine (which is executed by `gulp build`, or `gulp` if you also want to live compile / sync changed files) runs the following optimisations:

* Assembles all theme assets and code into a WordPress-compatible structure in a `build` folder
* Creates a `style.css` containing a theme header and a `functions.php` which invokes all other relevant project scripts and styles
* Concatenates third-party front-end libraries (Bower dependencies) into `lib.css` and `lib.js` (plus minified versions)
* Preprocesses author CSS using the following PostCSS libraries:
    * [postcss-simple-vars](https://github.com/postcss/postcss-simple-vars)
    * [postcss-nested-props](https://github.com/jedmao/postcss-nested-props)
    * [postcss-nested](https://github.com/postcss/postcss-nested)
    * [postcss-fontpath](https://github.com/seaneking/postcss-fontpath)
    * [lost grid](https://github.com/corysimmons/lost)
    * [autoprefixer](https://github.com/postcss/autoprefixer)
* Concatenates author CSS and JS into `main.js` and `main.css` (plus minified versions, with source mapping)
* Optimises images

## Additional notes ##

The theme will load minified assets in the front end unless `WP_DEBUG` is set to `true` in `wp-config.php`.