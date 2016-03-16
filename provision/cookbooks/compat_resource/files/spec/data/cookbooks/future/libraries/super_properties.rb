module FutureCookbook
  module SuperProperties
    include ChefCompat::Mixin::Properties

    property :x, default: 10
    property :y, default: 20
  end
end
