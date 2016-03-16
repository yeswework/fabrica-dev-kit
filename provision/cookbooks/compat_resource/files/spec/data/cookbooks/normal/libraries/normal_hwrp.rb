class Chef::Resource::NormalHwrp < Chef::Resource
  def initialize(*args)
    super
    @resource_name = :normal_hwrp
    @allowed_actions = [ :create ]
    @action = :create
  end

  provides :normal_hwrp

  def x(arg=nil)
    set_or_return(:x, arg, {})
  end

end

class Chef::Provider::NormalHwrp < Chef::Resource
  provides :normal_hwrp
  def load_current_resource
  end
  def action_create
    new_resource.updated_by_last_resource(true)
  end
end
