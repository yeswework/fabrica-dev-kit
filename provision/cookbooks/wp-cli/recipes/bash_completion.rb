#
# Cookbook Name:: wp-cli
# Recipe:: bash_completion
#

remote_file '/etc/bash_completion.d/wp-cli' do
  source 'https://github.com/wp-cli/wp-cli/raw/master/utils/wp-completion.bash'
  mode 0644
  action :create_if_missing
end
