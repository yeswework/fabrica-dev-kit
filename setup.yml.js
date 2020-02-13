module.exports = (data) => `
# Fabrica Dev Kit setup configuration
# Modify for your project, then run \`fdk setup\` from this folder

# Project settings
slug: ${data.slug || 'fdk-project'} # lowercase letters only (also used for theme slug and PHP namespacing)
title: ${data.title || 'FDK Project'}

# WordPress settings
wp:
  admin: # development site admin user credentials
    user: ${data.wp_admin_user || 'fabrica'}
    pass: ${data.wp_admin_pass || 'fabrica'}
    email: ${data.wp_admin_email || 'admin@fdk.dev'}
  version: latest
  lang: en_US # dev site WP locale/language
  rewrite_structure: /%postname%/ # dev site permalink structure (can be changed later)
  multisite: ${data.multisite || false}
  # uninstall WP CLI default plugins & themes
  skip_default_plugins: true
  skip_default_themes: true # uninstall WP CLI default themes
  # acf_pro_key: # optional (if set will preinstall Advanced Custom Fields Pro)
  plugins: # optional (installs plugins at setup - use URL slugs from WP plugins directory)
  - fabrica-dashboard
  # - advanced-custom-fields
  # - force-regenerate-thumbnails

# Database settings
db:
  prefix: wp_

package_manager: 'npm' # Node package manager to use: either 'npm' or 'yarn'
`;
