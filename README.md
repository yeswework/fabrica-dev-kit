#WP Atelier
##What is it?
A self-installing virtual-machine based WordPress development environment which includes a starter theme, build script, and a small but very powerful set of default tools to make WordPress theme (or plugin) development more straightforward, agile and enjoyable than ever before.

##Who is it for?
Theme (and also plugin) developers who want to speed up and and improve their workflow. WP Atelier automates just about every part of the process – from set up, through development, to deployment – using best-in-class tools and and both following and encouraging all kinds of best practices. It is also readily customizable.

##What exactly does it do?
1. **Fully installs and configures an independent development environment for each project.**
    * Via [Vagrant](https://www.vagrantup.com/), installs and configures a virtual machine running the [Nginx](https://nginx.org/) web server with [PHP-FPM](https://php-fpm.org/), for super-fast local development. Each project has its own virtual machine: this makes WP Atelier much more reliable and secure than a one-size-fits-all solution like MAMP.
    * Maps the project's virtual machine to your chosen development domain (eg. `myproject.dev`) by automatically modifying the local `hosts` file, for straightforward browser access.
    * Automatically installs all the required software ready to start developing, including the latest version of WordPress and your plugins of choice (you just list them in the config file), as well as build, optimization and deployment tools.

1. **Allows you to write cleaner, more logical code (if you want to)...**
    * ... with templates written in [Twig](http://twig.sensiolabs.org/) rather than directly in PHP. Preinstalls the revolutionary [Timber](https://upstatement.com/timber/) to bring MVC-like separation of concerns to WP development, separating data processing and analytical logic from presentation, leading to more elegant and maintainable templates, eradicating `<?php``?>` tag-itis forever, and preserving your sanity. A genuine 'you'll never go back' improvement.
    * ... with [BEM syntax](http://csswizardry.com/2013/01/mindbemding-getting-your-head-round-bem-syntax/). Installs the [BEML](https://github.com/zenwalker/node-beml) preprocessor for HTML which allows you to write much less repetitive BEM markup (see below), and which in turn reflects your (Post)CSS structure more closely.
    * ... with [PostCSS](https://github.com/postcss/postcss) for variables, mixins and other CSS enhancements (it can compile your SASS or LESS code no problem).
    * ... with the [Lost Grid](https://github.com/peterramsing/lost) grid system / preprocessor, which allows you to build fluid, responsive, nested grids without using presentational classes, with or without [Flexbox](https://github.com/peterramsing/lost).
    * ... making use of the incredible [Advanced Custom Fields](https://www.advancedcustomfields.com/) plugin, which is supported by Timber (see above). Can even automatically install the Pro version if you supply your licence key at setup.

1. **Reduces friction in the development process:**
    * Includes a super-minimal object-orientated boilerplate theme (see below), specially constructed for bespoke theme development.
    * Keeps the development source folder outside the virtual machine for easy editing and version control.
    * Live-compiles and optimizes straight to the active theme folder inside the virtual machine as you develop, via a pre-configured [Gulp](http://gulpjs.com/) watch, which:
        * Preprocesses, lints and minifies (with source maps) your stylesheets.
        * Minifies your Javascript with sourcemaps.
        * Optimizes / losslessly compresses image assets.
        * Pipes changes directly to the browser, without requiring a page refresh, via [Browsersync](https://www.browsersync.io/), so you can finally give your clapped-out `F5` key a break (well, `Cmd` + `W`… no Windows version yet).
    * Allows simultaneous testing on multiple devices (with synchronised scrolling and keystrokes!), also using Browsersync.
    * Combines [NPM](https://www.npmjs.com/) support with [Webpack](https://webpack.github.io/) allowing super-fast installation and inclusion of front-end modules such as jQuery plugins / other JS libraries.
    * PHP [Composer](https://getcomposer.org/) support for super-fast installation and automatic inclusion of back-end extensions.
    * Allows push-button deployment (ie. with a single terminal command) to staging and/or production servers using [Wordmove](https://github.com/welaika/wordmove).
    * Automatically activates [ACF-JSON](https://www.advancedcustomfields.com/resources/local-json/) for ‘database’ version-control (tracks and synchronises field settings for the Advanced Custom Fields plugin across multiple environments).

## Requirements
WP Atelier runs on any recent version of Mac OS X. It requires:

* Node.js
* Gulp 4 (still in beta, but crucial for task sequencing in our build script)

## Using WP Atelier

### Installation (config, setup)
Setting up a new project and getting the development environment ready to run is very easy:

1. Clone the repo into a folder for your project: `git clone git@bitbucket.org:yeswework/yww-wp-vagrant-dev-kit.git mysite`
1. In the new folder, make a copy of `setup-example.yml` called `setup.yml`, and edit this file to set a few parameters for the development site.
1. Run `./setup.rb`. This will set up your virtual machine and install everything required.

### Development

1. If you have just installed a project, its virtual machine will already be running. If you are returning later to a project, first run `vagrant up` from the project folder. Your project will then be accessible at the development domain you specified in the `setup.yml` folder.
1. Before you start coding, run `gulp` from the project folder, then make your changes in the `dev/src` folder. While Gulp is running the site will also be accessible as a Browsersynx proxy usually at `localhost:3000`. You can escape Gulp (eg. when you have finished development for the time being) with `Ctrl` + `C`.
1. To shut down the project's virtual machine, run `vagrant suspend` from the project folder. (Restarting your computer will automatically shut the virtual machine down anyway.)

### Deployment + version control

## Structure and coding
### The WP Atelier theme structure
What you need to know to develop with WP Atelier:

* Custom functions: our super-minimal boilerplate makes no assumptions about your data or design, but it's structured to make it easy for you to hook WordPress actions and filters and add your own functions. There are several predefined files (all in the `includes` folder) to help keep your custom code well-organised:
     * `project.php` for hooks that should affect front-end and admin requests, and for any other functions you may need to use which can't. As a convenient shortcut, we make the class in this file available to your templates via the project slug, so if your project slug at setup is `myproject` you can do `myproject::myFunction()`.
     * `front.php` for hooks that should only affect the front-end requests.
     * `admin.php` for hooks that should only affect admin requests.
     * `ajax.php` for AJAX calls (the corresponding front-end code can be added in `assets/main.js`)
     * `models.php` for extensions to Timber objects (to assign custom properties to Post and Term objects upon instantiation).
* Templates:
     * If you want to make use of Timber (and you would be insane not to), the PHP files live in `templates/controllers/` and the corresponding Twig views in `templates/views/`. See the Timber documentation for more information.
     * If you don't or can't use Timber, just create your vanilla WP templates in `templates/controllers` and they'll work fine.
* Assets:
     * CSS goes in `assets/css/main.pcss`. If you prefer to split it into several files, you can include them with `@import` at the top.
     * JS goes in `assets/js/main.js`. Additional JS files can be enqueued in the standard WordPress way, by adding a hook in the appropriate place (probably `includes/front.php` – see above).
     * Images can go in `assets/img` and any local fonts in `assets/fonts`. These will be accessible from the stylesheet in `../img/` or `../fonts/`.

### MVC coding with Timber + ACF

### BEML + PostCSS

### Installing dependencies
* Back-end: Composer
* Front-end: NPM / Webpack