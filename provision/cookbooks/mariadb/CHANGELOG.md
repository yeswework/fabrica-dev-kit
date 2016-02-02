mariadb CHANGELOG
=================

This file is used to list changes made in each version of the mariadb cookbook.

0.3.1
-----
- [BUG #76] - Service is restarted every run if not localhost
- [BUG #73] - Fix directory permissions regression
- [BUG #69] - Update repository.rb to be able to manage Scientific Linux
- [BUG #57] - Add user and password to correct debian-grants
- [ENH #71] - Add xtrabackup-v2 support for SST Method
- [ENH #62] - Allow Galera cluster nodes to be configured when using Chef Solo
- [ENH #64] - Add a vagrant config to test a galera cluster
- [BUG #66] - mariadb_configuration template uses current cookbook as template source
- [BUG #68] - Correct service name inconsistency on CentOS 7

0.3.0
------
- [ENH] - Add support for using operating system shipped mariadb packages

0.2.12
------
- [BUG #39] - Push gpg key adds through http/80 - Helps with firewalled installs
- [ENH #46] - Add cookbook attribute on configuration lwrp
- [ENH #47] - Allow to pass true for unary options
- [BUG #48] - Load the needed plugins at startup

0.2.11
------
- [ENH #38] - Add CentOS support
- [ENH #40] - Add sensitive flag to resource that deal with passwords
- [BUG #43] - Fix convert TypeError in the replication provider

0.2.10
------
- [BUG] - Audit Plugin test and installation - Correct bad notifies, and stdout test

0.2.9
-----
- [BUG #36] - Audit plugin installation can crash mariadb server

0.2.8
-----
- [BUG #30] - When using galera, nodes were not sorted, applying configuration change too often
- [BUG #31] - ChefSpec coverage was not 100%
- [BUG #28] - Remove the only_if to mysql service
- [BUG #29] - Add a switch to not launch audit plugin install, when already installed
- [ENH] - Add a switch to separate server install and audit install when needed
- [ENH] - Add a rule to authorize line length to be 120 characters long

0.2.7
-----
- [BUG #24] - Fix convert TypeError in the replication provider
- [BUG #25] - Data are now moved when default datadir is changed
- [ENH #21] - Add audit_plugin management

0.2.6
-----
- [BUG #18] - Fix provider mariadb_replication compilation error
- [DOCS] - Complete Changelog, and correct README

0.2.5
-----
- [ENH #16] - Add a LWRP to manage replication slave
- [ENH #17] - Be able to not install development files within client recipe
- [ENH #11] - Fix the galera root password preseed
- [BUG #12] - Fix the debian-sys-maint user creation/password change
- [BUG #6] - Can change the apt repository base_url when the default one fail
- [TEST] - Add new tests for the new features (galera,development files install,replication LWRP)
- [DOCS] - Complete Changelog, and add new features explanations into README

0.2.4
-----
- [BUG #10] - Correct a FC004 broken rule
- [BUG #9] - Correct foodcritic tests (add --epic-fail any to be sure it fails when a broken rule is detected)

0.2.3
-----
- [BUG #4] - Add a real management of mysql root password
- [ENH #5] - Now restart mysql service when port is changed
- [ENH #7] - Remove or add root remote access via attribute
- [DOCS] - Complete documentations
- [TEST] - Add a lot of chefspec and kitchen/serverspec tests

0.2.2
-----
- [sinfomicien] - Correct repository install under debian family
- [sinfomicien] - Correct client install to add dev files
- [sinfomicien] - Correct and add multiples tests

0.2.1
-----
- [sinfomicien] - Use stove to package (remove PaxHeaders.*)

0.2.0
-----
- [sinfomicien] -  Add rpm/yum management
- [sinfomicien] -  Refactor the whole recipes list and management to ease it
- [sinfomicien] -  Correct the Documentation
- [sinfomicien] -  Rename the provider (from extraconf to configuration), and add matchers to it
- [sinfomicien] -  Add a recipe to manage client only installation
- [sinfomicien] -  Refactor all tests to manage new platform (centos/redhat/fedora)

0.1.8
-----
- [sinfomicien] -  Add ignore-failure to debian grants correct, as it can break on initial setup

0.1.7
-----
- [sinfomicien] -  Correct a typo (unnecessary call to run_command)

0.1.6
-----
- [sinfomicien] -  improve Galera configuration management
- [sinfomicien] -  Add new rspec tests
- [sinfomicien] -  Create Kitchen test suite

0.1.5
-----
- [sinfomicien] -  improve attributes management

0.1.4
-----
- [sinfomicien] - adapt galera55 recipe to use a generic galera recipe
- [sinfomicien] - use a generic galera recipe to create the galera10 recipe
- [sinfomicien] - Improve documentation 


0.1.0
-----
- [sinfomicien] - Initial release of mariadb
