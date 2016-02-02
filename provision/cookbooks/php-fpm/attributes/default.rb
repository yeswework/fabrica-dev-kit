case node["platform_family"]
when "rhel", "fedora"
  user = "apache"
  group = "apache"
  conf_dir = "/etc/php.d"
  pool_conf_dir = "/etc/php-fpm.d"
  conf_file = "/etc/php-fpm.conf"
  error_log = "/var/log/php-fpm/error.log"
  pid = "/var/run/php-fpm/php-fpm.pid"
else
  user = "www-data"
  group = "www-data"
  conf_dir = "/etc/php5/fpm/conf.d"
  pool_conf_dir = "/etc/php5/fpm/pool.d"
  if node.platform == "ubuntu" and node.platform_version.to_f <= 10.04
    conf_file = "/etc/php5/fpm/php5-fpm.conf"
  else
    conf_file = "/etc/php5/fpm/php-fpm.conf"
  end
  error_log = "/var/log/php5-fpm.log"
  pid ="/var/run/php5-fpm.pid"
end

default['php-fpm']['user'] = user
default['php-fpm']['group'] = group
default['php-fpm']['conf_dir'] = conf_dir
default['php-fpm']['pool_conf_dir'] = pool_conf_dir
default['php-fpm']['conf_file'] = conf_file
default['php-fpm']['pid'] = pid
default['php-fpm']['log_dir'] = '/var/log/php-fpm'
default['php-fpm']['error_log'] =  error_log
default['php-fpm']['log_level'] = "notice"
default['php-fpm']['emergency_restart_threshold'] = 0
default['php-fpm']['emergency_restart_interval'] = 0
default['php-fpm']['process_control_timeout'] = 0
default['php-fpm']['pools'] = {
  "www" => {
    :enable => true
  }
}

default['php-fpm']['skip_repository_install'] = false
default['php-fpm']['installation_action'] = :install
default['php-fpm']['version'] = nil

case node["platform_family"]
when "rhel"
  default['php-fpm']['yum_url'] = "http://rpms.famillecollet.com/enterprise/$releasever/remi/$basearch/"
  default['php-fpm']['yum_mirrorlist'] = "http://rpms.famillecollet.com/enterprise/$releasever/remi/mirror"
when "fedora"
  default['php-fpm']['skip_repository_install'] = true
end

default['php-fpm']['dotdeb_repository']['uri'] = "http://packages.dotdeb.org"
default['php-fpm']['dotdeb_repository']['key'] = "http://www.dotdeb.org/dotdeb.gpg"
default['php-fpm']['dotdeb-php53_repository']['uri'] = "http://php53.dotdeb.org"
