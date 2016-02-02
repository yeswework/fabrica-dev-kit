#
# Cookbook Name:: mariadb
# Recipe:: _redhat_galera
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

# To force removing of mariadb-libs on CentOS >= 7
package 'MariaDB-shared' do
  action :install
end

package 'MariaDB-Galera-server' do
  action :install
  notifies :create, 'directory[/var/log/mysql]', :immediately
  notifies :start, 'service[mysql]', :immediately
  notifies :run, 'execute[change first install root password]', :immediately
end

directory '/var/log/mysql' do
  action :nothing
  user 'mysql'
  group 'mysql'
  mode '0755'
end

service 'mysql' do
  action :nothing
end

execute 'change first install root password' do
  # Add sensitive true when foodcritic #233 fixed
  command '/usr/bin/mysqladmin -u root password \'' + \
    node['mariadb']['server_root_password'] + '\''
  action :nothing
  not_if { node['mariadb']['server_root_password'].empty? }
end
