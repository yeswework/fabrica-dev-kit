#
# Author:: Seth Chisamore (<schisamo@chef.io>)
# Author:: Sean OMeara (<sean@chef.io>)
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

class Chef
  class Provider
    class Database
      class Mysql < Chef::Provider::LWRPBase
        use_inline_resources if defined?(use_inline_resources)

        def whyrun_supported?
          true
        end

        action :create do
          # test
          schema_present = nil

          begin
            test_sql = 'SHOW SCHEMAS;'
            Chef::Log.debug("#{new_resource.name}: Performing query [#{test_sql}]")
            test_sql_results = test_client.query(test_sql)
            test_sql_results.each do |r|
              schema_present = true if r['Database'] == new_resource.database_name
            end
          ensure
            close_test_client
          end

          # repair
          unless schema_present
            converge_by "Creating schema '#{new_resource.database_name}'" do
              begin
                repair_sql = "CREATE SCHEMA IF NOT EXISTS `#{new_resource.database_name}`"
                repair_sql += " CHARACTER SET = #{new_resource.encoding}" if new_resource.encoding
                repair_sql += " COLLATE = #{new_resource.collation}" if new_resource.collation
                Chef::Log.debug("#{new_resource.name}: Performing query [#{repair_sql}]")
                repair_client.query(repair_sql)
              ensure
                close_repair_client
              end
            end
          end
        end

        action :drop do
          # test
          schema_present = nil

          begin
            test_sql = 'SHOW SCHEMAS;'
            Chef::Log.debug("Performing query [#{test_sql}]")
            test_sql_results = test_client.query(test_sql)
            test_sql_results.each do |r|
              schema_present = true if r['Database'] == new_resource.database_name
            end
          ensure
            close_test_client
          end

          # repair
          if schema_present
            converge_by "Dropping schema '#{new_resource.database_name}'" do
              begin
                repair_sql = "DROP SCHEMA IF EXISTS `#{new_resource.database_name}`"
                Chef::Log.debug("Performing query [#{repair_sql}]")
                repair_client.query(repair_sql)
              ensure
                close_repair_client
              end
            end
          end
        end

        action :query do
          begin
            query_sql = new_resource.sql_query
            Chef::Log.debug("Performing query [#{query_sql}]")
            query_client.query(query_sql)
          ensure
            close_query_client
          end
        end

        private

        def test_client
          require 'mysql2'
          @test_client ||=
            Mysql2::Client.new(
              host: new_resource.connection[:host],
              socket: new_resource.connection[:socket],
              username: new_resource.connection[:username],
              password: new_resource.connection[:password],
              port: new_resource.connection[:port]
            )
        end

        def close_test_client
          @test_client.close if @test_client
        rescue Mysql2::Error
          @test_client = nil
        end

        def repair_client
          require 'mysql2'
          @repair_client ||=
            Mysql2::Client.new(
              host: new_resource.connection[:host],
              socket: new_resource.connection[:socket],
              username: new_resource.connection[:username],
              password: new_resource.connection[:password],
              port: new_resource.connection[:port]
            )
        end

        def close_repair_client
          @repair_client.close if @repair_client
        rescue Mysql2::Error
          @repair_client = nil
        end

        def query_client
          require 'mysql2'
          @query_client ||=
            Mysql2::Client.new(
              host: new_resource.connection[:host],
              socket: new_resource.connection[:socket],
              username: new_resource.connection[:username],
              password: new_resource.connection[:password],
              port: new_resource.connection[:port],
              flags: new_resource.connection[:flags],
              database: new_resource.database_name
            )
        end

        def close_query_client
          @query_client.close
        rescue Mysql2::Error
          @query_client = nil
        end
      end
    end
  end
end
