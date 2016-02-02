#
# Cookbook Name:: mariadb
# Provider:: replication
#

use_inline_resources if defined?(use_inline_resources)

def whyrun_supported?
  true
end

def get_mysql_command(host, port, user, password)
  mysql_command = '/usr/bin/mysql'
  mysql_command += ' -h ' + host unless host.nil?
  mysql_command += ' -P ' + port unless port.nil?
  mysql_command += ' -u ' + user unless user.nil?
  mysql_command += ' -p' + password unless password.nil?
  mysql_command
end

action :add do
  if new_resource.master_host.nil? || new_resource.master_user.nil? ||
     new_resource.master_password.nil?
    fail '[ERROR] When adding a slave, you have to define master_host' \
         ' master_user and master_password !'
  end
  sql_string = 'CHANGE MASTER '
  sql_string += '\'' + new_resource.name + \
                '\' ' if new_resource.name != 'default'
  sql_string += 'TO '
  sql_string += 'MASTER_HOST=\'' + new_resource.master_host + '\', '
  sql_string += 'MASTER_PORT=' + new_resource.master_port.to_s + \
                ', ' unless new_resource.master_port.nil?
  sql_string += 'MASTER_USER=\'' + new_resource.master_user + '\', '
  sql_string += 'MASTER_PASSWORD=\'' + new_resource.master_password + '\''
  if new_resource.master_use_gtid == 'no'
    # Use non GTID replication setup
    if new_resource.master_log_file.nil? || new_resource.master_log_pos.nil?
      fail '[ERROR] When adding a slave without GTID, you have to' \
           'define master_log_file and master_log_pos !'
    end
    unless new_resource.master_log_file.nil?
      sql_string += ', MASTER_LOG_FILE=\'' + \
                    new_resource.master_log_file + '\''
      sql_string += ', MASTER_LOG_POS=' + new_resource.master_log_pos.to_s
    end
  else
    # Use GTID replication
    sql_string += ', MASTER_USE_GTID=' + new_resource.master_use_gtid + ';'
  end
  execute 'add_replication_from_master_' + new_resource.name do
    # Add sensitive true when foodcritic #233 fixed
    command '/bin/echo "' + sql_string + '" | ' + get_mysql_command(
      new_resource.host,
      new_resource.port,
      new_resource.user,
      new_resource.password
    )
    action :run
  end
end

action :remove do
  execute 'remove_replication_from_master_' + new_resource.name do
    # Add sensitive true when foodcritic #233 fixed
    command '/bin/echo "STOP SLAVE \'' + new_resource.name + '\'; ' \
      'RESET SLAVE \'' + new_resource.name + '\' ALL' \
      ';" | ' + get_mysql_command(
        new_resource.host,
        new_resource.port,
        new_resource.user,
        new_resource.password
      )
  end
end

action :start do
  command_master_connection = ' \'' + new_resource.name + \
                              '\'' unless new_resource.name == 'default'
  execute 'start_replication_from_master_' + new_resource.name do
    # Add sensitive true when foodcritic #233 fixed
    command '/bin/echo "START SLAVE' + command_master_connection + ';' \
      '" | ' + get_mysql_command(
        new_resource.host,
        new_resource.port,
        new_resource.user,
        new_resource.password
      )
  end
end

action :stop do
  command_master_connection = ' \'' + new_resource.name + \
                              '\'' unless new_resource.name == 'default'
  execute 'start_replication_from_master_' + new_resource.name do
    # Add sensitive true when foodcritic #233 fixed
    command '/bin/echo "STOP SLAVE' + command_master_connection + ';' \
      '" | ' + get_mysql_command(
        new_resource.host,
        new_resource.port,
        new_resource.user,
        new_resource.password
      )
  end
end
