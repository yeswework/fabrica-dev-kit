# encoding: utf-8
# -*- mode: ruby -*-
# vi: set ft=ruby :

require 'shellwords'

wpcli_config_path = File.join("/home/", Shellwords.shellescape(node[:devkit][:user]), "/.wp-cli")
[wpcli_config_path, File.join(wpcli_config_path, "commands")].each do |path|
  directory path do
    recursive true
    owner node[:devkit][:user]
    group node[:devkit][:group]
  end
end

template File.join(wpcli_config_path, "config.yml") do
  source "config.yml.erb"
  owner node[:devkit][:user]
  group node[:devkit][:group]
  mode "0644"
  variables(
    :docroot => File.join(node[:devkit][:wp_docroot], node[:devkit][:wp_siteurl])
  )
end

db_connection_info = {
  host: node[:devkit][:dbhost],
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
mysql_database node[:devkit][:dbname] do
  connection db_connection_info
  action :create
end

mysql_database_user node[:devkit][:dbuser] do
  connection db_connection_info
  password node[:devkit][:dbpassword]
  action [:create, :grant]
end
