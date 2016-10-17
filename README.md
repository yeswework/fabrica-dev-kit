#Fabrica for WordPress
##What is it?
A self-installing virtual-machine based WordPress development environment which includes a starter theme, build script, and a small but very powerful set of default (but optional) tools to make WordPress theme (or plugin) development more straightforward, agile and enjoyable than ever before.

##Who is it for?
Theme developers who want to speed up and improve their workflow – and enjoy it more. Fabrica automates and streamlines just about every part of the process – from set up, through development, to deployment – using best-in-class tools and both following and encouraging all kinds of best practices. It is also readily customizable.

##What exactly does it do?

###Fully installs and configures an independent local development environment for each project.

* Using [Vagrant](https://www.vagrantup.com/) and [Chef](https://www.chef.io/chef/), installs and configures a virtual machine running the [Nginx](https://nginx.org/) web server with [PHP-FPM](https://php-fpm.org/), for super-fast local development. Each Fabrica project has its own virtual machine – creating a more efficient, intuitive, reliable and secure setup than a one-size-fits-all model like MAMP.
* Maps your project's virtual machine to your chosen development domain (eg. `fabrica.dev`) by automatically modifying the local `hosts` file, for no-fuss browser access.
* Automatically installs all the software required to develop, including the latest version of WordPress and your plugins of choice (you just list them in the initial setup file), as well as build, optimization and deployment tools.

###Allows you to write cleaner, more logical and more beautiful code (if you want to)...
* ... with templates written in [Twig](http://twig.sensiolabs.org/) rather than directly in PHP. Installs the revolutionary [Timber](https://upstatement.com/timber/) to bring MVC-like separation of concerns to WP development, separating data processing and analytical logic from presentation, allowing you to write more elegant, legible and maintainable templates, eradicating `<?php` `?>` tag-itis forever. A genuine 'never go back' improvement. See the MVC section in code examples below for more.
* ... with [BEM syntax](http://csswizardry.com/2013/01/mindbemding-getting-your-head-round-bem-syntax/). Installs the [BEML](https://github.com/zenwalker/node-beml) preprocessor for HTML which allows you to write much less repetitive BEM markup (see code examples below), and which in turn reflects your (Post)CSS structure more closely.
* ... with [PostCSS](https://github.com/postcss/postcss) for variables, mixins and other CSS preprocessing enhancements (it can compile your SASS or LESS code no problem).
* ... with the [Lost Grid](https://github.com/peterramsing/lost) grid system / preprocessor, which allows you to build fluid, responsive, nested grids without using presentational classes, with or without [Flexbox](https://github.com/peterramsing/lost).
* ... making use of the fantastic [Advanced Custom Fields](https://www.advancedcustomfields.com/) plugin, which is deeply supported by Timber (see above). Fabrica can automatically install ACF Pro via Composer if you supply your licence key at setup.

###Reduces friction in the development process:
* Keeps the development source folder outside the virtual machine for easy editing and version control.
* Includes a super-minimal object-orientated boilerplate theme (see below), specially constructed for bespoke theme development.
* Live-compiles and optimizes straight to the active theme folder inside the virtual machine as you develop, via a pre-configured [Gulp](http://gulpjs.com/) watch, which:
	* Preprocesses, [Autoprefixes](https://github.com/postcss/autoprefixer), lints and minifies (with source maps) your stylesheets.
	* Minifies (with sourcemaps) and lints your Javascript.
	* Optimizes / losslessly compresses image assets.
	* Pipes all changes (to CSS or templates) directly to the browser, without requiring a page refresh, using [Browsersync](https://www.browsersync.io/), so you can finally give your clapped-out `F5` key a break (OK, `Cmd` + `R`… no Windows version yet).
* Allows simultaneous testing on multiple devices (with synchronized scrolling and keystrokes!), also via Browsersync.
* Combines [NPM](https://www.npmjs.com/) support with [Webpack](https://webpack.github.io/) allowing super-fast installation and inclusion of front-end modules such as jQuery plugins / other JS libraries. (We include [jQuery](https://jquery.com/) and [normalize.css](https://necolas.github.io/normalize.css/) by default.)
* Includes PHP [Composer](https://getcomposer.org/) support in the starter theme for super-fast installation and automatic inclusion of back-end extensions.
* Allows push-button deployment (ie. with a single terminal command) to staging or production servers using [Wordmove](https://github.com/welaika/wordmove).
* Automatically activates [ACF-JSON](https://www.advancedcustomfields.com/resources/local-json/) for ‘database’ version-control (tracks and synchronizes field settings for the Advanced Custom Fields plugin across multiple environments).

## Requirements + dependencies
Fabrica runs on any recent version of Mac OS X. It has a few dependencies:

* Vagrant
* Node.js
* Gulp 4
* Composer

Optional but recommended:

* Vagrant hostsupdater plugin (to map your chosen development domain to a project's vritual machine)
* Wordmove (for fast command-line deployment)

We have prepared [installation guidelines for all the dependencies](./docs/dependencies.md) in case you don't already have them.

## Installing and running Fabrica

### Installation
First make sure you have all the required dependencies (see above):

Setting up a new project and getting the development environment ready to run is very easy:

1. Clone the repo into a folder for your project: `git clone https://github.com/yeswework/fabrica.git fabrica-project`
1. In the new folder, make a copy of `setup-example.yml` called `setup.yml`, and edit this file to set the basic parameters for the development site.
1. Run `./setup.rb`. This will set up your virtual machine and install everything required: Nginx, PHP-FPM, WordPress, your chosen plugins and our suite of build tools.
1. **Important**: the installation procedure doesn't require any further intervention but if you are using the Vagrant hostsupdater plugin for custom development domains, you will need to enter your system password to modify the `hosts` file – so keep an eye out for the prompt, because the setup will not advance while it is waiting for this.

### Starting and stopping the virtual machine

* If you have just installed a project, its virtual machine will already be running. If you are returning later to a project, first run `vagrant up` from the project folder. Your project will then be accessible at the development domain you specified in the `setup.yml` file before installation.
* To shut down the virtual machine, run `vagrant suspend` from the project folder. (Restarting your computer will also shut down the virtual machine.)

### Running the build script + watch during active development
* During development, keep a Gulp watch running by running `gulp` from the `dev/` folder. It'll watch your files for changes and live-compile and optimize them into the virtual machine's active theme folder.
* Make all changes in the `dev/src/` folder (full info about what goes where below).
* While Gulp is running the site will also be accessible as a Browsersync proxy – by default at `http://localhost:3000/`.
* You can escape Gulp with `Ctrl` + `C`. While Gulp is not running, changes to source files will not be reflected in the active theme.
* You can also run `gulp build` to compile the current source code into the active theme folder without starting a watch.

### Deployment
1. If you already filled in FTP details in `setup.yml` skip straight to step 3.
1. If you didn't, once you have a staging or production server set up, edit the `dev/Movefile.erb` with your FTP (or SSH details).
1. To deploy your theme, make sure the latest source code is compiled (if a watch isn't running, do a `gulp build`), then type `wordmove push --themes`. Wordmove will push the new / modified files to the server.
1. If you are using ACF (whether normal or Pro), ACF-JSON will take care of synching your fields automatically, but it's a good idea to [synchronize the fields to the database on the remote site](https://www.advancedcustomfields.com/resources/synchronized-json/) once you have pushed changes, so that the new fields are recorded in the production or staging site's database.

### Version control
* To begin version control on your project run `git init` in the `dev/` folder. This will track not only your source code but also the corresponding build script and names of the modules needed to compile it into an active theme. (It's important to maintain a copy because because the default build script is subject to change in future versions of Fabrica, which could lead to problems if restoring a project from a backup.)

## Theme development with Fabrica

All editing should be done within the `dev/src/` folder – while Gulp is running your changes will be live-compiled from here into the virtual machine's active theme folder (in `dev/www/wp-content/`). The `dev/build/` folder is a shortcut symlink to the active theme folder: no editing should be done here, but it may occasionally be useful for checking compiled code in case of problems. 

File paths in this section refer to the `src/` folder.

###Templates
* If you want to make use of Timber (and you would be insane not to), the PHP files live in `templates/controllers/` and the corresponding Twig views in `templates/views/`. See the [Timber documentation](http://timber.github.io/timber/) and the MVC section of code examples below for more information.
* If you don't or can't use Timber, just create your vanilla WP templates in `templates/controllers/` as you usually would and they'll work fine.

###Assets
* CSS goes in `assets/css/main.pcss` (automatically included in the front-end). If you prefer to split it into several files, you can include the additional files with `@import` at the top. Vanilla CSS works fine but any PostCSS is processed automatically (see below).
* Javascript / jQuery code goes in `assets/js/main.js` (automatically included in the front-end), or additional JS files can be enqueued in the standard WordPress way by [hooking](https://codex.wordpress.org/Plugin_API/Action_Reference/wp_enqueue_scripts) `wp_enqueue_scripts` according to where you want the assets to load (most likely in `includes/front.php` – see next section).
* Images can go in `assets/img/` and any local fonts in `assets/fonts/`. These can be referenced from the stylesheet via `../img/` or `../fonts/`.

###Hooks and custom functions
Fabrica's super-minimal boilerplate makes no assumptions about your data or design, but it's structured to make it easy for you to hook WordPress actions and filters and add your own functions. 

There are several predefined files (all in the `includes/` folder) to help keep your custom code well-organized. We recommend keeping all project code within the object-oriented namespaced structure provided by these files, but any other `.php` file you create in the `includes/` folder will be automatically included and run in the active theme: there is no need to manually `require()` or `include()` it.

* `project.php` for hooks that should affect both front-end and admin requests, and for any other functions which you might need to make available to your theme (as methods of the singleton `Project` class). As a convenient shortcut, we alias this class to your project slug, so if your project slug is `fabrica` you can call a member function from anywhere with `fabrica::myFunction()`.
* `front.php` for hooks that should only affect front-end requests.
* `admin.php` for hooks that should only affect admin requests (the constructor includes these conditions).
* `ajax.php` for AJAX requests (the front-end calls can be added in `assets/main.js`).
* `models.php` is where to extend Post / Term / User objects by assigning extra properties to them when instantiated: see MVC section in code examples below.

###Installing additional dependencies
* PHP modules: you can install / require Composer modules from within the `includes/` folder.
* Front-end JS libraries can be installed using `npm install` and then either included (thanks to [Webpack](https://webpack.github.io/)) via `require` statements in `assets/js/main.js`,
* Front-end CSS libraries can also be installed with `npm` and included via `@import` statements in `assets/css/main.pcss`. The PostCSS Import plugin automatically searches `node_modules` so a statement like `@import 'library.css'` doesn't require an explicit path.
* PostCSS plugins: use `npm install` in the `/dev` folder (parent of `src`), and modify the `gulpfile.js` accordingly to sequence them.

## Coding in wonderland: a few examples
All of the techniques below are optional in Fabrica and vanilla HTML / CSS / PHP / WordPress API functions will all work fine – but we highly recommend making full use of these time- and sanity-conserving enhancements.

### Achieving a [Model-View-Controller](https://en.wikipedia.org/wiki/Model%E2%80%93view%E2%80%93controller) (MVC) paradigm with Timber + ACF
The magic combination of Timber and Advanced Custom Fields means we can render even complex data in our templates without carrying out any data retrieval or decision logic at all. Take for example this [Repeater field](https://www.advancedcustomfields.com/add-ons/repeater-field/) setup:

![Repeater Field Example](http://assets.yeswework.com/acf-repeater-example.png)

With Twig (via Timber) we can display this data in a template as follows, without having to write any PHP.

```
{% if post.measurements %}
	{% for measurement in post.get_field('measurements') %}
		<div>
			{{ measurement.title.label }}:
			{{ measurement.value }}{{ measurement.unit }}
		</div>
	{% endfor %}
{% endif %}
```

But we can go further. Say we need to derive additional data about each object (in this case, the Post containing measurements) at runtime, in order to display that data in our template. For example, let's say we also want to show our metric (cm or m) measurements in imperial for US users.

One way of doing this would be to prepare the additional data in the template (eg. `post.php`) just before it renders `post.twig`. But we can go one step further and implement a full MVC paradigm, so that this information is available right from the moment the Post object is instantiated (and therefore available for all similar Post objects across the site, whenever required).

To achieve this we add the following child class in `models.php`:

```
class PostWithMeasurements extends \Timber\Post {
	var $_allMeasurements; // Used to cache the values for each instance

	function allMeasurements() {
		if (!$_allMeasurements) {
			$ms = $this->get_field('measurements');
			if (!$ms) {
				return ($_allMeasurements = false); // No measurements saved
			}
			foreach ($ms as &$m) {
				if ($m['unit'] == 'cm') { // Centimetres
					$m['imperialUnit'] = 'in';
					$m['imperialValue'] = $m['value'] / 2.54;
				}
				if ($m['unit'] == 'm') { // Metres
					$m['imperialUnit'] = 'ft';
					$m['imperialValue'] = $m['value'] * 3.28084;
				}
			}
			$_allMeasurements = $ms;
		}
		return $_allMeasurements;
	}
}
```
The additional information will be automatically available to the template, as long as we make sure to instantiate the enhanced post object with `$post = new PostWithMeasurements();` in our `post.php`. Then we only have to add one more short piece of Twig code to have this information displayed in our template:

```
{% if post.measurements %}
	{% for measurement in post.allMeasurements %}
		<div>
			{{ measurement.title.label }}:
			{{ measurement.value }}{{ measurement.unit }}
			{% if measurement.imperialValue %}
				({{ measurement.imperialValue }}{{ measurement.imperialUnit }})
			{% endif %}
		</div>
	{% endfor %}
{% endif %}
```

Note how here we access `post.allMeasurements` directly, without needing the call to `post.get_field()` in Twig (which is normally essential to receive full ACF Repeater data), since we have already made that call when mapping the new property in `models.php`.

### BEM with BEML + PostCSS
The BEM methodology provides a conceptual framework which makes it easy to build blocks (groups of design and content elements) to be reused across a site without having to worry about either duplicated or conflicting rules. The methodology is simple but promotes logical, disciplined thinking and efficient, modular code. You can read more about the principles of BEM online, for example on [CSS Wizardry](http://csswizardry.com/2013/01/mindbemding-getting-your-head-round-bem-syntax/).

The inclusion of BEML, an HTML preprocessor, and PostCSS plugins, in Fabrica make the process of actually writing BEM markup and styles quicker, easier and less error-prone.

As an example, let's take some vanilla BEM markup and styles. We're using `__` notation for elements and `--` notation for modifiers. (If you prefer an alternative notation, you can configure it in `dev/gulpfile.js` by modifying the `beml` property of the `options` hash.)

#### Before...

First, the HTML:

```
<div class="measurements">
	<div class="measurement__entry measurement__entry--highlight">
		<span class="measurements__label">Width</span>:
		<span class="measurements__number">55</span>
		<span class="measurements__unit">cm</span>
	</div>
	<div class="measurement__entry">
		<span class="measurements__label">Length</span>:
		<span class="measurements__number">10</span>
		<span class="measurements__unit">m</span>
	</div>
</div>
```

Second, some corresponding CSS (fairly basic, but targets several of the member elements):

```
.measurements {
	font-family: monospace;
}
.measurements__entry--highlight {
	color: #f00;
}
.measurements__label {
	color: #777;
}
.measurements__number {
	font-weight: bold;
}
.measurements__unit {
	color: #aaa;
}
```

#### ...and after:

With BEML + PostCSS we can avoid repetition in both places, which makes the code easier to write, easier to read, and less prone to typos. Here are the equivalent versions:

First, the BEML – note how we use the attributes `block`, `elem` and `mod` instead of classes, but these are automatically rendered as classes, so that the following compiles identically to the HTML above.

```
<div block="measurements">
	<div elem="entry" mod="highlight">
		<span elem="label">Width</span>:
		<span elem="number">55</span>
		<span elem="unit">cm</span>
	</div>
	<div elem="entry">
		<span elem="label">Length</span>:
		<span elem="number">10</span>
		<span elem="unit">m</span>
	</div>
</div>
```

Second, the PostCSS, where we can make use of the `&` token both to nest elements within their containing block, and without repeating the block name, so that the following compiles to the CSS above.

```
.measurements {
	font-family: monospace;

	&__entry { /* Element */
		&--highlight { /* Modifier of the element */
			color: #f00;
		}
	}

	&__label {
		color: #777;
	}

	&__number {
		font-weight: bold;
	}

	&__unit {
		color: #aaa;
	}
}
```

### Semantic grids with Lost Grid

The following markup is representative of how many layout frameworks implement a responsive design:

```
<div class="row">
	<div class="col-xs-12 col-sm-6 col-md-8">wide cell</div>
	<div class="col-xs-6 col-md-4">normal cell</div>
</div>
<div class="row">
	<div class="col-xs-6 col-sm-4">normal cell</div>
	<div class="col-xs-6 col-sm-4">normal cell</div>
	<div class="col-xs-6 col-sm-4">normal cell</div>
</div>
```

The multiple classes are to specify size / styles at different breakpoints via media queries, but they make the code bloated and hard to read – and the CSS rules to target all the options across all the different breakpoints are hundreds of lines long. And none of the styles are semantic...

With Lost Grid (a PostCSS plugin included with Fabrica), we can move all the presentational rules where they belong – in our stylesheet – and make our classes semantic. We'll also make use of BEML for maximum conciseness (see above). Here's a quick example for comparison:

```
<div block="row">
	<div elem="cell" mod="featured">wide cell</div>
	<div elem="cell">normal cell</div>
</div>
<div block="row">
	<div elem="cell">normal cell</div>
	<div elem="cell">normal cell</div>
	<div elem="cell">normal cell</div>
</div>
```

And our CSS will look something like this:

```
.row {
	lost-flex-container: row;

	&__cell {
		@media (max-width: 540px) {
			lost-column: 1;
		}
		@media (min-width: 541px) {
			lost-column: 1/3 3;
		}

		&--featured {
			lost-column: 2/3 2;
		}
	}
}
```

For more information about the power and flexibility of Lost Grid see its [website and documentation](http://lostgrid.org/).