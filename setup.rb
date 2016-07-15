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
if not Dir.exists? 'dev/src'
	FileUtils.cp_r 'dev/src-starter', 'dev/src'
end

# load setup settings
puts '[setup.rb] Reading settings...'
begin
	# load default, user and project/site settings, in that order
	settings = YAML.load_file(File.join(File.dirname(__FILE__), 'provision/default.yml'))
	def settings.merge_settings!(settings_filename)
		if File.exists?(settings_filename)
			new_settings = YAML.load_file(settings_filename)
			self.merge!(new_settings) if new_settings.is_a?(Hash)
			return new_settings
		end
	end
	settings.merge_settings!(File.join(ENV['HOME'], '.devkit/settings.yml'))
	setup_settings = settings.merge_settings!(File.join(File.dirname(__FILE__), 'setup.yml'))
	setup_settings['host_document_root'] = if setup_settings.has_key?('host_document_root') then setup_settings['host_document_root'] else settings['host_document_root'] end
rescue
	abort '[setup.rb] Could not load "setup.yml". Please create this file based on "setup-example.yml".'
end

# set configuration data in package.json, YWWProject.php and Wordmove files
settingsostruct = OpenStruct.new(settings)
def renderSourceFile(filename, settingsostruct, keeptemplate = nil)
	if File.exists?("#{filename}.erb")
		template = File.read "#{filename}.erb"
		file_data = ERB.new(template).result(settingsostruct.instance_eval { binding })
		File.open(filename, 'w') {|file| file.puts file_data }
		FileUtils.rm "#{filename}.erb" unless keeptemplate
	elsif not File.exists?("#{filename}")
		abort "[setup.rb] could not find #{filename}.erb template or #{filename}."
	end
end
renderSourceFile('dev/src/package.json', settingsostruct)
renderSourceFile('dev/src/includes/project.php', settingsostruct)
renderSourceFile('Movefile', settingsostruct, true)

# rename/backup "setup.yml"
FileUtils.mv 'setup.yml', 'setup.bak.yml'
# create "vagrant.yml" file for Vagrant
setup_settings.reject! {|key| ['slug', 'title', 'author', 'homepage'].include?(key) }
File.open('vagrant.yml', 'w') {|file| file.write setup_settings.to_yaml }

# install build dependencies (Gulp + extensions)
puts '[setup.rb] Installing build dependencies...'
system 'npm install'

# install initial front-end dependencies
puts '[setup.rb] Installing front-end dependencies...'
FileUtils.cd 'dev/src'
system 'npm install'
system 'composer install'
FileUtils.cd '../..'

# start vagrant
puts '[setup.rb] Starting Vagrant VM...'
if not system 'vagrant up'
	abort '[setup.rb] Vagrant VM provisioning failed.'
end

# run our gulp build task and activate the theme in WordPress
puts '[setup.rb] Building theme and activating in WordPress...'
system 'gulp build'
# create symlink to theme folder in dev for quick access
FileUtils.ln_s "../#{settings['host_document_root']}/wp-content/themes/#{settings['slug']}/", 'dev/build'
system "vagrant ssh -c \"wp theme activate '#{settings['slug']}'\""

# after which, the site will be ready to run and develop locally
# just run gulp
puts '[setup.rb] Setup complete. To run and develop locally just run \'gulp\'.'
