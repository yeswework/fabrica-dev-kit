class Chef
  class Provider
    class Mysql2ChefGem
      class Mariadb < Chef::Provider::LWRPBase
        use_inline_resources if defined?(use_inline_resources)

        def whyrun_supported?
          true
        end

        action :install do
          recipe_eval do
            run_context.include_recipe 'build-essential::default'
          end

          # As a recipe: must rely on global node attributes
          recipe_eval do
            run_context.include_recipe 'mariadb::client'
          end

          gem_package 'mysql2' do
            gem_binary RbConfig::CONFIG['bindir'] + '/gem'
            version new_resource.gem_version
            action :install
          end
        end

        action :remove do
          gem_package 'mysql2' do
            gem_binary RbConfig::CONFIG['bindir'] + '/gem'
            action :remove
          end
        end
      end
    end
  end
end
