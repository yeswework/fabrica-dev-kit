# <img src="https://fabri.ca/_static/fdk3.png" width="424" height="100" alt="Fabrica Dev Kit for WordPress" title="Fabrica Dev Kit for WordPress">
## A toolkit for faster, smoother WordPress development ##

## Key features

* Super fast setup of project-specific local development servers using Docker
* Allows simultaneous development of multiple blocks, plugins and themes: FDK's master watch / build script runs all resources' build steps together in one process
* Compatible with `@wordpress/scripts` and custom Webpack configs
* Starter theme and block available, but works with yours; agnostic on code frameworks
* Instantly build and deploy to multiple environments
* Check what a server holds against what a deploy would upload, and edit a live post's block markup as a local file

## FDK 3 features in detail

### Installs and configures an independent local development environment for each project

* Using [Docker](https://www.docker.com/), creates an independent development environment for your project running the [Nginx](https://nginx.org/) web server and the latest version of [PHP-FPM](https://php-fpm.org/). Docker's efficient architecture means that each Fabrica Dev Kit project runs and is stored separately (unlike MAMP, where all projects share space and servers), while avoiding the bloat of a Vagrant-like solution (where each project has a capacious virtual machine to itself).
* Automatically installs all the software required to develop, including the latest version of WordPress and your plugins of choice (you just list them in the initial setup file), as well as deployment tools.
* Setup of a new project takes a matter of seconds (after the first-time installation of dependencies and Docker images).

### Reduces friction to accelerate development and deployment

* Automatically syncs individual development resources with the project's Docker machine; new resources can easily be added or removed
* Magic master Webpack script processes each all resources' Webpack configs simultaneously, meaning you only have to run one watch / build for the whole project
* Allows deployment of all development resources with a single terminal command to staging or production servers (using lftp mirror). Only the resources in your config are deployed / mirrored; other themes or plugins are left intact.

## Requirements + dependencies
Fabrica Dev Kit is compatible with recent versions of Mac OS X. It has a few dependencies:

1. **Docker** – download and run the installer by following the link for Mac OS X from the [Docker downloads page](https://docs.docker.com/docker-for-mac/) (Stable channel is fine).
1. **Node.js** – download and run the installer by following the link to the Recommended Version from the [Node.js homepage](https://nodejs.org/en/).

Optional but recommended:

* If you want to use FTP for deployment, you'll need **lftp** ([installation instructions](https://brewinstall.org/Install-lftp-on-Mac-with-Brew/)).

## Getting started

### Installing Fabrica Dev Kit
First make sure you have all the required dependencies (see above). Then run `npm install fabrica-dev-kit -g` to install Fabrica Dev Kit onto your system ready to use globally via the `fdk` shell command.

### Starting a new project
1. Create a folder for your project. In this folder run `fdk init`. This will create a template `setup.yml` file for your basic project settings.
2. Edit `setup.yml` to configure basic parameters for your project. Third-party plugins you want to be installed automatically in your local development environment can be listed here.
3. Run `fdk setup` from the same folder. This will set up your virtual machine and install everything required: Nginx, PHP-FPM, WordPress, any third-party plugins and our development and deployment tools.

### Configuring your development resources
1. Tell FDK which local resources (ie. themes and plugins) you want to be available for development in the current project by editing `config.yml` folder (in the project root) to specify the local resource paths. These can be within the current project folder (eg. in a `src/` folder) or anywhere else on your system, if you plan to share resources like blocks between projects. You can also specify server details for deployment, and you can specify multiple environemnts configs in the same file. Example entries for a `config.yml`:
```
default:
  plugins:
    - ../../plugins/fabrica-shared-block
  themes:
    - ./src/themes/fdk-theme
  ftp:
    host: fdkserver.dev
    user: fdk
    password: fdk
    path: /public-html

staging:
  plugins:
    - ../../plugins/fabrica-shared-block
  themes:
    - ./src/themes/fdk-theme
  ftp:
    host: staging.fdkserver.dev
    user: staging
    password: staging
    path: /staging
```
   To keep a password out of `config.yml` — so the file can be committed — write a Bitwarden reference in its place: `bw://` followed by the name of the item that holds it, such as `password: bw://coda-production-ftp`. This works for `ftp.password` and `rest.application_password`. FDK reads the item's password with the Bitwarden CLI (`bw`) only when it connects to the server (`deploy`, `drift`, `pull`, `push`, `refs`), so `fdk start` and `config:*` never prompt. `bw` needs an unlocked vault: FDK uses `BW_SESSION` if it is exported, and otherwise the session saved in the login keychain by `security add-generic-password -U -a "$USER" -s bw-session -w "$(bw unlock --raw)"`, which lasts until `bw lock`. Item names must not be part of another item's name, since `bw` matches by substring and stops on more than one result; after an item is added, `bw sync` makes it visible.
2. FDK will invoke each resource's individual Webpack config to build resources (if it needs a build step; otherwise the folder will just be mirrored as it is). To make sure this works correctly, any paths in your Webpack config should be resolved fully with `path.resolve` and the current folder, for example `path.resolve(__dirname, 'src/js/front.js')`

### Running the master Webpack during active development
* To start developing, run `fdk start` in the project folder. FDK will tell you which dynamic port the site front-end, admin and database are accessible at for this session, for example:
```
[FDK] 🏭  FDK Project (fdk-project) access URLs:
[FDK] 🏭   -------------------------------------------
[FDK] 🏭   🌍  WordPress: http://localhost:32773/
[FDK] 🏭   🔧  Admin: http://localhost:32773/wp-admin/
[FDK] 🏭   🗃  Database: localhost:32774
[FDK] 🏭   -------------------------------------------
```
* FDK will then run its master Webpack watch monitoring and compiling all of your specified resources at once, using each one's own Webpack settings respectively.
* You can escape Webpack with ctrl + c. While Webpack is not running, changes requiring a build step will not be reflected on the server.
* You can also run `fdk build` to run Webpack in build mode, eg. prior to deployment.

### Deployment
To deploy your resources, run `fdk build` (runs Webpack for all resources in build mode) and then `fdk deploy`. This will deploy using the resources and server specified in the `default` section of `config.yml`; if you want to deploy to a different environment, simply add its name, eg. `fdk deploy staging`.

Anything listed under an environment's `ftp.commands` is passed to `lftp` before it connects. The
whole script now runs with `set cmd:fail-exit yes` prepended, so the first command that fails
aborts that resource's deploy and `fdk deploy` exits non-zero. Previously `lftp -c` reported only
the *last* command's status, which meant a `--backup` (`fdk deploy -k`) that failed was invisible
and the overwriting upload went ahead regardless. If you have an `ftp.commands` entry that
legitimately exits non-zero, it will now stop the deploy for that resource.

`fdk deploy -k` checks whether the resource is on the server before taking its backup, so a
first deploy says there is nothing to back up and carries on rather than stopping.

The backup is a copy beside the live folder, named `<resource>_<timestamp>`, taken as its own step
once the checks below have passed, so a resource they stop is never copied: if it fails, nothing is uploaded and the live folder is untouched. Where the environment logs in
over SFTP with a key — an `ssh … -i <key>` `sftp:connect-program` in `ftp.commands` — the copy is
one `cp -a` on the server and takes seconds. Otherwise, or if that login is refused a shell (an
SFTP-only host), every file comes down to your machine and goes back up, so it takes about as long
as a full upload.

Every deploy script also opens with bounded network settings, because lftp's own defaults are 1000
retries and a five-minute response timeout — against a server that is down or firewalled it never
fails, it retries for days with nothing on screen:

```
set net:max-retries 3
set net:reconnect-interval-base 2
set net:timeout 30
```

Against a refused connection the ACF preflight now gives up after about 5 seconds and the upload
after about 15 — it opens several connections, each with its own retries — and an unroutable
address takes about a minute and a half per step. Either way `fdk deploy` exits non-zero with lftp's own
error, where before it sat there indefinitely.

These come *before* anything in `ftp.commands`, and lftp's `set` is last-wins, so your own value
for any of them takes precedence — raise `net:timeout` if you deploy to a slow server.

Before uploading a resource, `fdk deploy` checks what it would ship. A deploy mirrors the working
folder as it stands, and with `--delete` in `ftp.params` it also removes from the server whatever
the folder lacks, so each of these stops the resource. Each is listed by the name `--skip` takes:

* `acf`: the server's `acf-json` holds field groups newer than the local ones, or ones that can't
  be compared with them, or can't be read at all (the ACF preflight)
* `vendor`: a `composer.json` and no `vendor/autoload.php`: run `composer install` first
* `build`: a `build` script in `package.json` and no `build/`: run `fdk build` first. A
  `package.json` that isn't valid JSON fails this check too
* `webpack`: a `.js` file under `build/` containing `webpackMissingModule`, the stub webpack writes
  for an import it couldn't resolve. The stub throws at runtime, but the build still exits 0
* `uncommitted`: uncommitted changes to files the deploy would upload: edits, new files, and with
  `--delete` deletions. Files that `ftp.params` or `.distignore` leave out don't count. A resource
  that isn't in a git repository is deployed with a warning
* `delete`: with `--delete`, any folder at the top of the resource on the server that the upload
  would remove. FDK asks lftp by running the same mirror with `--dry-run` first

`vendor` and `build` don't apply when `ftp.params` or `.distignore` leave that folder out of the
upload anyway.

Run from a terminal, `fdk deploy` lists what failed and asks whether to deploy that resource
anyway. Wherever there's no terminal to ask on (a script, CI, an agent's shell), or with `-s,
--strict`, it refuses that resource, names the `--skip` that would get past it, and exits non-zero.
`--skip <checks>` leaves the named checks out for one run, comma-separated or repeated
(`--skip vendor,delete`); a name that isn't one of the six is an error. `-f, --force` skips every
check, and can't be combined with `--strict`; `--skip` can, which refuses on the checks left.

A `src/` edited after the newest file in `build/` is only warned about, since webpack doesn't
rewrite output whose contents are unchanged: an older `build/` may still be fresh.

### Checking what a server is missing
`fdk drift production` tells you, resource by resource, whether the server holds what `fdk deploy
production` would upload. It covers every resource in `production` *and* in each `production/*`
section, since those usually exist to deploy one resource alone, each against the server of the
section that deploys it: a `production/*` section with an `ftp:` of its own is compared with that
server, and one whose `ftp:` has no `host` is skipped with a warning, since it can't deploy either.
Each one is downloaded into a temp folder and compared file by file with the local copy, both
filtered as `deploy` filters them — the include and exclude options in `ftp.params`, then the
resource's `.distignore` — and reported as identical, as the files that differ (`changed`, `local only` — not
deployed yet — or `server only` — a `--delete` deploy would remove it), or as not on the server. It
never uploads or deletes anything, and exits non-zero when anything differs.

It compares contents rather than versions or timestamps, because versions aren't always bumped and
every rebuild changes every timestamp. The flip side is that it compares your *local build*: run
`fdk build` first, or a stale `build/` shows up as server drift. A resource whose source was edited
after its build output last changed gets a reminder. Two builds of the same source can also differ
when they were made with different `node_modules`, so a difference confined to `build/` with no
source commits since the server's copy is usually that rather than missing work.

### Editing a live post's block markup
`fdk pull production 12` copies post 12's block markup from the `production` site into a local
file, byte for byte, and says where: a temp file, unless you name one with `fdk pull production 12
page.html`. A post that isn't published needs its type as well, such as `pages/12`. Edit the file,
then `fdk push production 12 page.html` writes it back and purges the site's cache (SiteGround's,
where the site has it). WordPress keeps the previous content as a revision, so a push can be undone
from the editor.

