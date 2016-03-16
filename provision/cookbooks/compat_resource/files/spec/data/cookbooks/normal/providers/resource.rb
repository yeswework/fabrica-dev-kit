action :create do
  converge_by "update!" do
  end
  # next is how people generally exit from actions in traditional providers
  next
end
