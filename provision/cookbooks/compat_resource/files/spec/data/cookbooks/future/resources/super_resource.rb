include FutureCookbook::SuperProperties

action :create do
  file ::File.expand_path('~/y.txt') do
    content "#{x}#{y}"
  end
end
