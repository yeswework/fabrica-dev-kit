#
# Cookbook Name:: xml
# Attributes:: default
#
# Copyright 2009-2015, Chef Software, Inc.
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

default['xml']['compiletime'] = false

case node['platform_family']
when 'rhel', 'fedora', 'suse'
  default['xml']['packages'] = %w(libxml2-devel libxslt-devel)
when 'debian'
  default['xml']['packages'] = %w(libxml2-dev libxslt-dev zlib1g-dev)
when 'freebsd', 'arch'
  default['xml']['packages'] = %w(libxml2 libxslt)
when 'mac_os_x'
  default['xml']['packages'] = %w(libxml2)
else
  default['xml']['packages'] = []
end

default['xml']['nokogiri']['use_system_libraries'] = false
default['xml']['nokogiri']['version'] = nil
