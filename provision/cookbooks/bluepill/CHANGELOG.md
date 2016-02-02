bluepill Cookbook CHANGELOG
===========================
This file is used to list changes made in each version of the bluepill cookbook.

2.4.1 (11-10-2015)
------
- Require rsyslog ~> 2.0.0 to preserve Chef 11 compatibility
- Fix rsyslog restarting on RHEL
- Use platform_family when setting platform specific node attributes and fix bad syntax. This should improve RHEL support

v2.4.0 (09-17-2015)
------
- Updated the LSB Required-Start and Required-Stop comments of the LSB init script template to be valid
- Added name to the bluepill_test cookbook metadata for Chef 12
- If a defaults file on RHEL or Debian based systems exist for the service source that within the init scripts.  Example if /etc/default/bar exists on debian for the bar service then source that
- Added .kitchen.yml file with vagrant based testing for local testing and moved the cloud based kitchen to .kitchen.cloud.yml
- Add Travis CI config
- Added rubocop config
- Updated Berksfile to 3.X format and removed yum cookbook that wasn't used
- Updated contributing.md and added testing.md documentation
- Updated development and testing dependencies in the Gemfile
- Added maintainers.md and .toml and added Rake task for generating the MD file
- Opscode -> Chef Software everywhere
- Added Travis and cookbook version badges to the readme
- Add rake file to easy testing
- Resolved all Rubocop warnings
- Added a chefignore file and added additional files to the gitignore
- Added source_url and issues_url metadata for Supermarket

v2.3.2
------
- Never actually released

v2.3.1
------
### New Feature
- **[COOK-3705](https://tickets.chef.io/browse/COOK-3705)** - Add init.d script with LSB style


v2.3.0
------
### Improvement
- **[COOK-3503](https://tickets.chef.io/browse/COOK-3503)** - Add why-run support

v2.2.2
------
- [COOK-2507] - stringify language attributes

v2.2.0
------
- [COOK-547] - Add `load` action to provider to reload services when template changes.

v2.1.0
------
- [COOK-1295] - The bluepill cookbook does not create the default log file
- [COOK-1840] - Enable bluepill to log to rsyslog

v2.0.0
------
This version uses platform_family attribute (in the provider), making the cookbook incompatible with older versions of Chef/Ohai, hence the major version bump.

- [COOK-1644] - Bluepill cookbook fails on Redhat due to missing default or redhat template directory.
- [COOK-1920] - init script should have a template file named after platform_family instead of using file specificity

v1.1.2
------
- [COOK-1730] - Add ability to specify which version of bluepill to install

v1.1.0
------
- [COOK-1592] - use mixlib-shellout instead of execute, add test-kitchen

v1.0.6
------
- [COOK-1304] - support amazon linux
- [COOK-1427] - resolve foodcritic warnings

v1.0.4
------
- [COOK-1106] - fix chkconfig loader for CentOS 5
- [COOK-1107] - use integer for GID instead of string

v1.0.2
------
- [COOK-1043] - Bluepill cookbook fails on OS X because it tries to use root group

v1.0.0
------
- [COOK-943] - add init script for freebsd

v0.3.0
------
- [COOK-867] - enable bluepill service on RHEL family
- [COOK-550] - add freebsd support

v0.2.2
------
- Fixes COOK-524, COOK-632
