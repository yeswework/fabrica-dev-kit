Mysql2 Chef Gem Installer Cookbook
==================================

[![Build Status](https://travis-ci.org/sinfomicien/mysql2_chef_gem.png)](https://travis-ci.org/sinfomicien/mysql2_chef_gem)

mysql2_chef_gem is a library cookbook that provides an LWRP for use
in recipes. It provides a wrapper around `chef_gem` called
`mysql2_chef_gem` that eases the installation process, collecting the
prerequisites and side-stepping the compilation phase arms race.

Scope
-----
This cookbook is concerned with the installation of the `mysql2`
Rubygem into Chef's gem path. Installation into other Ruby
environments, or installation of related gems such as `mysql` are
outside the scope of this cookbook.

Requirements
------------
* Chef 11 or higher
* Ruby 1.9 (preferably from the Chef full-stack installer)

Platform Support
----------------
The following platforms have been tested with Test Kitchen and are
known to work.

```
|---------------------------------------+-----+-----+-----+-----+-----|
|                                       | 5.0 | 5.1 | 5.5 | 5.6 | 5.7 |
|---------------------------------------+-----+-----+-----+-----+-----|
| Mysql2ChefGem::Mysql / centos-5       |   X |     |     | X   | X   |
|---------------------------------------+-----+-----+-----+-----+-----|
| Mysql2ChefGem::Mysql / centos-6       |     | X   | X   | X   | X   |
|---------------------------------------+-----+-----+-----+-----+-----|
| Mysql2ChefGem::Mysql / centos-7       |     |     | X   | X   | X   |
|---------------------------------------+-----+-----+-----+-----+-----|
| Mysql2ChefGem::Mysql / fedora-20      |     |     | X   | X   | X   |
|---------------------------------------+-----+-----+-----+-----+-----|
| Mysql2ChefGem::Mysql / debian-7       |     |     | X   |     |     |
|---------------------------------------+-----+-----+-----+-----+-----|
| Mysql2ChefGem::Mysql / ubuntu-10.04   |     | X   |     |     |     |
|---------------------------------------+-----+-----+-----+-----+-----|
| Mysql2ChefGem::Mysql / ubuntu-12.04   |     |     | X   |     |     |
|---------------------------------------+-----+-----+-----+-----+-----|
| Mysql2ChefGem::Mysql / ubuntu-14.04   |     |     | X   | X   |     |
|---------------------------------------+-----+-----+-----+-----+-----|
| Mysql2ChefGem::Mariadb / fedora-20    |     |     | X   |     |     |
|---------------------------------------+-----+-----+-----+-----+-----|
| Mysql2ChefGem::Mariadb / ubuntu-14.04 |     |     | X   |     |     |
|---------------------------------------+-----+-----+-----+-----+-----|
```

Usage
-----
Place a dependency on the mysql cookbook in your cookbook's metadata.rb
```ruby
depends 'mysql2_chef_gem', '~> 1.0'
```

Then, in a recipe:

```ruby
mysql2_chef_gem 'default' do
  action :install
end
```

Resources Overview
------------------
### mysql2_chef_gem

The `mysql2_chef_gem` resource the build dependencies and installation
of the `mysql2` rubygem into Chef's Ruby environment

#### Example
```ruby
mysql2_chef_gem 'default' do
  gem_version '0.3.17'
  action :install
end
```
#### Parameters
- `gem_version` - The version of the `mysql` Rubygem to install into
  the Chef environment. Defaults to '0.3.17'
  connector libraries
- `client_version` - The version of the mysql client libraries to
  install and link against

#### Actions
- `:install` - Build and install the gem into the Chef environment
- `:remove` - Delete the gem from the Chef environment

#### Providers
Chef selects a default provider based on platform and version,
but you can specify one if your platform support it.

```ruby
mysql2_chef_gem 'default' do
  provider Chef::Provider::Mysql2ChefGem::Mariadb
  action :install
end
```

Authors
-------
- Author:: Sean OMeara (<someara@chef.io>)
- Author:: Nicolas Blanc(<sinfomicien@gmail.com>)
