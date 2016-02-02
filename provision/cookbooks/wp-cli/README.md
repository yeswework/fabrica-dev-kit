wp-cli Chef Cookbook
===============
Installs [WP-CLI](http://wp-cli.org/).


Attributes
----------
<table>
  <tr>
    <th>Key</th>
    <th>Type</th>
    <th>Description</th>
    <th>Default</th>
  </tr>
  <tr>
    <td><tt>['wp-cli']['dir']</tt></td>
    <td>String</td>
    <td>The installation dir</td>
    <td><tt>/usr/local/share/wp-cli</tt></td>
  </tr>
  <tr>
    <td><tt>['wp-cli']['link']</tt></td>
    <td>String</td>
    <td>The binary link</td>
    <td><tt>/usr/local/bin/wp</tt></td>
  </tr>
</table>

Usage
-----
Just include `wp-cli` in your node's `run_list`:

```json
{
  "name":"my_node",
  "run_list": [
    "recipe[wp-cli]"
  ]
}
```

Resources / Providers
---------------------

This cookbook includes an LWRP for execute `wp-cli` commands

### `wp_cli_command`

Execute WP-CLI with the desired command and arguments.

### Parameters:

* `command` - WP-CLI command.
* `args` - Hash with the command arguments
* `stdin` - Free text to the standard input (see `wp core config --extra-php`)
* `cwd` - WordPress installation path.
* `user` - Execute WP-CLI with under the desired user privileges.

### Examples:

Execute `wp core is-installed` over the WordPress installation directory.

```
    wp_cli_command 'core is-installed' do
      args(
        'path' => '/path/to/wordpress/',
        'allow-root' => ''
      )
    end
```

or

```
    wp_cli_command 'core is-installed' do
      args(
        'allow-root' => ''
      )
      cwd '/path/to/wordpress/'
    end
```

Contributing
------------
1. Fork the repository on Github
2. Create a named feature branch (like `add_component_x`)
3. Write your change
4. Test your change
5. Submit a Pull Request using Github

Author(s)
---------
Rubem Nakamura

License
-------
[MIT LICENSE](http://opensource.org/licenses/MIT)
