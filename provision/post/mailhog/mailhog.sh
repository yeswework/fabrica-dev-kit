#!/bin/sh

echo "[mailhog.sh] MailHog install and configuration"

# WordPress plugin to send mails to MailHog's port
echo "[mailhog.sh] Copying WordPress plugin"
WP_MU_PLUGINS_DIR=$(wp eval 'echo WP_CONTENT_DIR;')/mu-plugins
mkdir -p $WP_MU_PLUGINS_DIR
cp /vagrant/provision/post/mailhog/mailhog.php $WP_MU_PLUGINS_DIR

# MailHog requires Go
echo "[mailhog.sh] Installing Go"
sudo apt-get -yqq install golang
# download MailHog
echo "[mailhog.sh] Downloading and setting up MailHog"
mkdir -p ~/bin
wget --quiet -O ~/bin/mailhog https://github.com/mailhog/MailHog/releases/download/v0.1.8/MailHog_linux_amd64
chmod +x ~/bin/mailhog
# set as service and make it start on reboot
sudo cp /vagrant/provision/post/mailhog/mailhog.conf /etc/init/

# start it now in the background
echo "[mailhog.sh] Running MailHog in background"
sudo service mailhog start

echo "[mailhog.sh] MailHog installed and WordPress configured"

exit 0
