# <img src="https://fabri.ca/_static/fdk-logo-large.png" height="120" alt="Fabrica Dev Kit for WordPress" title="Fabrica Dev Kit for WordPress">
A development environment and build toolkit to accelerate and optimize every stage of the WordPress development process. For custom theme (or plugin) developers, especially those with complex CMS-type requirements. Its main features are:

* Instant setup of project-specific fast local development server (using [Docker](https://www.docker.com/))
* Tools for coding leaner, cleaner themes (using Twig, PostCSS, MVC and BEM)
* Build script to preprocess, lint and optimize assets
* Live browser testing, synchronized across devices (using Browsersync)
* Version control for custom fields (using ACF-JSON)
* Instant deployment (using Wordmove)

## Changelog

**2.0**
* Fabrica Dev Kit is now installed globally via `npm`, rather than cloned for each project, and accessible as `fdk` shell command - see below for instructions. Also includes options for plugin development and easier Wordmove configuration.

## All features

### Installs and configures an independent local development environment for each project

* Using [Docker](https://www.docker.com/), creates an independent development environment for your project running the [Nginx](https://nginx.org/) web server with [PHP-FPM](https://php-fpm.org/). Docker's efficient architecture means that each Fabrica Dev Kit project runs and is stored separately (unlike MAMP, where all projects share space and servers), while avoiding the bloat of a Vagrant-like solution (where each project has a capacious virtual machine to itself).
* Automatically installs all the software required to develop, including the latest version of WordPress and your plugins of choice (you just list them in the initial setup file), as well as build, optimization and deployment tools.
* Setup of a new project takes a matter of seconds (after the one-time installation of initial dependencies and base images).

### Allows you to write cleaner, more logical and more beautiful code (if you want to)...
* ... with templates written in [Twig](http://twig.sensiolabs.org/) rather than directly in PHP. Installs the revolutionary [Timber](https://upstatement.com/timber/) to bring MVC-like separation of concerns to WordPress development, separating data processing and analytical logic from presentation, allowing you to write more elegant, legible and maintainable templates, eradicating `<?php` `?>` tag-itis forever. A genuine 'never go back' improvement. See the MVC section in code examples below for more.
* ... with [BEM syntax](http://csswizardry.com/2013/01/mindbemding-getting-your-head-round-bem-syntax/). Uses the [PostHTML-bem](https://github.com/rajdee/posthtml-bem/) plugin for [PostHTML](https://github.com/posthtml/posthtml) which allows you to write much less repetitive BEM markup (see code examples below), and which in turn reflects your (Post)CSS structure more closely.
* ... with [PostCSS](https://github.com/postcss/postcss) for variables, mixins and other CSS preprocessing enhancements (it can compile your SASS or LESS code no problem).
* ... with the [LostGrid](https://github.com/peterramsing/lost) grid system / preprocessor, which allows you to build fluid, responsive, nested grids without using presentational classes, with or without [Flexbox](https://github.com/peterramsing/lost).
* ... making use of the fantastic [Advanced Custom Fields](https://www.advancedcustomfields.com/) plugin, which is deeply supported by Timber (see above). Fabrica Dev Kit can automatically install ACF Pro if you supply your licence key at setup.

### Reduces friction in the development process
* Keeps the development source folder outside the virtual machine for easy editing and version control. (No need to log into a virtual machine to build / develop: it just acts as a fast server.)
* Includes a super-minimal object-orientated boilerplate theme (see below), specially constructed for bespoke theme development.
* Live-compiles and optimizes straight to the active theme folder inside the virtual machine as you develop, via a pre-configured [Gulp](http://gulpjs.com/) watch, which:
	* Preprocesses, [Autoprefixes](https://github.com/postcss/autoprefixer), lints and minifies (with source maps) your stylesheets.
	* Minifies (with sourcemaps) and lints your Javascript.
	* Optimizes / losslessly compresses image assets.
	* Pipes all changes (to CSS or templates) directly to the browser, without requiring a page refresh, using [Browsersync](https://www.browsersync.io/), so you can finally give your clapped-out `F5` key a break (OK, `Cmd` + `R`… no Windows version yet).
* Allows simultaneous testing on multiple devices (with synchronized scrolling and keystrokes!), also via Browsersync.
* Combines [NPM](https://www.npmjs.com/) support with [Webpack](https://webpack.github.io/) allowing super-fast installation and inclusion of front-end modules such as jQuery plugins / other JS libraries. (We include [jQuery](https://jquery.com/) and [normalize.css](https://necolas.github.io/normalize.css/) by default.)
* Includes PHP [Composer](https://getcomposer.org/) support in the starter theme for super-fast installation and automatic inclusion of back-end extensions.
* Allows one-command deployment (ie. with a single terminal command) to staging or production servers using [Wordmove](https://github.com/welaika/wordmove).
* Automatically activates [ACF-JSON](https://www.advancedcustomfields.com/resources/local-json/) for ‘database’ version-control (tracks and synchronizes field settings for the Advanced Custom Fields plugin across multiple environments).

## Requirements + dependencies
Fabrica Dev Kit is compatible with recent versions of Mac OS X. It has a few dependencies:

1. **Docker** – download and run the installer by following the link for Mac OS X from the [Docker downloads page](https://docs.docker.com/docker-for-mac/) (Stable channel is fine).
1. **Node.js** – download and run the installer by following the link to the Recommended Version from the [Node.js homepage](https://nodejs.org/en/).
1. **Gulp command line tools** – once Node.js is installed, run `npm install gulpjs/gulp-cli -g` from the command line. (Version 1.2.2 or higher required.)
1. **Composer** – follow the Global installation instructions in the [Composer installation guide](https://getcomposer.org/doc/00-intro.md#globally).

Optional but strongly recommended:

* **Wordmove** (for fast command-line deployment) which can be installed with `gem install wordmove`. Note: if you want to use FTP for deployment (rather than SSH), you'll also need **lftp** ([installation instructions](https://github.com/welaika/wordmove/wiki/Install-lftp-on-OSX-yosemite)).

## Getting started

### Installing Fabrica Dev Kit
First make sure you have all the required dependencies (see above). Then run `npm install fabrica-dev-kit -g` to install Fabrica Dev Kit onto your system ready to use globally via the `fdk` shell command.

### Starting a new project
1. Create a folder for your project. In this folder run `fdk init`. This will create a template `setup.yml` file for your basic project settings.
1. Edit `setup.yml` to configure basic parameters for your project. Plugins you want to be installed automatically can be listed here.
1. Run `fdk setup` from the same folder. This will set up your virtual machine and install everything required: Nginx, PHP-FPM, WordPress, your chosen plugins and our suite of build tools.

### Running the build script + watch during active development
* To work on the project, run a Gulp watch with `gulp` from the project folder. This will compile / preprocess / optimize your source files and actively watch for changes.
* Following its initial build, Gulp will tell you which dynamic port the site front-end and admin are accessible at, as well as the Browsersync proxy you can use for live-editing of markup and styles without needing to refresh:
 ```
 Fabrica Dev Kit Project (fabricaproject) access URLs:
 -------------------------------------------
 🌍  WordPress: http://localhost:32773/
 🔧  Admin: http://localhost:32773/wp-admin/
 🗃  Database: localhost:32769
 -------------------------------------------
 [BS] Proxying: http://localhost:32773
 [BS] Access URLs:
 ---------------------------------
 Local: http://localhost:3000
 External: http://172.17.3.50:3000
 ```
* Theme development takes place in the `src/` folder (see below for information about what goes where).
* You can escape Gulp with Ctrl + c. While Gulp is not running, changes to source files will not be reflected in the active theme.
* You can also run `gulp build` to compile the current source code into the active theme folder without starting a watch (eg. if you've made a tiny change and want to deploy it without needing to check on development site).

### Plugin development
* To aid with plugin development across multiple installations, FDK can import plugin files from any location on your local file system. Edit the `config/imports.yml` to specify paths, and the files will be copied whenever you run `gulp` (which will also watch for changes and update modified files, so you can develop and debug actively).

### Deployment
1. Once you have a staging or production environment set up, edit the `config/wordmove.yml` file with the corresponding FTP or SSH details.
1. To deploy your theme, make sure the latest source code is compiled (if a watch isn't running, do a `gulp build`), then type `wordmove push --themes`. Wordmove will push the new / modified files to the server.
1. If you are using ACF (whether normal or Pro), ACF-JSON will take care of synching your fields automatically, but it's a good idea to [synchronize the fields on the remote site](https://www.advancedcustomfields.com/resources/synchronized-json/) once you have deployed changes, so that the new fields are saved (from the files in the `acf-json` folder) into the production database.

### Version control
To begin version control on your project run `git init` in the project folder. This will track not only your source code but also the corresponding build script and names of the modules needed to compile it into an active theme.

### Local database access
For direct MySQL access to the development database, we recommend using [Sequel Pro](https://www.sequelpro.com/) to access it while the development machine is up. The database server is accessible at `127.0.0.1`, and with the dynamic port which you'll be told when you run `gulp` (see example output above). The username, password and database name are are `wordpress`.

### Housekeeping
If you have finished working on a project and want to free up the space used by its development environment, run `fdk remove` from the project folder. This will remove the Docker containers and images used for the project (so your development database will be deleted). You can delete the `www/` folder too, but this removes all files from the WP installation, so make sure to save any files in `www/wp-content/` you might need (such as secondary themes, plugins or uploads).

## Active development
Theme source files live in the `src/` folder – while Gulp is running your changes will be live-compiled from here into the virtual machine's active theme folder (in `www/wp-content/themes/`). The `build/` folder is a shortcut symlink to the active theme folder: no editing should be done here, but it may occasionally be useful for checking compiled code in case of problems.

File paths in this section refer to the `src/`.

### Templates
* If you want to make use of Timber (and you would be insane not to), the PHP files live in `templates/controllers/` and the corresponding Twig views in `templates/views/`. See the [Timber documentation](http://timber.github.io/timber/) and the MVC section of code examples below for more information.
* If you don't or can't use Timber, just create your vanilla WordPress templates in `templates/controllers/` as you usually would and they'll work fine.

### Assets
* CSS goes in `assets/css/main.pcss` (automatically included in the front-end). If you prefer to split it into several files, you can include the additional files with `@import` at the top. Vanilla CSS works fine but any PostCSS is processed automatically (see below).
* Javascript / jQuery code goes in `assets/js/main.js` (automatically included in the front-end), or additional JS files can be enqueued in the standard WordPress way by [hooking](https://codex.wordpress.org/Plugin_API/Action_Reference/wp_enqueue_scripts) `wp_enqueue_scripts` according to where you want the assets to load (most likely in `includes/front.php` – see next section).
* Images can go in `assets/img/` and any local fonts in `assets/fonts/`. These can be referenced from the stylesheet via `../img/` or `../fonts/`.

### Hooks and custom functions (ie. what usually goes in `functions.php`)
Fabrica Dev Kit's super-minimal boilerplate makes no assumptions about your data or design, but it's organized to make it easy for you to hook WordPress actions and filters and add your own functions.

There are several predefined files (all in the `includes/` folder) to help keep your custom code well-organized. We recommend keeping all project code within the object-oriented namespaced structure provided by these files, but any other `.php` file you create in the `includes/` folder will be automatically included and run in the active theme: there is no need to manually `require()` or `include()` it.

* `project.php` for hooks that should affect both front-end and admin requests, and for any other functions which you might need to make available to your theme (as methods of the singleton `Project` class).
* `front.php` for hooks that should only affect front-end requests.
* `admin.php` for hooks that should only affect admin requests (the constructor includes these conditions).
* `ajax.php` for handling AJAX requests (the front-end calls can be added in `assets/main.js`).
* `models.php` is where to extend Post / Term / User objects by assigning extra properties to them when instantiated: see MVC section in code examples below.

### Installing additional dependencies
* Additional build tools (eg. PostCSS plugins): use `npm install` in the project folder, and modify the `gulpfile.js` accordingly to sequence them.
* Front-end JS libraries: use `npm install` in the `src/` folder and then either included (thanks to [Webpack](https://webpack.github.io/)) via `require` statements in `assets/js/main.js`,
* Front-end CSS libraries: use `npm install` in the `src/` folder and included via `@import` statements in `assets/css/main.pcss`. The PostCSS Import plugin automatically searches `node_modules` so a statement like `@import 'library.css'` doesn't require an explicit path.
* PHP modules: you can install / require Composer modules from within the `includes/` folder.

## Code examples
All of the techniques below are optional in Fabrica Dev Kit and vanilla HTML / CSS / PHP / WordPress API functions will all work fine – but we highly recommend making full use of these time- and sanity-saving enhancements.

### Achieving a [Model-View-Controller](https://en.wikipedia.org/wiki/Model%E2%80%93view%E2%80%93controller) (MVC) paradigm with Timber + ACF
The magic combination of Timber and Advanced Custom Fields means we can render even complex data in our templates without carrying out any data retrieval or decision logic at all. Take for example this [Repeater field](https://www.advancedcustomfields.com/add-ons/repeater-field/) setup:

![Repeater Field Example](https://fabri.ca/_static/acf-repeater-example.png)

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

### BEM with PostHTML-bem + PostCSS
The BEM methodology provides a conceptual framework which makes it easy to build blocks (groups of design and content elements) to be reused across a site without having to worry about either duplicated or conflicting rules. The methodology is simple but promotes logical, disciplined thinking and efficient, modular code. You can read more about the principles of BEM online, for example on [CSS Wizardry](http://csswizardry.com/2013/01/mindbemding-getting-your-head-round-bem-syntax/).

The inclusion of PostHTML, PostCSS, and specific plugins for these, in Fabrica Dev Kit make the process of actually writing BEM markup and styles quicker, easier and less error-prone.

As an example, let's take some vanilla BEM markup and styles. We're using `__` notation for elements and `--` notation for modifiers. (If you prefer an alternative notation, you can configure it in `gulpfile.js` by modifying the `posthtmlBem` property of the `options` hash.)

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

With PostHTML-bem + PostCSS we can avoid repetition in both places, which makes the code easier to write, easier to read, and less prone to typos. Here are the equivalent versions:

First, the markup: note how we use the attributes `block`, `elem` and `mod` instead of classes, but these are automatically rendered as classes, so that the following compiles identically to the HTML above.

```
<div block="measurements">
	<div elem="entry" mods="highlight">
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

### Semantic grids with LostGrid

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

With LostGrid (a PostCSS plugin included with Fabrica Dev Kit), we can move all the presentational rules where they belong – in our stylesheet – and make our classes semantic. We'll also make use of PostHTML-bem syntax for maximum conciseness (see above). Here's a quick example for comparison:

```
<div block="row">
	<div elem="cell" mods="featured">wide cell</div>
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

For more information about the power and flexibility of LostGrid see its [website and documentation](http://lostgrid.org/).
