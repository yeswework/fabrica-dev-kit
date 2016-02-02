#
# Cookbook Name:: mariadb
# Recipe:: _debian_galera
#
# Copyright 2014, blablacar.com
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

# To be sure that debconf is installed
package 'debconf-utils' do
  action :install
end

# Preseed Debian Package
# (but test for resource, as it can be declared by apt recipe)
begin
  resources(directory: '/var/cache/local/preseeding')
rescue Chef::Exceptions::ResourceNotFound
  directory '/var/cache/local/preseeding' do
    owner 'root'
    group 'root'
    mode '0755'
    recursive true
  end
end

template '/var/cache/local/preseeding/mariadb-galera-server.seed' do
  source 'mariadb-server.seed.erb'
  owner 'root'
  group 'root'
  mode '0600'
  variables(package_name: 'mariadb-galera-server')
  notifies :run, 'execute[preseed mariadb-galera-server]', :immediately
end

execute 'preseed mariadb-galera-server' do
  command '/usr/bin/debconf-set-selections ' \
          '/var/cache/local/preseeding/mariadb-galera-server.seed'
  action :nothing
end

package "mariadb-galera-server-#{node['mariadb']['install']['version']}" do
  action :install
end
