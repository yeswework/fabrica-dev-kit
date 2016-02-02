#
# Author:: Seth Chisamore (<schisamo@chef.io>)
# Author:: Lamont Granquist (<lamont@chef.io>)
# Author:: Marco Betti (<m.betti@gmail.com>)
# Copyright:: Copyright (c) 2011 Chef Software, Inc.
# License:: Apache License, Version 2.0
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

require File.join(File.dirname(__FILE__), 'resource_database_user')
require File.join(File.dirname(__FILE__), 'provider_database_postgresql_user')

class Chef
  class Resource
    class PostgresqlDatabaseUser < Chef::Resource::DatabaseUser
      def initialize(name, run_context = nil)
        super
        @resource_name = :postgresql_database_user
        @provider = Chef::Provider::Database::PostgresqlUser
        @createdb = false
        @createrole = false
        @login = true
        @replication = false
        @superuser = false
        @schema_name = nil
        @allowed_actions.push(:create, :drop, :grant, :grant_schema)
      end

      def createdb(arg = nil)
        set_or_return(
          :createdb,
          arg,
          equal_to: [true, false]
        )
      end

      def createrole(arg = nil)
        set_or_return(
          :createrole,
          arg,
          equal_to: [true, false]
        )
      end

      def login(arg = nil)
        set_or_return(
          :login,
          arg,
          equal_to: [true, false]
        )
      end

      def replication(arg = nil)
        set_or_return(
          :replication,
          arg,
          equal_to: [true, false]
        )
      end

      def schema_name(arg = nil)
        set_or_return(
          :schema_name,
          arg,
          kind_of: String
        )
      end

      def superuser(arg = nil)
        set_or_return(
          :superuser,
          arg,
          equal_to: [true, false]
        )
      end
    end
  end
end
