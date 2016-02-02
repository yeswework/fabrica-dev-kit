#
# Cookbook Name:: mariadb
# Recipe:: server
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

Chef::Recipe.send(:include, MariaDB::Helper)
case node['mariadb']['install']['type']
when 'package'
  if use_os_native_package?(node['mariadb']['install']['prefer_os_package'],
                            node['platform'], node['platform_version'])
    # currently, no releases with apt (e.g. ubuntu) ship mariadb
    # only provide one type of server here (with yum support)
    include_recipe "#{cookbook_name}::_redhat_server_native"
  else
    include_recipe "#{cookbook_name}::repository"

    case node['platform']
    when 'debian', 'ubuntu'
      include_recipe "#{cookbook_name}::_debian_server"
    when 'redhat', 'centos', 'fedora', 'scientific', 'amazon'
      include_recipe "#{cookbook_name}::_redhat_server"
    end
  end
when 'from_source'
  # To be filled as soon as possible
end

include_recipe "#{cookbook_name}::config"

service 'mysql' do
  service_name node['mariadb']['mysqld']['service_name']
  supports restart: true
  action :nothing
end

# move the datadir if needed
if node['mariadb']['mysqld']['datadir'] !=
   node['mariadb']['mysqld']['default_datadir']

  bash 'move-datadir' do
    user 'root'
    code <<-EOH
    /bin/cp -a #{node['mariadb']['mysqld']['default_datadir']}/* \
               #{node['mariadb']['mysqld']['datadir']} &&
    /bin/rm -r #{node['mariadb']['mysqld']['default_datadir']} &&
    /bin/ln -s #{node['mariadb']['mysqld']['datadir']} \
               #{node['mariadb']['mysqld']['default_datadir']}
    EOH
    action :nothing
  end

  directory node['mariadb']['mysqld']['datadir'] do
    owner 'mysql'
    group 'mysql'
    mode 00750
    action :create
    notifies :stop, 'service[mysql]', :immediately
    notifies :run, 'bash[move-datadir]', :immediately
    notifies :start, 'service[mysql]', :immediately
    only_if { !File.symlink?(node['mariadb']['mysqld']['default_datadir']) }
  end
end

# restart the service if needed
# workaround idea from https://github.com/stissot
Chef::Resource::Execute.send(:include, MariaDB::Helper)
execute 'mariadb-service-restart-needed' do
  command 'true'
  only_if do
    mariadb_service_restart_required?(
      node['mariadb']['mysqld']['bind_address'],
      node['mariadb']['mysqld']['port'],
      node['mariadb']['mysqld']['socket']
    )
  end
  notifies :restart, 'service[mysql]', :immediately
end

if node['mariadb']['allow_root_pass_change']
  # Used to change root password after first install
  # Still experimental
  if node['mariadb']['server_root_password'].empty?
    md5 = Digest::MD5.hexdigest('empty')
  else
    md5 = Digest::MD5.hexdigest(node['mariadb']['server_root_password'])
  end

  file '/etc/mysql_root_change' do
    content md5
    action :create
    notifies :run, 'execute[install-grants]', :immediately
  end
end

if  node['mariadb']['allow_root_pass_change'] ||
    node['mariadb']['forbid_remote_root']
  execute 'install-grants' do
    # Add sensitive true when foodcritic #233 fixed
    command '/bin/bash /etc/mariadb_grants \'' + \
      node['mariadb']['server_root_password'] + '\''
    only_if { File.exist?('/etc/mariadb_grants') }
    action :nothing
  end

  template '/etc/mariadb_grants' do
    sensitive true
    source 'mariadb_grants.erb'
    owner 'root'
    group 'root'
    mode '0600'
    notifies :run, 'execute[install-grants]', :immediately
  end
end

# MariaDB Plugins
include_recipe "#{cookbook_name}::plugins" if node['mariadb']['plugins_options']['auto_install']
