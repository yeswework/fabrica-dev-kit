#
# Author::  Seth Chisamore (<schisamo@opscode.com>)
# Cookbook Name:: php-fpm
# Recipe:: package
#
# Copyright 2011, Opscode, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

include_recipe 'php-fpm::repository' unless node['php-fpm']['skip_repository_install']
include_recipe 'apt::default' if node['platform_family'] == 'debian'

if node['php-fpm']['package_name'].nil?
  if platform_family?("rhel", "fedora")
    php_fpm_package_name = "php-fpm"
  else
    php_fpm_package_name = "php5-fpm"
  end
else
  php_fpm_package_name = node['php-fpm']['package_name']
end

package php_fpm_package_name do
  action node['php-fpm']['installation_action']
  version node['php-fpm']['version'] if node['php-fpm']['version']
end

if node['php-fpm']['service_name'].nil?
  php_fpm_service_name = php_fpm_package_name
else
  php_fpm_service_name = node['php-fpm']['service_name']
end

service_provider = nil
if node['platform'] == 'ubuntu' and node['platform_version'].to_f >= 13.10
  service_provider = ::Chef::Provider::Service::Upstart
end

directory node['php-fpm']['log_dir']

service "php-fpm" do
  provider service_provider if service_provider
  service_name php_fpm_service_name
  supports :start => true, :stop => true, :restart => true, :reload => true
  action [ :enable, :start ]
end
