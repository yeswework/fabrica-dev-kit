# XML Cookbook
[![Build Status](https://travis-ci.org/chef-cookbooks/xml.svg?branch=master)](http://travis-ci.org/chef-cookbooks/xml) [![Cookbook Version](http://img.shields.io/cookbook/v/xml.svg)](https://supermarket.chef.io/cookbooks/xml)

Installs development package for libxml.

## Requirements
### Platforms
- Debian/Ubuntu
- RHEL/CentOS/Scientific/Amazon/Oracle
- Arch Linux
- Suse
- FreeBSD

### Chef
- Chef 11+

### Cookbooks
- build-essential
- chef-sugar

## Attributes
- `node['xml']['packages']` - Array of package names that should be installed
- `node['xml']['nokogiri']['use_system_libraries']` - Whether to use system libraries for nokogiri (defaults to `false`)

## Recipes
### default
Installs the development packages for libxml2 and libxslt.

For installing the packages during compile time:

```ruby
node.set['xml']['compiletime'] = true
include_recipe 'xml::default'
```

### ruby
Installs the nokogiri gem into Chef's Ruby environment so it can be used in recipes. If nokogiri is being installed using the system's libxml package your distro must include version 2.6.21 or later.  Due to this Debian 7 or earlier / Ubuntu 12.04 or earlier will not work with the system library attribute enabled.

## License & Authors
**Author:** Cookbook Engineering Team ([cookbooks@chef.io](mailto:cookbooks@chef.io))

**Copyright:** 2009-2015, Chef Software, Inc.

```
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