`push` refuses anything that would lose or break content: a post that has changed on the site since
the pull, a file pulled from a different site or post, a user who can't save unfiltered HTML (so
WordPress would strip markup — on multisite, or with `DISALLOW_UNFILTERED_HTML`), or a synced pattern
that isn't published on the site, which would render as nothing. What it checks against is kept
beside the file, in `page.html.fdk.json`.

Synced pattern IDs differ between the live site and your local one. `fdk refs production page.html
to-local` swaps each pattern in the file for the local pattern with the same title, so the markup
renders locally, and `to-live` swaps them back. A file that still holds local IDs can't be pushed.

Each section gets in one of two ways:

* **SSH**, running WP-CLI on the server, when its `ftp:` is sftp and `ftp.commands` sets
  `sftp:connect-program` to an `ssh` that logs in with a key (`-i`). There's nothing more to set up.
* **The REST API** otherwise, with a `rest:` block naming the site's https URL, a user and an
  application password (created under Users → Profile):

```
production:
  rest:
    url: https://example.com
    user: editor
    application_password: bw://example-wp
```

A section with both uses SSH, and falls back to `rest:` with a warning if WP-CLI doesn't answer.
Wherever `rest.url` is set, over SSH too, FDK first checks that the site reports that URL as its
home, so a credential for one site is never used on a copy of it.

