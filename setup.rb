#!/usr/bin/env ruby

# =============================================================================
# YWW WP + Vagrant dev kit setup script
# =============================================================================
# IMPORTANT: before running this script, rename setup-example.yml to setup.yml
# and modify it with project info. see README.md for more info
# =============================================================================

require 'erb'
require 'fileutils'
require 'yaml'
require 'ostruct'

# copy starter source folder: this will preserve changes if/when kit updated
FileUtils.cp_r 'dev/src-starter', 'dev/src'

# load setup settings
puts "[setup.rb] Reading settings..."
begin
	config = YAML.load_file 'setup.yml'
rescue
	abort('[setup.rb] Could not load "setup.yml". Please create this file based on "setup-example.yml".')
end

# set configuration data in package.json, YWWProject.php and Wordmove files
configostruct = OpenStruct.new(config)
def renderSourceFile(filename, configostruct)
	template = File.read "#{filename}.erb"
	file_data = ERB.new(template).result(configostruct.instance_eval { binding })
	File.open(filename, "w") {|file| file.puts file_data }
	FileUtils.rm "#{filename}.erb"
end
renderSourceFile('dev/src/package.json', configostruct)
renderSourceFile('dev/src/includes/YWWProject.php', configostruct)
renderSourceFile('Movefile.erb', configostruct)

# rename/backup "setup.yml"
FileUtils.mv 'setup.yml', 'setup.bak.yml'
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
puts "[setup.rb] Starting Vagrant VM..."
system 'vagrant up'

# run our gulp install task which will activate the theme in WordPress
# we let Gulp do it because it needs to read slug from site.yml
puts "[setup.rb] Activating theme in WordPress..."
system 'gulp install'

# after which, the site will be ready to run and develop locally
# just run gulp
puts "[setup.rb] Setup complete. To run and develop locally just run 'gulp'."
