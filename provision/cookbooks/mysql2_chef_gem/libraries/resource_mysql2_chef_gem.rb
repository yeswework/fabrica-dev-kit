require 'chef/resource/lwrp_base'

class Chef
  class Resource
    class Mysql2ChefGem < Chef::Resource::LWRPBase
      self.resource_name = :mysql2_chef_gem
      actions :install, :remove
      default_action :install

      attribute :mysql2_chef_gem_name, kind_of: String, name_attribute: true, required: true
      attribute :gem_version, kind_of: String, default: '0.3.17'
      attribute :client_version, kind_of: String, default: nil
    end
  end
end
