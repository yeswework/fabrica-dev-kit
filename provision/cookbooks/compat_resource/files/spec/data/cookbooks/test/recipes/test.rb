future_resource 'sets neither x nor y' do
end

future_resource 'sets both x and y' do
  x 'hi'
  y 10
end

future_resource 'sets neither x nor y explicitly' do
  x 'hi'
  y 10
end

future_resource 'sets only y' do
  y 20
end

future_resource 'deletes resource' do
  action :delete
end

future_resource 'sets x and y via creation' do
  x 'hi'
  y 20
end

future_resource 'deletes resource again' do
  action :delete
end

future_resource 'sets x and y to their defaults via creation' do
end

future_super_resource 'brings in its defaults' do
end
future_super_resource 'lets you set x and y' do
  x 100
  y 200
end

ChefCompat::CopiedFromChef::Chef.log_deprecation "hi there"