### Filling the local site from a live one
`fdk seed production` copies the `production` site's content into your local site, reached the same
way as `pull`. Posts keep their live IDs, so synced patterns, navigation, the front page and images
all still find what they refer to. The live site is only read. Afterwards the live URL is replaced
with the local one throughout the database.

It copies what the Fabrica Export plugin does by default: posts from the last 6 months, and every
page, synced pattern, template, template part, navigation menu, classic menu item and ACF field
group, plus the active theme's global styles. The media, terms, comments and authors those posts
use come along, as do the settings that pick the front page. Authors get a placeholder email
address, so nothing the local site sends can reach a real person. A `seed:` block under the section
changes the choice, per post type:

```
production:
  seed:
    post: { months: 12 }  # or { limit: 20 }, { ids: [12, 40] }
    product: true         # a type the defaults leave out
    acf-field: false      # one they include
```

`--only page,wp_template`, `--limit`, `--months` (`0` for all) and `--ids` change it for one run.
`months` leaves menu items and global styles whole, since their dates say when they were added, not
whether they're in use. With `--only` or `--ids` the site's settings stay as they are locally: they
name posts, such as the front page, that the run may not copy.
Drafts are left out, as Fabrica Export leaves them, except a post named in `ids`.
`--dry-run` lists what would be copied, and anything in the way, without writing.

