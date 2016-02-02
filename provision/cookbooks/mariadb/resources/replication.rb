#
# Cookbook Name:: mariadb
# Resource:: replication
#

actions :add, :remove, :start, :stop
default_action :add

# name of the extra conf file, used for .cnf filename
attribute :connection_name, kind_of: String, name_attribute: true
attribute :host, kind_of: [String, NilClass], default: nil
attribute :port, kind_of: [String, NilClass], default: nil
attribute :user, kind_of: [String, NilClass], default: nil
attribute :password, kind_of: [String, NilClass], default: nil
attribute :master_host, kind_of: [String, NilClass], default: nil
attribute :master_user, kind_of: [String, NilClass], default: nil
attribute :master_password, kind_of: [String, NilClass], default: nil
attribute :master_connect_retry, kind_of: [String, NilClass], default: nil
attribute :master_port, kind_of: [Integer, NilClass], default: nil
attribute :master_log_pos, kind_of: [Integer, NilClass], default: nil
attribute :master_log_file, kind_of: [String, NilClass], default: nil
attribute :master_use_gtid, kind_of: String, default: 'no'
