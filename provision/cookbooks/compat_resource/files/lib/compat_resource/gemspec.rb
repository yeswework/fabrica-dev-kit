if defined?(CompatResource::GEMSPEC)
  raise "Already loaded ChefCompat from #{CompatResource::GEMSPEC.require_path}/compat_resource/gemspec.rb. Cannot load a second time from #{__FILE__}"
end

require_relative 'version'

module CompatResource
  GEMSPEC = Gem::Specification.new do |s|
    # Gem path is cookbook root
    s.full_gem_path = File.expand_path('../../../..', __FILE__)
    s.name = "compat_resource"
    s.version = CompatResource::VERSION
    s.platform = Gem::Platform::RUBY
    s.summary = 'Bring some new features of Chef 12.5 to previous 12.X releases'
    s.description = s.summary
    s.author = 'John Keiser'
    s.email = 'john@johnkeiser.com'
    s.homepage = 'http://chef.io'
    s.license = 'Apache 2.0'

    s.add_development_dependency 'rake'
    s.add_development_dependency 'rspec'
    s.add_development_dependency 'cheffish'
    s.add_development_dependency 'stove'
    s.add_development_dependency 'chef'

    s.bindir       = "files/bin"
    s.executables  = []
    s.require_path = "files/lib"
    s.files = %w(LICENSE README.md CHANGELOG.md Gemfile Rakefile) +
              Dir.glob("files/{lib,spec}/**/*", File::FNM_DOTMATCH).reject {|f| File.directory?(f) }
  end
end
