#
# Author:: Sean OMeara (<sean@chef.io>)
# Recipe:: yum-mysql-community::mysql55
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

yum_repository 'mysql55-community' do
  description node['yum']['mysql55-community']['description'] unless node['yum']['mysql55-community']['description'].nil?
  baseurl node['yum']['mysql55-community']['baseurl'] unless node['yum']['mysql55-community']['baseurl'].nil?
  mirrorlist node['yum']['mysql55-community']['mirrorlist'] unless node['yum']['mysql55-community']['mirrorlist'].nil?
  gpgcheck node['yum']['mysql55-community']['gpgcheck'] unless node['yum']['mysql55-community']['gpgcheck'].nil?
  gpgkey node['yum']['mysql55-community']['gpgkey'] unless node['yum']['mysql55-community']['gpgkey'].nil?
  enabled node['yum']['mysql55-community']['enabled'] unless node['yum']['mysql55-community']['enabled'].nil?
  cost node['yum']['mysql55-community']['cost'] unless node['yum']['mysql55-community']['cost'].nil?
  exclude node['yum']['mysql55-community']['exclude'] unless node['yum']['mysql55-community']['exclude'].nil?
  enablegroups node['yum']['mysql55-community']['enablegroups'] unless node['yum']['mysql55-community']['enablegroups'].nil?
  failovermethod node['yum']['mysql55-community']['failovermethod'] unless node['yum']['mysql55-community']['failovermethod'].nil?
  http_caching node['yum']['mysql55-community']['http_caching'] unless node['yum']['mysql55-community']['http_caching'].nil?
  include_config node['yum']['mysql55-community']['include_config'] unless node['yum']['mysql55-community']['include_config'].nil?
  includepkgs node['yum']['mysql55-community']['includepkgs'] unless node['yum']['mysql55-community']['includepkgs'].nil?
  keepalive node['yum']['mysql55-community']['keepalive'] unless node['yum']['mysql55-community']['keepalive'].nil?
  max_retries node['yum']['mysql55-community']['max_retries'] unless node['yum']['mysql55-community']['max_retries'].nil?
  metadata_expire node['yum']['mysql55-community']['metadata_expire'] unless node['yum']['mysql55-community']['metadata_expire'].nil?
  mirror_expire node['yum']['mysql55-community']['mirror_expire'] unless node['yum']['mysql55-community']['mirror_expire'].nil?
  priority node['yum']['mysql55-community']['priority'] unless node['yum']['mysql55-community']['priority'].nil?
  proxy node['yum']['mysql55-community']['proxy'] unless node['yum']['mysql55-community']['proxy'].nil?
  proxy_username node['yum']['mysql55-community']['proxy_username'] unless node['yum']['mysql55-community']['proxy_username'].nil?
  proxy_password node['yum']['mysql55-community']['proxy_password'] unless node['yum']['mysql55-community']['proxy_password'].nil?
  repositoryid node['yum']['mysql55-community']['repositoryid'] unless node['yum']['mysql55-community']['repositoryid'].nil?
  sslcacert node['yum']['mysql55-community']['sslcacert'] unless node['yum']['mysql55-community']['sslcacert'].nil?
  sslclientcert node['yum']['mysql55-community']['sslclientcert'] unless node['yum']['mysql55-community']['sslclientcert'].nil?
  sslclientkey node['yum']['mysql55-community']['sslclientkey'] unless node['yum']['mysql55-community']['sslclientkey'].nil?
  sslverify node['yum']['mysql55-community']['sslverify'] unless node['yum']['mysql55-community']['sslverify'].nil?
  timeout node['yum']['mysql55-community']['timeout'] unless node['yum']['mysql55-community']['timeout'].nil?
  action :create
end
