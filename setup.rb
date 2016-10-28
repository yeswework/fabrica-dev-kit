#!/usr/bin/env ruby

# =============================================================================
# Fabrica setup script
# =============================================================================
# IMPORTANT: before running this script, rename setup-example.yml to setup.yml
# and modify it with project info. see README.md for more info
# =============================================================================

require 'erb'
require 'fileutils'
require 'yaml'
require 'ostruct'

# check Fabrica dependencies
dependencies = ['npm', 'gulp', 'vagrant', 'composer']
for dependency in dependencies
	if not system("hash #{dependency} 2>/dev/null")
		abort "[Fabrica] Could not find dependency '#{dependency}'."
	end
end

# load setup settings
puts '[Fabrica] Reading settings...'
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
	settings.merge_settings!(File.join(ENV['HOME'], '.fabrica/settings.yml'))
	setup_settings = settings.merge_settings!(File.join(File.dirname(__FILE__), 'setup.yml'))
	setup_settings['host_document_root'] = if setup_settings.has_key?('host_document_root') then setup_settings['host_document_root'] else settings['host_document_root'] end
rescue
	abort '[Fabrica] Could not load "setup.yml". Please create this file based on "setup-example.yml".'
end

# copy starter dev folder: this will preserve changes if/when kit updated
if not Dir.exists? 'dev'
	FileUtils.cp_r 'dev-starter', 'dev'
end

# set configuration data in source and Wordmove files
settingsostruct = OpenStruct.new(settings)
templateFilenames = [
	'src/package.json',
	'src/includes/.env',
	'src/includes/composer.json',
	'src/includes/project.php',
	'src/templates/views/base.twig',
	'Movefile.erb'
]
for templateFilename in templateFilenames
	destFilename = srcFilename = "dev/#{templateFilename}"
	srcFilename = "#{destFilename}.erb" if not destFilename.end_with? '.erb'
	if File.exists? srcFilename
		template = File.read srcFilename
		file_data = ERB.new(template, nil, ">").result(settingsostruct.instance_eval { binding })
		File.open(destFilename, 'w') {|file| file.puts file_data }
		FileUtils.rm srcFilename
	else
		abort "[Fabrica] could not find #{srcFilename} template."
	end
end

# rename/backup "setup.yml"
FileUtils.mv 'setup.yml', 'setup.bak.yml'
# create "vagrant.yml" file for Vagrant
setup_settings.reject! {|key| ['slug', 'author', 'homepage'].include?(key) }
File.open('vagrant.yml', 'w') {|file| file.write setup_settings.to_yaml }

# install build dependencies (Gulp + extensions)
FileUtils.cd 'dev'
puts '[Fabrica] Installing build dependencies...'
system 'npm install'

# install initial front-end dependencies
puts '[Fabrica] Installing front-end dependencies...'
FileUtils.cd 'src'
system 'npm install'
FileUtils.cd 'includes'
system 'composer install'
FileUtils.cd '../../..'

# start vagrant
puts '[Fabrica] Starting Vagrant VM...'
if not system 'vagrant up'
	abort '[Fabrica] Vagrant VM provisioning failed.'
end

# run our gulp build task and activate the theme in WordPress
puts '[Fabrica] Building theme and activating in WordPress...'
FileUtils.cd 'dev'
system 'gulp build'
# create symlink to theme folder in dev for quick access
FileUtils.ln_s "#{settings['host_document_root']}/wp-content/themes/#{settings['slug']}/", 'build'
system "vagrant ssh -c \"wp theme activate '#{settings['slug']}'\""

# after which, the site will be ready to run and develop locally
# just run gulp
puts '[Fabrica] Setup complete. To run and develop locally just run \'gulp\'.'
