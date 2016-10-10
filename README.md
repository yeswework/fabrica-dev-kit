#WP Atelier
##What is it?
A self-installing virtual-machine based WordPress development environment which includes a starter theme, build script, and a small but very powerful set of default tools to make WordPress theme (or plugin) development more straightforward, agile and enjoyable than ever before.

##Who is it for?
Theme (and also plugin) developers who want to speed up and and improve their workflow. WP Atelier automates just about every part of the process – from set up, through development, to deployment – using best-in-class tools and and both following and encouraging all kinds of best practices. It is also readily customizable.

##What exactly does it do?
* **Fully installs and configures an independent development environment for each project.**
    * Via [Vagrant](https://www.vagrantup.com/), installs and configures a virtual machine running the [Nginx](https://nginx.org/) web server with [PHP-FPM](https://php-fpm.org/), for super-fast local development. Each project has its own virtual machine: this is more efficient, reliable and secure than a one-size-fits-all setup like MAMP.
    * Maps the project's virtual machine to your chosen development domain (eg. `myproject.dev`) by automatically modifying the local `hosts` file, for no-fuss browser access.
    * Automatically installs all the required software ready to start developing, including the latest version of WordPress and your plugins of choice (you just list them in the config file), as well as build, optimization and deployment tools.
* **Allows you to write cleaner, more logical and more beautiful code (if you want to)...**
    * ... with templates written in [Twig](http://twig.sensiolabs.org/) rather than directly in PHP. Preinstalls the revolutionary [Timber](https://upstatement.com/timber/) to bring MVC-like separation of concerns to WP development, separating data processing and analytical logic from presentation, leading to more elegant and maintainable templates, eradicating `<?php` `?>` tag-itis forever, and preserving your sanity. A genuine 'never go back' improvement.
    * ... with [BEM syntax](http://csswizardry.com/2013/01/mindbemding-getting-your-head-round-bem-syntax/). Installs the [BEML](https://github.com/zenwalker/node-beml) preprocessor for HTML which allows you to write much less repetitive BEM markup (see below), and which in turn reflects your (Post)CSS structure more closely.
    * ... with [PostCSS](https://github.com/postcss/postcss) for variables, mixins and other CSS enhancements (it can compile your SASS or LESS code no problem).
    * ... with the [Lost Grid](https://github.com/peterramsing/lost) grid system / preprocessor, which allows you to build fluid, responsive, nested grids without using presentational classes, with or without [Flexbox](https://github.com/peterramsing/lost).
    * ... making use of the incredible [Advanced Custom Fields](https://www.advancedcustomfields.com/) plugin, which is deeply supported by Timber (see above). Can even automatically install the Pro version if you supply your licence key at setup.
* **Reduces friction in the development process:**
    * Includes a super-minimal object-orientated boilerplate theme (see below), specially constructed for bespoke theme development.
    * Keeps the development source folder outside the virtual machine for easy editing and version control.
    * Live-compiles and optimizes straight to the active theme folder inside the virtual machine as you develop, via a pre-configured [Gulp](http://gulpjs.com/) watch, which:
        * Preprocesses, [Autoprefixes](https://github.com/postcss/autoprefixer), lints and minifies (with source maps) your stylesheets.
        * Minifies your Javascript with sourcemaps.
        * Optimizes / losslessly compresses image assets.
        * Pipes all changes (to CSS or templates) directly to the browser, without requiring a page refresh, via [Browsersync](https://www.browsersync.io/), so you can finally give your clapped-out `F5` key a break (OK, `Cmd` + `W`… no Windows version yet).
    * Allows simultaneous testing on multiple devices (with synchronised scrolling and keystrokes!), also via Browsersync.
    * Combines [NPM](https://www.npmjs.com/) support with [Webpack](https://webpack.github.io/) allowing super-fast installation and inclusion of front-end modules such as jQuery plugins / other JS libraries.
    * Includes PHP [Composer](https://getcomposer.org/) support for super-fast installation and automatic inclusion of back-end extensions.
    * Allows push-button deployment (ie. with a single terminal command) to staging or production servers using [Wordmove](https://github.com/welaika/wordmove).
    * Automatically activates [ACF-JSON](https://www.advancedcustomfields.com/resources/local-json/) for ‘database’ version-control (tracks and synchronises field settings for the Advanced Custom Fields plugin across multiple environments).

## Requirements
WP Atelier runs on any recent version of Mac OS X. It requires:

* Node.js
* Gulp 4 (still in beta, but crucial for task sequencing in our build script)
* ?? Vagrant
* ?? Composer

## How to use Atelier

### Installation
Setting up a new project and getting the development environment ready to run is very easy:

1. Clone the repo into a folder for your project: `git clone git@bitbucket.org:yeswework/yww-wp-vagrant-dev-kit.git mysite`
1. In the new folder, make a copy of `setup-example.yml` called `setup.yml`, and edit this file to set a few parameters for the development site.
1. Run `./setup.rb`. This will set up your virtual machine and install everything required.

### Switching the virtual machine on and off

1. If you have just installed a project, its virtual machine will already be running. If you are returning later to a project, first run `vagrant up` from the project folder. Your project will then be accessible at the development domain you specified in the `setup.yml` folder.
1. To shut down the project's virtual machine, run `vagrant suspend` from the project folder. (Restarting your computer will automatically shut the virtual machine down anyway.)

### Development
* Before beginning development, run `gulp` in the project folder, then make your changes in the `dev/src` folder. This will watch your files for changes and live-compile and optimise them into the active theme folder.
* While Gulp is running the site will also be accessible as a Browsersync proxy usually at `localhost:3000`. You can escape Gulp (eg. when you have finished development for the time being) with `Ctrl` + `C`.

### Deployment
1. If you already filled in the FTP details in `setup.yml` skip straight to step 3.
1. If you didn't, once you have a staging or production server set up, edit the `Movefile` with your FTP (or SSH details).
1. To deploy your theme type `wordmove push --themes`. Wordmove will push your files to the server, working out which files are new each time.
1. If you are using ACF, ACF-JSON will take care of synching your fields automatically, but it's a good idea to [synchronise the fields to the database on the remote site](https://www.advancedcustomfields.com/resources/synchronized-json/) once you have pushed changes.

### Version control
* To begin version control on your project run `git init` in the `dev/src` folder, then sync with your favourite repo.

## Theme structure
What goes where when developing with Atelier:

* All editing should be done within the `src/` folder – while Gulp is running your changes will be live-compiled from here into the virtual machine's active theme folder. File paths below are within this folder.
* Templates:
     * If you want to make use of Timber (and you would be insane not to), the PHP files live in `templates/controllers/` and the corresponding Twig views in `templates/views/`. See the [Timber documentation](http://timber.github.io/timber/) for more information.
     * If you don't or can't use Timber, just create your vanilla WP templates in `templates/controllers/` as you usually would and they'll work fine.
* Assets:
     * CSS goes in `assets/css/main.pcss` (automatically included in the front-end). If you prefer to split it into several files, you can include the additional files with `@import` at the top. Vanilla CSS works fine but any PostCSS is processed automatically (see below).
     * JS goes in `assets/js/main.js` (automatically included in the front-end). Additional JS files can be enqueued in the standard WordPress way (probably in `includes/front.php` – see below).
     * Images can go in `assets/img/` and any local fonts in `assets/fonts/`. These can be references from the stylesheet via `../img/` or `../fonts/`.
* Hooks and custom functions: our super-minimal boilerplate makes no assumptions about your data or design, but it's structured to make it easy for you to hook WordPress actions and filters and add your own functions. There are several predefined files (all in the `includes/` folder) to help keep your custom code well-organised:
     * `project.php` for hooks that should affect front-end and admin requests, and for any other functions which you might need to make available to your theme (as methods of the singleton `Project` class). As a convenient shortcut, we alias the class to your project slug, so if your project slug is `atelier` you can invoke a member function with `atelier::myFunction()`.
     * `front.php` for hooks that should only affect front-end requests.
     * `admin.php` for hooks that should only affect admin requests.
     * `ajax.php` for AJAX calls (the front-end calls can be added in `assets/main.js`).
     * `models.php` for extensions to Timber objects (to assign custom properties to Post and Term objects upon instantiation).
* Installing additional dependencies (advanced level):
     * PHP modules: you can install / require Composer modules from withn the `includes` folder.
     * Front-end JS libraries can be installed using `npm` and then either included (thanks to [Webpack](https://webpack.github.io/)) via `require` statements in `assets/js/main.js`,
     * Front-end CSS libraries can also be installed with `npm` and included via `@import` statements in `assets/css/main.pcss`. The PostCSS Import plugin automatically searches `node_modules` so a statement like `@import 'normalize.css'` doesn't require an explicit path.
     * PostCSS plugins: use `npm install` from the main project folder (the parent folder of `src`), and modify the `gulpfile.js` accordingly to sequence them.

## Coding in wonderland: examples
### WordPress MVC with Timber + ACF
The magic combination of Timber and Advanced Custom Fields means we can render even complex data in our templates without carry out any data retrieval or decision logic at all. Take for example this [Repeater field](https://www.advancedcustomfields.com/add-ons/repeater-field/) setup:

![Repeater Field Example](acf-repeater.png)

With Twig (via Timber) we can display this data in a template as follows, without having to write any PHP.

```
{% if post.measurements %}
    <dl>
        {% for measurement in post.get_field('measurements') %}
            <dt>{{ measurement.title.label }}</dt>
            <dd>{{ measurement.value }}{{ measurement.unit }}</dd>
        {% endfor %}
    </dl>
{% endif %}
```

But we can go further. Say we need to derive additional data about each object (in this case, the Post containing measurements) at runtime, in order to display that data in our template. For example, say we also want to make our metric (cm or m) measurements available in imperial measurements to US users.

We can either do this by preparing the data in the corresponding controller (eg. `post.php`) just before it loads the `post.twig`, or, we can go one step further and implement a full MVC paradigm, to have this information available right from the moment the Post object is instantiated, and available for all similar objects.

To do that we can add the following code to `models.php`:

```
class MyPost extends \Timber\Post {
    var $_extendedMeasurements; // For cacheing

    function extendedMeasurements() {
        if (!$_extendedMeasurements) {
            $ms = $this->get_field('measurements');
            if (!$ms) {
                return ($_extendedMeasurements = false); // No measurements saved
            }
            foreach ($ms as &$m) {
                if ($m['unit'] == 'cm') { // Centimetres
                    $m['imperialUnit'] = 'in';
                    $m['imperialValue'] = $m['value'] / 2.54';
                }
                if ($m['unit'] == 'm') { // Metres
                    $m['imperialUnit'] = 'ft';
                    $m['imperialValue'] = $m['value'] * 3.28084';
                }
            }
            $_extendedMeasurements = $ms;
        }
        return $_extendedMeasurements;
    }
}
```
The additional information will be automatically available to the template, as long as we make sure to load the correct post object (via the child class) with `$post = new MyPost();` in our `post.php`. Then we only have to add one more short piece of code to have this information displayed in our template:

```
{% if post.measurements %}
    <dl>
        {% for measurement in post.get_field('measurements') %}
            <dt>{{ measurement.title.label }}</dt>
            <dd>{{ measurement.value }}{{ measurement.unit }}
            {% if measurement.imperialValue %}
                ({{ measurement.imperialValue }}{{ measurement.imperialUnit }})
            {% endif %}
            </dd>
        {% endfor %}
    </dl>
{% endif %}
```

### BEM with BEML + PostCSS
