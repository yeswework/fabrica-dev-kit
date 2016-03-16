# If the gem is already activated rather than the cookbook, then we fail if our version is DIFFERENT.
# The user said they wanted this cookbook version, they need to have this cookbook version.
# NOTE: if the gem is installed but on a different version, we simply don't care: the cookbook version wins.
#       If another gem depends on a different version being there, rubygems will correctly throw the error.
if defined?(ChefCompat)
  version_rb = IO.read(File.expand_path("../../files/lib/compat_resource/version.rb", __FILE__))
  raise "Version file not in correct format" unless version_rb =~ /VERSION\s*=\s*'([^']+)'/
  cookbook_version = $1

  if CompatResource::VERSION != cookbook_version
    raise "compat_resource gem version #{CompatResource::VERSION} was loaded as a gem before compat_resource cookbook version #{cookbook_version} was loaded. To remedy this, either update the cookbook to the gem version, update the gem to the cookbook version, or uninstall / stop loading the gem so early."
  end
else
  # The gem is not already activated, so activate the cookbook.
  require_relative '../files/lib/compat_resource/gemspec'
  CompatResource::GEMSPEC.activate
end

require 'compat_resource'
