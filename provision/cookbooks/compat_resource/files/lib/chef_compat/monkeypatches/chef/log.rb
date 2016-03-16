require 'chef/log'

module ChefCompat
  module Monkeypatches
    module Log
      def caller_location
        # Pick the first caller that is *not* part of the Chef gem, that's the
        # thing the user wrote.
        @compat_resource_filter_paths ||=
          Gem.loaded_specs['chef'].require_paths.map { |p| File.join(Gem.loaded_specs['chef'].full_gem_path, p) } +
          Gem.loaded_specs['compat_resource'].require_paths.map { |p| File.join(Gem.loaded_specs['compat_resource'].full_gem_path, p) }

        caller.select { |c| !@compat_resource_filter_paths.any? { |path| c.start_with?(path) } }.first
      end
    end
  end
end

class<<::Chef::Log
  prepend ChefCompat::Monkeypatches::Log
end
