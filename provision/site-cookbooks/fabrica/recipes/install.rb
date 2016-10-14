# encoding: utf-8
# vim: ft=ruby expandtab shiftwidth=2 tabstop=2

require 'shellwords'

service 'iptables' do
  supports :status => true, :restart => true
  action [:disable, :stop]
end

# PHP modules
package ['php5-mysql', 'php5-gd', 'php5-xdebug'] do
  action :install
end

execute 'regenerate-locales' do
  command 'dpkg-reconfigure locales'
end

wp_site_path = File.join(node[:fabrica][:wp_docroot], node[:fabrica][:wp_siteurl])
wp_site_url = File.join(node[:fabrica][:wp_host], node[:fabrica][:wp_siteurl])
# create site folder structure
directory File.join("/vagrant/dev", node[:fabrica][:wp_host_docroot], node[:fabrica][:wp_home]) do
  recursive true
  owner node[:fabrica][:user]
  group node[:fabrica][:group]
end

# create symlink to WordPress folder
link node[:fabrica][:wp_docroot] do
  to File.join("/vagrant/dev", node[:fabrica][:wp_host_docroot])
  link_type :symbolic
  owner "root"
  group "root"
  mode "0755"
end

# download WordPress
if node[:fabrica][:wp_version] =~ %r{^http(s)?://.*?\.zip$}
  code <<-EOH
    cd /tmp && wget -O ./download.zip #{Shellwords.shellescape(node[:fabrica][:wp_version])} && unzip -d /var/www/ ./download.zip && rm ./download.zip
  EOH
elsif node[:fabrica][:wp_version] == 'latest' then
  wp_cli_command 'core download' do
    user node[:fabrica][:user]
    cwd wp_site_path
    args(
      :locale   => node[:fabrica][:locale],
      :force    => '',
      'skip-plugins'  => node[:fabrica][:skip_wp_default_plugins] ? 'akismet' : '',
      'skip-themes'   => node[:fabrica][:skip_wp_default_themes] ? 'twentyfourteen,twentyfifteen,twentysixteen' : ''
    )
  end
else
  wp_cli_command 'core download' do
    user node[:fabrica][:user]
    cwd wp_site_path
    args(
      :locale   => node[:fabrica][:locale],
      :version  => node[:fabrica][:wp_version].to_s,
      :force    => '',
      'skip-plugins'  => node[:fabrica][:skip_wp_default_plugins] ? 'akismet' : '',
      'skip-themes'   => node[:fabrica][:skip_wp_default_themes] ? 'twentyfourteen,twentyfifteen,twentysixteen' : ''
    )
  end
end

# WordPress config
file File.join(wp_site_path, "wp-config.php") do
  action :delete
  backup false
end

wp_cli_command 'core config' do
  user node[:fabrica][:user]
  cwd wp_site_path
  args(
    :dbhost     => node[:fabrica][:dbhost],
    :dbname     => node[:fabrica][:dbname],
    :dbuser     => node[:fabrica][:dbuser],
    :dbpass     => node[:fabrica][:dbpassword],
    :dbprefix   => node[:fabrica][:dbprefix],
    :locale     => node[:fabrica][:locale],
    'extra-php' => "define('WP_HOME', 'http://#{File.join(node[:fabrica][:wp_host], node[:fabrica][:wp_home]).sub(/\/$/, '')}');\n"\
      "define('WP_SITEURL', 'http://#{wp_site_url.sub(/\/$/, '')}');\n"\
      "define('JETPACK_DEV_DEBUG', #{node[:fabrica][:debug_mode]});\n"\
      "define('WP_DEBUG', #{node[:fabrica][:debug_mode]});\n"\
      "define('FORCE_SSL_ADMIN', #{node[:fabrica][:force_ssl_admin]});\n"\
      "define('SAVEQUERIES', #{node[:fabrica][:savequeries]});"
  )
end

if node[:fabrica][:always_reset] == true then
  # reset DB
  wp_cli_command 'db reset' do
    user node[:fabrica][:user]
    cwd wp_site_path
    args(
      :yes    => ''
    )
  end
end

# WordPress install
wp_cli_command 'core install' do
  user node[:fabrica][:user]
  cwd wp_site_path
  args(
    :url            => "http://#{wp_site_url}",
    :title          => node[:fabrica][:title],
    :admin_user     => node[:fabrica][:admin_user],
    :admin_password => node[:fabrica][:admin_password],
    :admin_email    => node[:fabrica][:admin_email],
    'skip-plugins'  => node[:fabrica][:skip_wp_default_plugins] ? 'akismet' : '',
    'skip-themes'   => node[:fabrica][:skip_wp_default_themes] ? 'twentyfourteen,twentyfifteen,twentysixteen' : ''
  )
end

# default index page
unless node[:fabrica][:wp_home] == node[:fabrica][:wp_siteurl]
  wp_site_home_index = File.join(node[:fabrica][:wp_docroot], node[:fabrica][:wp_home], 'index.php')
  unless File.exist?(wp_site_home_index)
    template wp_site_home_index do
      source "index.php.erb"
      owner node[:fabrica][:user]
      group node[:fabrica][:group]
      mode "0644"
      variables(
        :path => wp_site_path
      )
    end
  end
end

# install wp-multibyte-patch plugin if required by locale
if node[:fabrica][:locale] == 'ja' then
  wp_cli_command 'plugin activate wp-multibyte-patch' do
    user node[:fabrica][:user]
    cwd wp_site_path
  end
end

# install plugins
node[:fabrica][:default_plugins].each do |plugin|
  wp_cli_command "plugin install #{Shellwords.shellescape(plugin)}" do
    user node[:fabrica][:user]
    cwd wp_site_path
    args(
      :activate => ''
    )
  end
end

# install theme
if node[:fabrica][:default_theme] != '' then
  wp_cli_command "theme install #{Shellwords.shellescape(node[:fabrica][:default_theme])}" do
    user node[:fabrica][:user]
    cwd wp_site_path
    args(
      :activate => ''
    )
  end
end

# theme unit testing
if node[:fabrica][:theme_unit_test] == true then
  remote_file node[:fabrica][:theme_unit_test_data] do
    source node[:fabrica][:theme_unit_test_data_url]
    mode 0644
    action :create
  end

  wp_cli_command 'plugin install wordpress-importer' do
    user node[:fabrica][:user]
    cwd wp_site_path
    args(
      :activate => ''
    )
  end

  wp_cli_command "import #{Shellwords.shellescape(node[:fabrica][:theme_unit_test_data])}" do
    user node[:fabrica][:user]
    cwd wp_site_path
    args(
      :authors => 'create'
    )
  end
end

# set options
node[:fabrica][:options].each do |key, value|
  wp_cli_command "option update #{Shellwords.shellescape(key.to_s)} #{Shellwords.shellescape(value.to_s)}" do
    user node[:fabrica][:user]
    cwd wp_site_path
  end
end

# rewrite structure
if node[:fabrica][:rewrite_structure] then
  wp_cli_command "rewrite structure #{Shellwords.shellescape(node[:fabrica][:rewrite_structure])}" do
    user node[:fabrica][:user]
    cwd wp_site_path
  end

  wp_cli_command 'rewrite flush' do
    user node[:fabrica][:user]
    cwd wp_site_path
    args(
      :hard  => ''
    )
  end
end

# multisite configuration
if node[:fabrica][:is_multisite] == true then
  wp_cli_command 'core multisite-convert' do
    user node[:fabrica][:user]
    cwd wp_site_path
  end
end

# Nginx configuration
directory File.join(node[:nginx][:dir], 'global') do
    recursive true
    user "root"
    group "root"
end

template File.join(node[:nginx][:dir], 'global/wordpress.conf') do
  source "nginx.global.erb"
  owner "root"
  group "root"
  mode "0644"
  variables(
    :docroot    => wp_site_path,
    :multisite  => node[:fabrica][:is_multisite],
  )
end

template File.join(node[:nginx][:dir], 'sites-available/default') do
  source "nginx.erb"
  owner "root"
  group "root"
  mode "0644"
  variables(
    :multisite  => node[:fabrica][:is_multisite],
    :host       => node[:fabrica][:wp_host],
    :use_ssl    => node[:fabrica][:use_ssl],
  )
end

# create SSL keys
if node[:fabrica][:use_ssl] == true then
  nginx_ssl_path = File.join(node[:nginx][:dir], 'ssl')
  directory nginx_ssl_path do
      recursive true
      user "root"
      group "root"
  end

  bash "create-ssl-keys" do
    user "root"
    group "root"
    cwd nginx_ssl_path
    code <<-EOH
      openssl genrsa -out server.key 2048
      openssl req -new -key server.key -sha256 -subj '/C=JP/ST=Wakayama/L=Kushimoto/O=My Corporate/CN=#{node[:fqdn]}' -out server.csr
      openssl x509 -in server.csr -days 365 -req -signkey server.key > server.crt
      openssl dhparam -out /etc/nginx/ssl/dhparam.pem 2048
    EOH
    notifies :restart, "service[nginx]"
  end
end

template File.join(node[:fabrica][:wp_docroot], ".editorconfig") do
  source "editorconfig.erb"
  owner node[:fabrica][:user]
  group node[:fabrica][:group]
  mode "0644"
  action :create_if_missing
end
