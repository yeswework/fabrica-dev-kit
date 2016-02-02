name 'database'
maintainer 'Chef Software, Inc.'
maintainer_email 'cookbooks@chef.io'
license 'Apache 2.0'
description 'provides LWRPs for common database tasks'
version '4.0.9'

supports 'debian'
supports 'ubuntu'
supports 'centos'
supports 'suse'
supports 'fedora'
supports 'redhat'
supports 'scientific'
supports 'oracle'
supports 'amazon'

depends 'postgresql', '>= 1.0.0'

source_url 'https://github.com/opscode-cookbooks/database' if respond_to?(:source_url)
issues_url 'https://github.com/opscode-cookbooks/database/issues' if respond_to?(:issues_url)
