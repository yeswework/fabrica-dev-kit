# Make sure and emit a property that triggers deprecation
property :n, name_property: true, default: 5
property :x, String, coerce: proc { |x| x.to_s }, default: lazy { y*y }
property :y, Integer, default: 4

class ::Globals
  @@exists = true
  def self.exists
    @@exists
  end
  def self.exists=(value)
    @@exists = value
  end

  @@global_x = 'initial_x'
  def self.global_x
    @@global_x
  end
  def self.global_x=(value)
    @@global_x = value
  end

  @@global_y = 2
  def self.global_y
    @@global_y
  end
  def self.global_y=(value)
    @@global_y = value
  end
end

load_current_value do
  current_value_does_not_exist! if !Globals.exists

  x Globals.global_x
  y Globals.global_y
end

action :create do
  converge_if_changed do
    Globals.exists = true
    Globals.global_x = x
    Globals.global_y = y
  end
  file ::File.expand_path('~/x.txt') do
    content 'hi'
  end
  # return is how people exit from 12.5 actions. Test that it works across versions.
  return
end

action :delete do
  Globals.exists = false
end
