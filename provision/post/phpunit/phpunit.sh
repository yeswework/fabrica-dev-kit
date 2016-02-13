#!/bin/sh

echo "[phpunit.sh] PHPUnit install"

# download PHPUnit
sudo mkdir -p /usr/local/share/phpunit
echo "[phpunit.sh] Downloading PHPUnit"
sudo wget --quiet -O /usr/local/share/phpunit/phpunit.phar https://phar.phpunit.de/phpunit.phar
# add link to bin directory
sudo ln /usr/local/share/phpunit/phpunit.phar /usr/local/bin/phpunit

# tests install script
echo "[phpunit.sh] Installing Subversion"
sudo apt-get install -yqq subversion
echo "[phpunit.sh] Creating test environment"
sudo cp /vagrant/provision/post/phpunit/wp-test-install.sh /usr/bin/wp-test-install
/usr/bin/wp-test-install

echo "[phpunit.sh] PHPUnit installed"

exit 0