If a post or comment ID is already taken on the local site, nothing is written and the clashes are
listed. `--replace` overwrites those, and only those. Nothing local is ever deleted. Templates, template
parts and global styles are matched by theme and slug, not ID, as WordPress itself finds them.

The media library entries come across, the files don't: proxy missing uploads from the live site in
`provision/web/wordpress-fpm.conf`, and `seed` warns until you have. Over SSH everything is read as
stored. Over the REST API, post meta that isn't registered for REST (most ACF fields) and ACF field
groups can't be read, and `seed` says so.

### Troubleshooting and housekeeping
If you run into any problems during development, restarting the Docker machine may help. Stop FDK with ctrl + c and then run `fdk dc restart` followed by `fdk start` again.

Multiple projects' Docker servers running simultaneously can hog system resources, so you can safely suspend any projects not currently being developed with `fd dc stop` in the project folder (or from the Docker Dashboard). Equally it is safe to run `fdk remove` which removes the project's containers altogether (the local database is preserved); to set them up again you can run `fdk setup --reinstall`.

New projects pick up the current WordPress release from the `fabricawp/wordpress` Docker image, which is rebuilt and its tag bumped in `dev/docker-compose.yml.js` when a new WordPress major version ships (see the comment above that line for the rebuild steps). An **existing** project's WordPress install doesn't move on its own — a plain `wp core update` inside its `wp` container can land on a pre-release nightly rather than the stable release, so upgrade one deliberately instead:
```
wp core update --version=<target> --force
wp core update-db
```

### Local database access
For direct MySQL access to the development database, you can use an app such as [Sequel Pro](https://www.sequelpro.com/) while the development machine is up. The database server is accessible at `127.0.0.1`, and with the dynamic port which you'll be told when you run `fdk start` (see example output above). The username, password and database name are are `wordpress`.

### All available FDK commands
(You can type `fdk` in any FDK project folder to see this list.)

Command                      | Description |
-----------------------------|-------------|
`init [options] [slug]`      | Start a new project folder called `[slug]` containing the `setup.yml` configuration file. `[slug]` must be unique and no other Docker Compose project should share this name. All optional arguments will be set in the `setup.yml` file and can be modified there before running `setup`.
`setup [options]`            | Setup project based on setting on `setup.yml` file
`config:url`                 | Update URLs in DB to match changes to WP container port set automatically by Docker. Output current access URLs and ports
`config:resources [project]` | Configure Docker volumes to match resources' paths in the `config.yml` settings file if there are new resources under `[project]`. If no `[project]` is passed,  resources under `default` will be checked
`config:all [project]`       | Run all project configuration tasks (`config:url` and `config:resources`)
`urls`                       | Output current access URLs and ports
`deploy [project]`           | Deploy resources to server according to configuration in `config.yml` file. If no `[project]` is passed, settings under `default` will be loaded. Files and folders matching patterns in resource `.distignore` file will be ignored. Checks each resource first and asks before deploying one that fails (see Deployment); `--strict` refuses instead, `--skip <checks>` leaves the named checks out, `--force` skips them all
`drift [project]`            | Compare every resource `[project]` and its `[project]/*` sections deploy with the copy on the server, file by file, without changing anything. Files excluded by `ftp.params` or each resource's `.distignore` are left out, as in `deploy`
`pull <project> <post> [file]` | Copy a post's block markup, byte for byte, from the `<project>` site into `[file]` (a temp file if omitted). `<post>` is an ID, or type and ID such as `pages/12` for a draft
`push <project> <post> [file]` | Write a pulled file back into its post, then purge the site's cache. Refuses if the post changed since the pull, if a synced pattern ref isn't published on the site, or if the user can't save unfiltered HTML
`refs <project> <file> <direction>` | Swap the synced pattern refs in `<file>` between the `<project>` site and the local one, matching patterns by title. `<direction>` is `to-local` or `to-live`
`seed <project>`             | Fill the local site with the `<project>` site's content under its live IDs, chosen as Fabrica Export does or by `<project>`'s `seed:` block and `--only`, `--limit`, `--months`, `--ids`. Refuses on a taken ID unless `--replace`; `--dry-run` writes nothing
`start [project]`            | Run Webpack in development mode. All available resources' Webpack configurations are loaded, and changed files are watched
`build [project]`            | Run Webpack in production mode and build source for all available resources Webpack configurations
`dc`                         | Run `docker-compose` commands, eg. `fdk dc ps`
`sh`                         | Start shell on WP container
`shroot`                     | Start shell as root on WP container
`wp`                         | Run WP Cli. eg. `fdk wp option list`
`logs`                       | Tail WP container logs
`remove`                     | Stop all project containers, remove their volumes and WP project image
