#
# Cookbook Name:: mariadb
# Provider:: configuration
#

use_inline_resources if defined?(use_inline_resources)

def whyrun_supported?
  true
end

action :add do
  variables_hash = {
    section: new_resource.section,
    options: new_resource.option
  }
  template node['mariadb']['configuration']['includedir'] + \
    '/' + new_resource.name + '.cnf' do
    source 'conf.d.generic.erb'
    owner 'root'
    group 'mysql'
    mode '0640'
    cookbook 'mariadb'
    variables variables_hash
  end
end

action :remove do
  if ::File.exist?(node['mariadb']['configuration']['includedir'] + \
                   '/' + new_resource.name + '.cnf')
    Chef::Log.info "Removing #{new_resource.name} repository from " + \
      node['mariadb']['configuration']['includedir']
    file node['mariadb']['configuration']['includedir'] + \
      '/' + new_resource.name + '.cnf' do
      action :delete
    end
  end
end
