source 'https://supermarket.chef.io'

metadata

group :integration do
  cookbook 'apt'
  cookbook 'selinux'
  cookbook 'mysql2_chef_gem'
end

cookbook 'mysql_database_test', path: 'test/fixtures/cookbooks/mysql_database_test'
cookbook 'postgresql_database_test', path: 'test/fixtures/cookbooks/postgresql_database_test'
