# encoding: utf-8
# -*- mode: ruby -*-
# vi: set ft=ruby :

require 'yaml'

Vagrant.require_version '>= 1.5'

Vagrant.configure("2") do |config|

  # load default, user and project/site settings, in that order
  settings = YAML.load_file(File.join(File.dirname(__FILE__), 'provision/default.yml'))
  def settings.merge_settings!(settings_filename)
    if File.exists?(settings_filename)
      new_settings = YAML.load_file(settings_filename)
      self.merge!(new_settings) if new_settings.is_a?(Hash)
    end
  end
  settings.merge_settings!(File.join(ENV["HOME"], '.devkit/config.yml'))
  settings.merge_settings!(File.join(File.dirname(__FILE__), 'vagrant.yml'))

  # get Chef cookbook path
  if File.exists?(settings['chef_cookbook_path'])
    chef_cookbooks_path = settings['chef_cookbook_path']
  elsif File.exists?(File.join(File.dirname(__FILE__), settings['chef_cookbook_path']))
    chef_cookbooks_path = File.join(File.dirname(__FILE__), settings['chef_cookbook_path'])
  else
    puts "Can't find #{settings['chef_cookbook_path']}. Please check chef_cookbooks_path in the config."
    exit 1
  end

  # setup VM
  config.vm.define settings['hostname']

  config.vm.box = ENV['wp_box'] || settings['wp_box']
  config.ssh.forward_agent = true

  config.vm.box_check_update = true

  config.vm.hostname = settings['hostname']
  config.vm.network :private_network, ip: settings['ip']

  config.vm.synced_folder ".", "/vagrant", :mount_options => ['dmode=755', 'fmode=755']
  config.vm.synced_folder settings['sync_folder'], settings['document_root'], :create => 'true', :mount_options => ['dmode=755', 'fmode=755']

  if Vagrant.has_plugin?('vagrant-hostsupdater')
    if Vagrant::VERSION =~ /^1.8/
      # `vagrant resume` on v.1.8 runs provioning again so `vagrant up` has to be used instead and it doesn't set the host again so it's best not to remomve it on suspend
      config.hostsupdater.remove_on_suspend = false
    else
      config.hostsupdater.remove_on_suspend = true
    end
  end

  if Vagrant.has_plugin?('vagrant-vbguest')
    config.vbguest.auto_update = true
  end

  config.vm.provider :virtualbox do |vb|
    vb.linked_clone = settings['linked_clone'] if Vagrant::VERSION =~ /^1.8/
    vb.name = settings['hostname']
    vb.memory = settings['memory'].to_i
    vb.cpus = settings['cpus'].to_i
    if 1 < settings['cpus'].to_i
      vb.customize ['modifyvm', :id, '--ioapic', 'on']
    end
    vb.customize ['modifyvm', :id, '--natdnsproxy1', 'on']
    vb.customize ['modifyvm', :id, '--natdnshostresolver1', 'on']
  end

  # run pre-provision script if available
  pre_provision_script = File.join(File.dirname(__FILE__), 'provision-pre.sh')
  if File.exists?(pre_provision_script) then
    config.vm.provision :shell, :path => pre_provision_script
  end

  # run Chef cookbooks
  config.vm.provision :chef_solo do |chef|
    chef.cookbooks_path = [
      File.join(chef_cookbooks_path, 'cookbooks'),
      File.join(chef_cookbooks_path, 'site-cookbooks')
    ]
    # disable unnecessary Ohai plugins
    chef.custom_config_path = File.join(chef_cookbooks_path, 'chefclient.rb')

    chef.json = {
      :nginx => {
        :user                     => settings['user'],
        :group                    => settings['group'],
        :default_root             => settings['document_root'],
        :worker_processes         => settings['cpus'],
        :init_style               => 'runit',
        :client_max_body_size     => '13m'
      },
      :mysql => {
        :bind_address             => '0.0.0.0',
        :server_root_password     => 'wordpress',
        :server_repl_password     => 'wordpress',
        :server_debian_password   => 'wordpress'
      },
      :php => {
        :directives => {
          'default_charset'            => 'UTF-8',
          'mbstring.language'          => 'neutral',
          'mbstring.internal_encoding' => 'UTF-8',
          'date.timezone'              => 'UTC',
          'short_open_tag'             => 'Off',
          'session.save_path'          => '/tmp'
        }
      },
      'php-fpm' => {
        :user                     => settings['user'],
        :group                    => settings['group']
      },
      :devkit => {
        :user                     => settings['user'],
        :group                    => settings['group'],
        :wp_version               => ENV['wp_version'] || settings['version'],
        :wp_host                  => settings['hostname'],
        :wp_home                  => settings['home'],
        :wp_siteurl               => settings['siteurl'],
        :wp_docroot               => settings['document_root'],
        :locale                   => ENV['wp_lang'] || settings['lang'],
        :admin_user               => settings['admin_user'],
        :admin_password           => settings['admin_pass'],
        :admin_email              => settings['admin_email'],
        :default_plugins          => settings['plugins'],
        :default_theme            => settings['theme'],
        :title                    => settings['title'],
        :is_multisite             => settings['multisite'],
        :use_ssl                  => settings['use_ssl'],
        :force_ssl_admin          => settings['force_ssl_admin'],
        :debug_mode               => settings['wp_debug'],
        :savequeries              => settings['savequeries'],
        :theme_unit_test          => settings['theme_unit_test'],
        :theme_unit_test_data_url => settings['theme_unit_test_uri'],
        :always_reset             => settings['reset_db_on_provision'],
        :dbhost                   => settings['db_host'],
        :dbprefix                 => settings['db_prefix'],
        :options                  => settings['options'],
        :rewrite_structure        => settings['rewrite_structure']
      }
    }

    chef.add_recipe 'php-fpm'
    chef.add_recipe 'php'
    chef.add_recipe 'nginx'
    chef.add_recipe 'wp-cli'

    chef.add_recipe 'devkit'
    chef.add_recipe 'devkit::install'
  end

  # run post-provision script if available
  post_provision_script = File.join(File.dirname(__FILE__), 'provision-post.sh')
  if File.exists?(post_provision_script) then
    config.vm.provision :shell, :path => post_provision_script
  end
end
