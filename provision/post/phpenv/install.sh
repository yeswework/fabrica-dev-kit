#!/bin/sh

echo "[install.sh] PHPEnv install and configuration"

PHP_VERSION='5.6.18'
PHPENV_ROOT='/usr/local/phpenv'

# Git and required libraries to get PHPEnv and php-build
echo "[install.sh] Installing Git and required libraries"
sudo apt-get -yqq install git libxml2-dev libcurl4-openssl-dev pkg-config libpng-dev libjpeg-dev libmcrypt-dev libreadline-dev libtidy-dev libxslt-dev

# install PHPEnv
echo "[install.sh] Downloading and install PHPEnv"
if [ -f $PHPENV_ROOT ]; then
  UPDATE = 'yes'
fi
wget https://raw.github.com/CHH/phpenv/master/bin/phpenv-install.sh -O /tmp/phpenv-install.sh
chmod +x /tmp/phpenv-install.sh
sudo PHPENV_ROOT=$PHPENV_ROOT UPDATE=$UPDATE /tmp/phpenv-install.sh
rm /tmp/phpenv-install.sh

if [ ! -f /etc/profile.d/phpenv.sh ]; then
  echo "[install.sh] Copying default startup settings"
  sudo cp /vagrant/provision/post/phpenv/phpenv.sh /etc/profile.d/
fi

sudo mkdir -p $PHPENV_ROOT/shims
sudo mkdir -p $PHPENV_ROOT/versions
sudo mkdir -p $PHPENV_ROOT/plugins

# cloning php-build
echo "[install.sh] Cloning php-build repository"
sudo git clone https://github.com/php-build/php-build.git $PHPENV_ROOT/plugins/php-build
sudo cp /vagrant/provision/post/phpenv/default_configure_options $PHPENV_ROOT/plugins/php-build/share/php-build/

# install PHP
echo "[install.sh] Installing PHP with PHPEnv"
sudo rm -rf /tmp/php-build*
sudo $PHPENV_ROOT/bin/phpenv install $PHP_VERSION
sudo $PHPENV_ROOT/bin/phpenv global $PHP_VERSION
sudo $PHPENV_ROOT/bin/phpenv rehash

# copy configuration files
sudo cp /vagrant/provision/post/phpenv/fabrica.ini $PHPENV_ROOT/versions/$PHP_VERSION/etc/conf.d/
sudo cp /vagrant/provision/post/phpenv/sudoers /etc/sudoers.d/phpenv

# restart Nginx
echo "[install.sh] Restarting Nginx service"
sudo service nginx restart

echo "[install.sh] PHPEnv installed and configured"

exit 0
