# <img src="https://fabri.ca/_static/fdk3.png" width="424" height="100" alt="Fabrica Dev Kit for WordPress" title="Fabrica Dev Kit for WordPress">
A toolkit for faster, smoother WordPress 5 development

**NEW APRIL 2020!** Completely new architecture for the Gutenberg / Block era. Now allows you to develop multiple resources – blocks, plugins and themes – simultaneously, each with its own Webpack configuration, building and deploying them altogether. No longer includes a default theme as in previous versions, but a starter theme and block are available separately.

* Super fast setup of project-specific local development servers using Docker
* Master Webpack config allows you to develop multiple theme / plugin / block resources simultaneously
* Instantly build and deploy your code to multiple environments

Supports `@wordpress/scripts` and custom Webpack configs.
Starter theme / block / plugin also available.

## All features

### Installs and configures an independent local development environment for each project

* Using [Docker](https://www.docker.com/), creates an independent development environment for your project running the [Nginx](https://nginx.org/) web server with [PHP-FPM](https://php-fpm.org/). Docker's efficient architecture means that each Fabrica Dev Kit project runs and is stored separately (unlike MAMP, where all projects share space and servers), while avoiding the bloat of a Vagrant-like solution (where each project has a capacious virtual machine to itself).
* Automatically installs all the software required to develop, including the latest version of WordPress and your plugins of choice (you just list them in the initial setup file), as well as deployment tools.
* Setup of a new project takes a matter of seconds (after the one-time installation of initial dependencies and base images).

### Reduces friction in the development process

* Automatically syncs individual development resources with the project's Docker machine, new resources can easily be added or removed
* Magic master Webpack script processes each individual resource's Webpack config simultaneously, meaning you only have to run one build process for all the different resources in your project
* Allows one-command deployment (ie. with a single terminal command) to staging or production servers (using lftp mirror). Only the resources in your config are deployed / mirrored; other server themes or plugins are left alone.

## Requirements + dependencies
Fabrica Dev Kit is compatible with recent versions of Mac OS X. It has a few dependencies:

1. **Docker** – download and run the installer by following the link for Mac OS X from the [Docker downloads page](https://docs.docker.com/docker-for-mac/) (Stable channel is fine).
1. **Node.js** – download and run the installer by following the link to the Recommended Version from the [Node.js homepage](https://nodejs.org/en/).

Optional but strongly recommended:

* If you want to use FTP for deployment, you'll need **lftp** ([installation instructions](https://brewinstall.org/Install-lftp-on-Mac-with-Brew/)).

## Getting started

### Installing Fabrica Dev Kit
First make sure you have all the required dependencies (see above). Then run `npm install fabrica-dev-kit -g` to install Fabrica Dev Kit onto your system ready to use globally via the `fdk` shell command.

### Starting a new project
1. Create a folder for your project. In this folder run `fdk init`. This will create a template `setup.yml` file for your basic project settings.
1. Edit `setup.yml` to configure basic parameters for your project. Plugins you want to be installed automatically can be listed here.
1. Run `fdk setup` from the same folder. This will set up your virtual machine and install everything required: Nginx, PHP-FPM, WordPress, any third-party plugins you specify and our development and deployment tools.

### Configuring your devleopment resources
1. Tell FDK which local resources (ie. themes and plugins) you want to be available for development in the current project by editing `config.yml` folder (in the project root) to specify the local resource paths. These can be within the current project folder (eg. in a `src/` folder) or anywhere else on your system, if you plan to share resources like blocks between projects. You can also specify server details for deployment, and you can specify multiple environemnts configs in the same file. Example entries for a `config.yml`:
```
default:
  plugins:
    - ../../plugins/fabrica-shared-block
  themes:
    - ./src/themes/fdk-theme
  ftp:
    - host: fdkserver.com
    - user:
    - password:

staging:
  plugins:
    - ../../plugins/fabrica-shared-block
  themes:
    - ./src/themes/fdk-theme
  ftp:
    - host: staging.fdkserver.com
    - user:
```
1. FDK will invoke each resource's individual Webpack config to build resources (if it needs a build step; otherwise the folder will just be mirrored as it is). To make sure this works correctly, any paths in your Webpack config should be resolved fully with `path.resolve` and the current folder, for example `path.resolve(__dirname, 'src/js/front.js')`

### Running the master Webpack during active development
* To start developing, run `fdk start` in the project folder. FDK will tell you which dynamic port the site front-end and admin are accessible at, for example:
```
[FDK] 🏭  FDK Project (fdk-project) access URLs:
[FDK] 🏭   -------------------------------------------
[FDK] 🏭   🌍  WordPress: http://localhost:32773/
[FDK] 🏭   🔧  Admin: http://localhost:32773/wp-admin/
[FDK] 🏭   🗃  Database: localhost:32774
[FDK] 🏭   -------------------------------------------
```
* FDK wills run a Webpack watch monitoring and compiling all of your specified resources at once.
* You can escape Webpack with Ctrl + c. While Webpack is not running, changes requiring a build step will not be reflected on the server.
* You can also run `fdk build` to run Webpack in build mode for any resources, prior to deployment.

### Deployment
To deploy your resources, run `fdk build` (runs Webpack for all resources in build mode) and then `fdk deploy`. (This will deploy using the resources and server specified in the `default` section of `config.yml`; if you want to deploy to a different environment, simply add its name, eg. `fdk deploy staging`.)

### Housekeeping
Multiple projects' Docker servers running simultaneously can drain system resources, so you can safely suspend any projects not currently being developed with `docker-compose stop` in the project folder (or from the Docker Dashboard). Equally it is safe to run `fdk remove` which removes the project's containers altogether (the local database is preserved); to set them up again you can run `fdk setup --reinstall`.

### Local database access
For direct MySQL access to the development database, we recommend using [Sequel Pro](https://www.sequelpro.com/) to access it while the development machine is up. The database server is accessible at `127.0.0.1`, and with the dynamic port which you'll be told when you run `fdk start` (see example output above). The username, password and database name are are `wordpress`.
