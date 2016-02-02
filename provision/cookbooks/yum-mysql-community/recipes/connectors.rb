#
# Author:: Sean OMeara (<sean@chef.io>)
# Recipe:: yum-mysql-community::connectors
#
# Copyright 2014-2015, Chef Software, Inc.
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

yum_repository 'mysql-connectors-community' do
  description node['yum']['mysql-connectors-community']['description'] unless node['yum']['mysql-connectors-community']['description'].nil?
  baseurl node['yum']['mysql-connectors-community']['baseurl'] unless  node['yum']['mysql-connectors-community']['baseurl'].nil?
  mirrorlist node['yum']['mysql-connectors-community']['mirrorlist'] unless node['yum']['mysql-connectors-community']['mirrorlist'].nil?
  gpgcheck node['yum']['mysql-connectors-community']['gpgcheck'] unless node['yum']['mysql-connectors-community']['gpgcheck'].nil?
  gpgkey node['yum']['mysql-connectors-community']['gpgkey'] unless node['yum']['mysql-connectors-community']['gpgkey'].nil?
  enabled node['yum']['mysql-connectors-community']['enabled'] unless node['yum']['mysql-connectors-community']['enabled'].nil?
  cost node['yum']['mysql-connectors-community']['cost'] unless node['yum']['mysql-connectors-community']['cost'].nil?
  exclude node['yum']['mysql-connectors-community']['exclude'] unless node['yum']['mysql-connectors-community']['exclude'].nil?
  enablegroups node['yum']['mysql-connectors-community']['enablegroups'] unless node['yum']['mysql-connectors-community']['enablegroups'].nil?
  failovermethod node['yum']['mysql-connectors-community']['failovermethod'] unless node['yum']['mysql-connectors-community']['failovermethod'].nil?
  http_caching node['yum']['mysql-connectors-community']['http_caching'] unless node['yum']['mysql-connectors-community']['http_caching'].nil?
  include_config node['yum']['mysql-connectors-community']['include_config'] unless node['yum']['mysql-connectors-community']['include_config'].nil?
  includepkgs node['yum']['mysql-connectors-community']['includepkgs'] unless node['yum']['mysql-connectors-community']['includepkgs'].nil?
  keepalive node['yum']['mysql-connectors-community']['keepalive'] unless node['yum']['mysql-connectors-community']['keepalive'].nil?
  max_retries node['yum']['mysql-connectors-community']['max_retries'] unless node['yum']['mysql-connectors-community']['max_retries'].nil?
  metadata_expire node['yum']['mysql-connectors-community']['metadata_expire'] unless node['yum']['mysql-connectors-community']['metadata_expire'].nil?
  mirror_expire node['yum']['mysql-connectors-community']['mirror_expire'] unless node['yum']['mysql-connectors-community']['mirror_expire'].nil?
  priority node['yum']['mysql-connectors-community']['priority'] unless node['yum']['mysql-connectors-community']['priority'].nil?
  proxy node['yum']['mysql-connectors-community']['proxy'] unless node['yum']['mysql-connectors-community']['proxy'].nil?
  proxy_username node['yum']['mysql-connectors-community']['proxy_username'] unless  node['yum']['mysql-connectors-community']['proxy_username'].nil?
  proxy_password node['yum']['mysql-connectors-community']['proxy_password'] unless  node['yum']['mysql-connectors-community']['proxy_password'].nil?
  repositoryid node['yum']['mysql-connectors-community']['repositoryid'] unless node['yum']['mysql-connectors-community']['repositoryid'].nil?
  sslcacert node['yum']['mysql-connectors-community']['sslcacert'] unless node['yum']['mysql-connectors-community']['sslcacert'].nil?
  sslclientcert node['yum']['mysql-connectors-community']['sslclientcert'] unless node['yum']['mysql-connectors-community']['sslclientcert'].nil?
  sslclientkey node['yum']['mysql-connectors-community']['sslclientkey'] unless node['yum']['mysql-connectors-community']['sslclientkey'].nil?
  sslverify node['yum']['mysql-connectors-community']['sslverify'] unless node['yum']['mysql-connectors-community']['sslverify'].nil?
  timeout node['yum']['mysql-connectors-community']['timeout'] unless node['yum']['mysql-connectors-community']['timeout'].nil?
  action :create
end
