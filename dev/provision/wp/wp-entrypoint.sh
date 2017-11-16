#!/bin/sh

# Update hosts file for sendmail
echo "127.0.0.1 $(hostname) localhost localhost.localdomain" >> /etc/hosts
service sendmail restart

docker-entrypoint.sh "$@"
