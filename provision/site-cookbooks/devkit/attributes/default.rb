#
# Cookbook Name:: devkit
# Attributes:: default
#
# Author:: Takayuki Miyauchi
# License: MIT
#

default[:devkit][:user] = 'vagrant'
default[:devkit][:group] = 'vagrant'

default[:devkit][:locale] = ""
default[:devkit][:wp_version] = "latest"

default[:devkit][:wp_host] = "wordpress.local"
default[:devkit][:wp_home] = ""
default[:devkit][:wp_siteurl] = ""
default[:devkit][:wp_docroot] = "/var/www/wordpress"
default[:devkit][:title] = "Welcome to the WordPress"

default[:devkit][:admin_user] = "admin"
default[:devkit][:admin_password] = "admin"
default[:devkit][:admin_email] = "vagrant@example.com"

default[:devkit][:default_plugins] = []
default[:devkit][:default_theme] = ''

default[:devkit][:theme_unit_test] = true
default[:devkit][:theme_unit_test_data_url] = 'https://wpcom-themes.svn.automattic.com/demo/theme-unit-test-data.xml'
default[:devkit][:theme_unit_test_data] = '/tmp/theme-unit-test-data.xml'

default[:devkit][:dbhost] = "localhost"
default[:devkit][:dbname] = "wordpress"
default[:devkit][:dbuser] = "wordpress"
default[:devkit][:dbpassword] = "wordpress"
default[:devkit][:dbprefix] = "wp_"
default[:devkit][:always_reset] = true

default[:devkit][:is_multisite] = false
default[:devkit][:debug_mode] = false
default[:devkit][:savequeries] = false
default[:devkit][:force_ssl_admin] = false

default[:devkit][:options] = {}
default[:devkit][:rewrite_structure] = '/archives/%post_id%'
