#
# Cookbook Name:: fabrica
# Attributes:: default
#
# Author:: Takayuki Miyauchi
# License: MIT
#

default[:fabrica][:user] = 'vagrant'
default[:fabrica][:group] = 'vagrant'

default[:fabrica][:locale] = ""
default[:fabrica][:wp_version] = "latest"

default[:fabrica][:wp_host] = "wordpress.local"
default[:fabrica][:wp_home] = ""
default[:fabrica][:wp_siteurl] = ""
default[:fabrica][:wp_docroot] = "/var/www"
default[:fabrica][:title] = "Welcome to the WordPress"

default[:fabrica][:admin_user] = "admin"
default[:fabrica][:admin_password] = "admin"
default[:fabrica][:admin_email] = "vagrant@example.com"

default[:fabrica][:default_plugins] = []
default[:fabrica][:default_theme] = ''

default[:fabrica][:theme_unit_test] = true
default[:fabrica][:theme_unit_test_data_url] = 'https://wpcom-themes.svn.automattic.com/demo/theme-unit-test-data.xml'
default[:fabrica][:theme_unit_test_data] = '/tmp/theme-unit-test-data.xml'

default[:fabrica][:dbhost] = "localhost"
default[:fabrica][:dbname] = "wordpress"
default[:fabrica][:dbuser] = "wordpress"
default[:fabrica][:dbpassword] = "wordpress"
default[:fabrica][:dbprefix] = "wp_"
default[:fabrica][:always_reset] = true

default[:fabrica][:is_multisite] = false
default[:fabrica][:debug_mode] = false
default[:fabrica][:savequeries] = false
default[:fabrica][:force_ssl_admin] = false

default[:fabrica][:options] = {}
default[:fabrica][:rewrite_structure] = '/archives/%post_id%'
