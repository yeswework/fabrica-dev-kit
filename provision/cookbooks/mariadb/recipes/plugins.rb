node['mariadb']['plugins'].each do |plugin, enable|
  include_recipe "#{cookbook_name}::_" + plugin + '_plugin' if enable
end
