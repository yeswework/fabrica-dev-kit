Description
===========

Installs and configures PHP-FPM (FastCGI Process Manager), an alternative PHP FastCGI implementation with some additional features useful for sites of any size, especially busier sites.  It's like the `unicorn` of the PHP world dawg.

Requirements
============

Platform
--------

* Debian, Ubuntu
* CentOS, Red Hat, Fedora
* Amazon Linux

Cookbooks
---------

* apt (leverages apt_repository LWRP)
* yum (leverages yum_repository LWRP)

The `apt_repository` and `yum_repository` LWRPs are used from these cookbooks to create the proper repository entries so the php-fpm package downloaded and installed.

Description
==========

Creates a PHP-FPM configuration file at the path specified.  Meant to be deployed with a service init scheme/supervisor such as runit.  Please see the `application::php-fpm` recipe for a complete working example. In depth information about PHP-FPM's configuration values can be [found in the PHP-FPM documentation](http://php.net/manual/en/install.fpm.configuration.php).

Usage
=====
Simply include the recipe where you want PHP-FPM installed. Default pool __www__ will be created. To disable pool creation set default['php-fpm']['pools'] to false.

To customize settings and pools you can override default attributes.

### Usage in roles:
```ruby
name "php-fpm"
description "php fpm role"
run_list "recipe[php-fpm]"
override_attributes "php-fpm" => {
	"pools" => {
		"default" => {
			:enable => true
		},
		"www" => {
			:enable => "true",
			:cookbook => "another-cookbook",
			:process_manager => "dynamic",
			:max_requests => 5000,
			:php_options => { 'php_admin_flag[log_errors]' => 'on', 'php_admin_value[memory_limit]' => '32M' }
		}
	}
}
```

Creating pools in recipes
=========================
### Create PHP-FPM pool named 'www' with default settings:
```ruby
php_fpm_pool "www"
```

### Create PHP-FPM pool named 'www' with custom settings:
```ruby
php_fpm_pool "www" do
  cookbook "another-cookbook" # get template from another cookbook
  process_manager "dynamic"
  max_requests 5000
  php_options 'php_admin_flag[log_errors]' => 'on', 'php_admin_value[memory_limit]' => '32M'
end
```

### Delete PHP-FPM pool named 'www':
```ruby
php_fpm_pool "www" do
  enable false
end
```

License and Author
==================

Author:: Seth Chisamore (<schisamo@opscode.com>)

Copyright:: 2011, Opscode, Inc

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
