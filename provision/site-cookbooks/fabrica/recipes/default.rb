# encoding: utf-8
# -*- mode: ruby -*-
# vi: set ft=ruby :

require 'shellwords'

wpcli_config_path = File.join("/home/", Shellwords.shellescape(node[:fabrica][:user]), "/.wp-cli")
[wpcli_config_path, File.join(wpcli_config_path, "commands")].each do |path|
  directory path do
    recursive true
    owner node[:fabrica][:user]
    group node[:fabrica][:group]
  end
end

template File.join(wpcli_config_path, "config.yml") do
  source "config.yml.erb"
  owner node[:fabrica][:user]
  group node[:fabrica][:group]
  mode "0644"
  variables(
    :docroot => File.join(node[:fabrica][:wp_docroot], node[:fabrica][:wp_siteurl]),
    :skip_wp_default_plugins => node[:fabrica][:skip_wp_default_plugins],
    :skip_wp_default_themes => node[:fabrica][:skip_wp_default_themes]
  )
end

db_connection_info = {
  host: node[:fabrica][:dbhost],
  username: 'root',
  password: node[:mysql][:server_root_password]
}

# Create a mysql_service to test against
mysql2_chef_gem 'default' do
  client_version '5.5'
  action :install
end

mysql_service 'default' do
  version '5.6'
  port '3306'
  socket '/run/mysqld/mysqld.sock'
  initial_root_password node[:mysql][:server_root_password]
  action [:create, :start]
end

# create database
mysql_database node[:fabrica][:dbname] do
  connection db_connection_info
  action :create
end

mysql_database_user node[:fabrica][:dbuser] do
  connection db_connection_info
  password node[:fabrica][:dbpassword]
  host '%'
  action [:create, :grant]
end
