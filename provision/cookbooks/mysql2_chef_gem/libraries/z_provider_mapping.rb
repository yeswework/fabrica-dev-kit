#########
# mysql2_chef_gem
#########
Chef::Platform.set platform: :amazon, resource: :mysql2_chef_gem, provider: Chef::Provider::Mysql2ChefGem::Mysql
Chef::Platform.set platform: :centos, version: '< 7.0', resource: :mysql2_chef_gem, provider: Chef::Provider::Mysql2ChefGem::Mysql
Chef::Platform.set platform: :centos, version: '>= 7.0', resource: :mysql2_chef_gem, provider: Chef::Provider::Mysql2ChefGem::Mysql
Chef::Platform.set platform: :debian, resource: :mysql2_chef_gem, provider: Chef::Provider::Mysql2ChefGem::Mysql
Chef::Platform.set platform: :fedora, version: '< 19', resource: :mysql2_chef_gem, provider: Chef::Provider::Mysql2ChefGem::Mysql
Chef::Platform.set platform: :fedora, version: '>= 19', resource: :mysql2_chef_gem, provider: Chef::Provider::Mysql2ChefGem::Mysql
Chef::Platform.set platform: :omnios, resource: :mysql2_chef_gem, provider: Chef::Provider::Mysql2ChefGem::Mysql
Chef::Platform.set platform: :redhat, version: '< 7.0', resource: :mysql2_chef_gem, provider: Chef::Provider::Mysql2ChefGem::Mysql
Chef::Platform.set platform: :redhat, version: '>= 7.0', resource: :mysql2_chef_gem, provider: Chef::Provider::Mysql2ChefGem::Mysql
Chef::Platform.set platform: :scientific, version: '< 7.0', resource: :mysql2_chef_gem, provider: Chef::Provider::Mysql2ChefGem::Mysql
Chef::Platform.set platform: :scientific, version: '>= 7.0', resource: :mysql2_chef_gem, provider: Chef::Provider::Mysql2ChefGem::Mysql
Chef::Platform.set platform: :smartos, resource: :mysql2_chef_gem, provider: Chef::Provider::Mysql2ChefGem::Mysql
Chef::Platform.set platform: :suse, resource: :mysql2_chef_gem, provider: Chef::Provider::Mysql2ChefGem::Mysql
Chef::Platform.set platform: :ubuntu, resource: :mysql2_chef_gem, provider: Chef::Provider::Mysql2ChefGem::Mysql
