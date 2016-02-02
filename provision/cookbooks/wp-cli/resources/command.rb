actions :execute
default_action :execute

attribute :args, :kind_of => Hash, :default => {}
attribute :command, :kind_of => String, :name_attribute => true
attribute :cwd, :kind_of => String, :default => nil
attribute :stdin, :kind_of => String, :default => nil
attribute :user, :kind_of => String, :default => nil
attribute :sensitive, :kind_of => [TrueClass, FalseClass], :default => false

def initialize(*args)
  super
  @run_context.include_recipe 'wp-cli'
end
