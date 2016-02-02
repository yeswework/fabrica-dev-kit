# Cookbook Name:: bluepill
# Attributes:: default
#
# Copyright 2010-2015, Chef Software, Inc.
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

default['bluepill']['bin'] = "#{node['languages']['ruby']['bin_dir']}/bluepill"
default['bluepill']['logfile'] = '/var/log/bluepill.log'
default['bluepill']['pid_dir'] = '/var/run/bluepill'
default['bluepill']['state_dir'] = '/var/lib/bluepill'
default['bluepill']['group'] = 0
default['bluepill']['use_rsyslog'] = false

case node['platform_family']
when 'arch'
  default['bluepill']['init_dir'] = '/etc/rc.d'
  default['bluepill']['conf_dir'] = '/etc/bluepill'
  default['bluepill']['defaults_dir'] = '/etc/default'
when 'freebsd'
  default['bluepill']['init_dir'] = '/usr/local/etc/rc.d'
  default['bluepill']['conf_dir'] = '/usr/local/etc/bluepill'
  default['bluepill']['defaults_dir'] = '/etc/defaults'
else
  default['bluepill']['init_dir'] = '/etc/init.d'
  default['bluepill']['conf_dir'] = '/etc/bluepill'
end

case node['platform_family']
when 'fedora', 'rhel'
  default['bluepill']['defaults_dir'] = '/etc/sysconfig'
when 'debian'
  default['bluepill']['defaults_dir'] = '/etc/default'
end
