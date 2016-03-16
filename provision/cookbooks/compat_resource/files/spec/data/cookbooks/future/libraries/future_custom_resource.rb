class FutureCustomResource < ChefCompat::Resource
  resource_name :future_custom_resource
  property :x
  action :create do
    converge_if_changed do
    end
    future_custom_resource 'hi' do
      x x # test that a warning is emitted properly (and no crashey)
      action :nothing
    end
  end
end
