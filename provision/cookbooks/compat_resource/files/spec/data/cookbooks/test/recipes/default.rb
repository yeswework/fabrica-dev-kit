normal_resource 'blah' do
  x 'hi'
end
# normal_hwrp 'blah2' do
#   x 'hi2'
# end
future_resource 'blah3' do
  x 'hi3'
end
future_custom_resource 'blah4' do
  x 'hi4'
end
include_recipe 'future::declare_resource'
