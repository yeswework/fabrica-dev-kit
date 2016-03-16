declare_resource(:ruby_block, 'y', caller[0], create_if_missing: true) do
  block { puts 'hi' }
end
