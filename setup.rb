#!/usr/bin/env ruby

# =============================================================================
# YWW WP + Vagrant dev kit setup script
# =============================================================================
# IMPORTANT: before running this script, rename setup-example.yml to setup.yml
# and modify it with project info. see README.md for more info
# =============================================================================

require 'yaml'
require 'fileutils'

# copy starter source folder: this will preserve changes if/when kit updated
FileUtils.cp_r 'dev/src-starter', 'dev/src'

# load setup settings
puts "[setup.rb] Reading settings..."
begin
	config = YAML.load_file('setup.yml')
rescue
	abort('[setup.rb] Could not load "setup.yml". Please create this file based on "setup-example.yml".')
end
# replace settings in package.json
package_file = 'dev/src/package.json'
project_data = File.read(package_file)
project_data = project_data.gsub(/{{projectSlug}}/, config['slug'])
project_data = project_data.gsub(/{{projectTitle}}/, config['title'])
project_data = project_data.gsub(/{{projectAuthor}}/, config['author'])
project_data = project_data.gsub(/{{projectHomepage}}/, config['homepage'])
File.open(package_file, "w") {|file| file.puts project_data }
# save project slug as environment variable to be read in WP
File.open('dev/src/includes/.env', "w") {|file| file.puts "PROJECT_SLUG=#{config['slug']}" }

# create "site.yml" file for Vagrant
config.reject! {|key| ['slug', 'title', 'author', 'homepage'].include?(key) }
File.open('site.yml', 'w') {|file| file.write config.to_yaml }

# install build dependencies (Gulp + extensions)
puts "[setup.rb] Installing build dependencies..."
system 'npm install'

# install initial front-end dependencies
puts "[setup.rb] Installing front-end dependencies..."
FileUtils.cd 'dev/src'
system 'npm install'
FileUtils.cd '../..'

# start vagrant
# puts "[setup.rb] Starting Vagrant VM..."
# system 'vagrant up'
#
# # run our gulp install task which will activate the theme in WordPress
# # we let Gulp do it because it needs to read slug from site.yml
# puts "[setup.rb] Activating theme in WordPress..."
# system 'gulp install'

# after which, the site will be ready to run and develop locally
# just run gulp
puts "[setup.rb] Setup complete. To run and develop locally just run 'gulp'."
