Database Cookbook
=================
[![Build Status](https://travis-ci.org/opscode-cookbooks/database.svg?branch=master)](http://travis-ci.org/opscode-cookbooks/database)
[![Cookbook Version](https://img.shields.io/cookbook/v/database.svg)](https://supermarket.chef.io/cookbooks/database)

The main highlight of this cookbook is the `database` and
`database_user` resources for managing databases and database users in
a RDBMS. Providers for MySQL, PostgreSQL and SQL Server are also
provided, see usage documentation below.

Requirements
------------
### Platforms
- Debian / Ubuntu derivatives
- RHEL derivatives
- Fedora

### Chef
- Chef 11+

### Cookbooks
The following Chef Software cookbooks are dependencies:

* postgresql

Resources/Providers
-------------------
These resources aim to expose an abstraction layer for interacting
with different RDBMS in a general way. Currently the cookbook ships
with providers for MySQL, PostgreSQL and SQL Server. Please see
specific usage in the __Example__ sections below. The providers use
specific Ruby gems installed under Chef's Ruby environment to execute
commands and carry out actions. These gems will need to be installed
before the providers can operate correctly. Specific notes for each
RDBS flavor:

- MySQL: leverages the `mysql2` gem, which can be installed with the
  `mysql2_chef_gem` resource prior to use (available on the
  Supermarket). You must depend on the `mysql2_chef_gem` cookbook,
  then use a `mysql2_chef_gem` resource to install it. The resource
  allows the user to select MySQL client library versions, as well as
  optionally select MariaDB libraries.
      
- PostgreSQL: leverages the `pg` gem which is installed as part of the
  `postgresql::ruby` recipe. You must declare `include_recipe
  "database::postgresql"` to include this.

- SQL Server: leverages the `tiny_tds` gem which is installed as part
  of the `sql_server::client` recipe.

### database
Manage databases in a RDBMS. Use the proper shortcut resource
depending on your RDBMS: `mysql_database`, `postgresql_database` or
`sql_server_database`.

#### Actions
- :create: create a named database
- :drop: drop a named database
- :query: execute an arbitrary query against a named database

#### Attribute Parameters
- database_name: name attribute. Name of the database to interact with
- connection: hash of connection info. valid keys include `:host`,
  `:port`, `:username`, and `:password` (only for MySQL DB*)

- sql: string of sql or a block that executes to a string of sql,
  which will be executed against the database. used by `:query` action
  only

\* The database cookbook uses the `mysql2` gem.

> "The value of host may be either a host name or an IP address. If
  host is NULL or the string "127.0.0.1", a connection to the local
  host is assumed. For Windows, the client connects using a
  shared-memory connection, if the server has shared-memory
  connections enabled. Otherwise, TCP/IP is used. For a host value of
  "." on Windows, the client connects using a named pipe, if the
  server has named-pipe connections enabled. If named-pipe connections
  are not enabled, an error occurs."

If you specify a `:socket` key and are using the mysql_service
resource to set up the MySQL service, you'll need to specify the path
in the form `/var/run/mysql-<instance name>/mysqld.sock`.

#### Providers
- `Chef::Provider::Database::Mysql`: shortcut resource `mysql_database`
- `Chef::Provider::Database::Postgresql`: shortcut resource `postgresql_database`
- `Chef::Provider::Database::SqlServer`: shortcut resource `sql_server_database`

#### Examples
```ruby
# Create a mysql database
mysql_database 'wordpress-cust01' do
  connection(
    :host     => '127.0.0.1',
    :username => 'root',
    :password => node['wordpress-cust01']['mysql']['initial_root_password']
  )
  action :create
end
```
```ruby
# Create a mysql database on a named mysql instance
mysql_database 'oracle_rools' do
  connection(
    :host     => '127.0.0.1',
    :username => 'root',
    :socket   => "/var/run/mysql-#{instance-name}/mysqld.sock"
    :password => node['mysql']['server_root_password']
  )
  action :create
end       
```
```ruby
# Create a sql server database
sql_server_database 'mr_softie' do
  connection(
    :host     => '127.0.0.1',
    :port     => node['sql_server']['port'],
    :username => 'sa',
    :password => node['sql_server']['server_sa_password']
  )
  action :create
end
```

```ruby
# create a postgresql database
postgresql_database 'mr_softie' do
  connection(
    :host      => '127.0.0.1',
    :port      => 5432,
    :username  => 'postgres',
    :password  => node['postgresql']['password']['postgres']
  )
  action :create
end
```

```ruby
# create a postgresql database with additional parameters
postgresql_database 'mr_softie' do
  connection(
    :host     => '127.0.0.1',
    :port     => 5432,
    :username => 'postgres',
    :password => node['postgresql']['password']['postgres']
  )
  template 'DEFAULT'
  encoding 'DEFAULT'
  tablespace 'DEFAULT'
  connection_limit '-1'
  owner 'postgres'
  action :create
end
```

```ruby
# Externalize conection info in a ruby hash
mysql_connection_info = {
  :host     => '127.0.0.1',
  :username => 'root',
  :password => node['mysql']['server_root_password']
}

sql_server_connection_info = {
  :host     => '127.0.0.1',
  :port     => node['sql_server']['port'],
  :username => 'sa',
  :password => node['sql_server']['server_sa_password']
}

postgresql_connection_info = {
  :host     => '127.0.0.1',
  :port     => node['postgresql']['config']['port'],
  :username => 'postgres',
  :password => node['postgresql']['password']['postgres']
}

# Same create commands, connection info as an external hash
mysql_database 'foo' do
  connection mysql_connection_info
  action :create
end

sql_server_database 'foo' do
  connection sql_server_connection_info
  action     :create
end

postgresql_database 'foo' do
  connection postgresql_connection_info
  action     :create
end

# Create database, set provider in resource parameter
database 'bar' do
  connection mysql_connection_info
  provider   Chef::Provider::Database::Mysql
  action     :create
end

database 'bar' do
  connection sql_server_connection_info
  provider   Chef::Provider::Database::SqlServer
  action     :create
end

database 'bar' do
  connection postgresql_connection_info
  provider   Chef::Provider::Database::Postgresql
  action     :create
end



# Drop a database
mysql_database 'baz' do
  connection mysql_connection_info
  action    :drop
end



# Query a database
mysql_database 'flush the privileges' do
  connection mysql_connection_info
  sql        'flush privileges'
  action     :query
end


# Query a database from a sql script on disk
mysql_database 'run script' do
  connection mysql_connection_info
  sql { ::File.open('/path/to/sql_script.sql').read }
  action :query
end



# Vacuum a postgres database
postgresql_database 'vacuum databases' do
  connection      postgresql_connection_info
  database_name 'template1'
  sql 'VACUUM FULL VERBOSE ANALYZE'
  action :query
end
```

### database_user
Manage users and user privileges in a RDBMS. Use the proper shortcut resource depending on your RDBMS: `mysql_database_user`, `postgresql_database_user`, or `sql_server_database_user`.

#### Actions
- :create: create a user
- :drop: drop a user
- :grant: manipulate user privileges on database objects

#### Attribute Parameters
- username: name attribute. Name of the database user
- password: password for the user account
- database_name: Name of the database to interact with
- connection: hash of connection info. valid keys include :host,
  :port, :username, :password
- privileges: array of database privileges to grant user. used by the
  :grant action. default is :all
- host: host where user connections are allowed from. used by MySQL
  provider only. default is '127.0.0.1'
- table: table to grant privileges on. used by :grant action and MySQL
  provider only. default is '*' (all tables)
- require_ssl: true or false to force SSL connections to be used for user

### Providers

- **Chef::Provider::Database::MysqlUser**: shortcut resource
    `mysql_database_user`
- **Chef::Provider::Database::PostgresqlUser**: shortcut
    resource `postgresql_database_user`
- **Chef::Provider::Database::SqlServerUser**: shortcut resource
    `sql_server_database_user`

### Examples

    # create connection info as an external ruby hash
    mysql_connection_info = {:host => "127.0.0.1",
                             :username => 'root',
                             :password => node['mysql']['server_root_password']}
    postgresql_connection_info = {:host => "127.0.0.1",
                                  :port => node['postgresql']['config']['port'],
                                  :username => 'postgres',
                                  :password => node['postgresql']['password']['postgres']}
    sql_server_connection_info = {:host => "127.0.0.1",
                                  :port => node['sql_server']['port'],
                                  :username => 'sa',
                                  :password => node['sql_server']['server_sa_password']}

    # create a mysql user but grant no privileges
    mysql_database_user 'disenfranchised' do
      connection mysql_connection_info
      password 'super_secret'
      action :create
    end

    # do the same but pass the provider to the database resource
    database_user 'disenfranchised' do
      connection mysql_connection_info
      password 'super_secret'
      provider Chef::Provider::Database::MysqlUser
      action :create
    end

    # create a postgresql user but grant no privileges
    postgresql_database_user 'disenfranchised' do
      connection postgresql_connection_info
      password 'super_secret'
      action :create
    end

    # do the same but pass the provider to the database resource
    database_user 'disenfranchised' do
      connection postgresql_connection_info
      password 'super_secret'
      provider Chef::Provider::Database::PostgresqlUser
      action :create
    end

    # create a sql server user but grant no privileges
    sql_server_database_user 'disenfranchised' do
      connection sql_server_connection_info
      password 'super_secret'
      action :create
    end

    # drop a mysql user
    mysql_database_user "foo_user" do
      connection mysql_connection_info
      action :drop
    end

    # bulk drop sql server users
    %w{ disenfranchised foo_user }.each do |user|
      sql_server_database_user user do
        connection sql_server_connection_info
        action :drop
      end
    end

    # grant select,update,insert privileges to all tables in foo db from all hosts, requiring connections over SSL
    mysql_database_user 'foo_user' do
      connection mysql_connection_info
      password 'super_secret'
      database_name 'foo'
      host '%'
      privileges [:select,:update,:insert]
      require_ssl true
      action :grant
    end

    # grant all privileges on all databases/tables from 127.0.0.1
    mysql_database_user 'super_user' do
      connection mysql_connection_info
      password 'super_secret'
      action :grant
    end

    # grant all privileges on all tables in foo db
    postgresql_database_user 'foo_user' do
      connection postgresql_connection_info
      database_name 'foo'
      privileges [:all]
      action :grant
    end

    # grant select,update,insert privileges to all tables in foo db
    sql_server_database_user 'foo_user' do
      connection sql_server_connection_info
      password 'super_secret'
      database_name 'foo'
      privileges [:select,:update,:insert]
      action :grant
    end

#### Providers
- `Chef::Provider::Database::MysqlUser`: shortcut resource `mysql_database_user`
- `Chef::Provider::Database::PostgresqlUser`: shortcut resource `postgresql_database_user`
- `Chef::Provider::Database::SqlServerUser`: shortcut resource`sql_server_database_user`

#### Examples

```ruby
# create connection info as an external ruby hash
mysql_connection_info = {
  :host     => '127.0.0.1',
  :username => 'root',
  :password => node['mysql']['server_root_password']
}

postgresql_connection_info = {
  :host     => '127.0.0.1',
  :port     => node['postgresql']['config']['port'],
  :username => 'postgres',
  :password => node['postgresql']['password']['postgres']
}

sql_server_connection_info = {
  :host     => '127.0.0.1',
  :port     => node['sql_server']['port'],
  :username => 'sa',
  :password => node['sql_server']['server_sa_password']
}



# Create a mysql user but grant no privileges
mysql_database_user 'disenfranchised' do
  connection mysql_connection_info
  password   'super_secret'
  action     :create
end



# Do the same but pass the provider to the database resource
database_user 'disenfranchised' do
  connection mysql_connection_info
  password   'super_secret'
  provider   Chef::Provider::Database::MysqlUser
  action     :create
end



# Create a postgresql user but grant no privileges
postgresql_database_user 'disenfranchised' do
  connection postgresql_connection_info
  password   'super_secret'
  action     :create
end



# Do the same but pass the provider to the database resource
database_user 'disenfranchised' do
  connection postgresql_connection_info
  password   'super_secret'
  provider   Chef::Provider::Database::PostgresqlUser
  action     :create
end



# Create a sql server user but grant no privileges
sql_server_database_user 'disenfranchised' do
  connection sql_server_connection_info
  password   'super_secret'
  action     :create
end



# Drop a mysql user
mysql_database_user 'foo_user' do
  connection mysql_connection_info
  action     :drop
end



# Bulk drop sql server users
%w(disenfranchised foo_user).each do |user|
  sql_server_database_user user do
    connection sql_server_connection_info
    action     :drop
  end
end



# Grant SELECT, UPDATE, and INSERT privileges to all tables in foo db from all hosts
mysql_database_user 'foo_user' do
  connection    mysql_connection_info
  password      'super_secret'
  database_name 'foo'
  host          '%'
  privileges    [:select,:update,:insert]
  action        :grant
end



# Grant all privileges on all databases/tables from 127.0.0.1
mysql_database_user 'super_user' do
  connection mysql_connection_info
  password   'super_secret'
  action     :grant
end



# Grant all privileges on all tables in foo db
postgresql_database_user 'foo_user' do
  connection    postgresql_connection_info
  database_name 'foo'
  privileges    [:all]
  action        :grant
end

# grant select,update,insert privileges to all tables in foo db
sql_server_database_user 'foo_user' do
  connection    sql_server_connection_info
  password      'super_secret'
  database_name 'foo'
  privileges    [:select,:update,:insert]
  action        :grant
end
```


Recipes
-------
### ebs_volume
*Note*: This recipe does not currently work on RHEL platforms due to the xfs cookbook not supporting RHEL yet.

Loads the aws information from the data bag. Searches the applications data bag for the database master or slave role and checks that role is applied to the node. Loads the EBS information and the master information from data bags. Uses the aws cookbook LWRP, `aws_ebs_volume` to manage the volume.

On a master node:
- if we have an ebs volume already as stored in a data bag, attach it
- if we don't have the ebs information then create a new one and attach it
- store the volume information in a data bag via a ruby block

On a slave node:
- use the master volume information to generate a snapshot
- create the new volume from the snapshot and attach it

Also on a master node, generate some configuration for running a snapshot via `chef-solo` from cron.

On a new filesystem volume, create as XFS, then mount it in `/mnt`, and also bind-mount it to the mysql data directory (default `/var/lib/mysql`).

### master
This recipe no longer loads AWS specific information, and the database position for replication is no longer stored in a databag because the client might not have permission to write to the databag item. This may be handled in a different way at a future date.

Searches the apps databag for applications, and for each one it will check that the specified database master role is set in both the databag and applied to the node's run list. Then, retrieves the passwords for `root`, `repl` and `debian` users and saves them to the node attributes. If the passwords are not found in the databag, it prints a message that they'll be generated by the mysql cookbook.

Then it adds the application databag database settings to a hash, to use later.

Then it will iterate over the databases and create them with the `mysql_database` resource while adding privileges for application specific database users using the `mysql_database_user` resource.

### slave
_TODO_: Retrieve the master status from a data bag, then start replication using a ruby block. The replication status needs to be handled in some other way for now since the master recipe above doesn't actually set it in the databag anymore.

### snapshot
Run via Chef Solo. Retrieves the db snapshot configuration from the specified JSON file. Uses the `mysql_database` resource to lock and unlock tables, and does a filesystem freeze and EBS snapshot.


Deprecated Recipes
------------------
The following recipe is considered deprecated. It is kept for reference purposes.

### ebs_backup
Older style of doing mysql snapshot and replication using Adam Jacob's [ec2_mysql](http://github.com/adamhjk/ec2_mysql) script and library.


Data Bags
---------
This cookbook uses the apps data bag item for the specified application; see the `application` cookbook's README.md. It also creates data bag items in a bag named 'aws' for storing volume information. In order to interact with EC2, it expects aws to have a main item:

```javascript
{
  "id": "main",
  "ec2_private_key": "private key as a string",
  "ec2_cert": "certificate as a string",
  "aws_account_id": "",
  "aws_secret_access_key": "",
  "aws_access_key_id": ""
}
```

Note: with the Open Source Chef Server, the server using the database recipes must be an admin client or it will not be able to create data bag items. You can modify whether the client is admin by editing it with knife.

    knife client edit <client_name>
    {
      ...
      "admin": true
      ...
    }

This is not required if the Chef Server is Chef Software Hosted Chef, instead use the ACL feature to modify access for the node to be able to update the data bag.


Usage
-----
Aside from the application data bag (see the README in the application cookbook), create a role for the database master. Use a `role.rb` in your chef-repo, or create the role directly with knife.

```javascript
{
  "name": "my_app_database_master",
  "chef_type": "role",
  "json_class": "Chef::Role",
  "default_attributes": {},
  "description": "",
  "run_list": [
    "recipe[mysql::server]",
    "recipe[database::master]"
  ],
  "override_attributes": {}
}
```

Create a `production` environment. This is also used in the `application` cookbook.

```javascript
{
  "name": "production",
  "description": "",
  "cookbook_versions": {},
  "json_class": "Chef::Environment",
  "chef_type": "environment",
  "default_attributes": {},
  "override_attributes": {}
}
```

The cookbook `my_app_database` is recommended to set up any
application specific database resources such as configuration
templates, trending monitors, etc. It is not required, but you would
need to create it separately in `site-cookbooks`. Add it to the
`my_app_database_master` role.

License & Authors
-----------------
- Author:: Adam Jacob (<adam@chef.io>)
- Author:: Joshua Timberman (<joshua@chef.io>)
- Author:: AJ Christensen (<aj@chef.io>)
- Author:: Seth Chisamore (<schisamo@chef.io>)
- Author:: Lamont Granquist (<lamont@chef.io>)
- Author:: Sean OMeara (<sean@chef.io>)

```text
Copyright 2009-2015, Chef Software, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
