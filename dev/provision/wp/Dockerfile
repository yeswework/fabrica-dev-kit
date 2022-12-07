FROM wordpress:php8.1-fpm

# Add sudo in order to run wp-cli as the www-data user
RUN apt-get update && apt-get install -y sudo less

# Add WP-CLI
RUN curl https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar > /tmp/wp-cli.phar
RUN chmod +x /tmp/wp-cli.phar
RUN mv /tmp/wp-cli.phar /usr/local/bin/wp
RUN mkdir -p /var/www/.wp-cli/cache
RUN chown -R www-data:www-data /var/www/

# Install Xdebug
RUN pecl -q install xdebug \
    && docker-php-ext-enable xdebug

# Install sendmail
RUN apt-get -qq -o=Dpkg::Use-Pty=0 install -y sendmail > /dev/null 2>&1

# Cleanup
RUN apt-get clean
RUN rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Set container user and group ID to match that of host user
ARG UID
ARG GID
RUN CONTAINER_USER_OLD=`getent passwd ${UID} | cut -d: -f1` && \
    if [ -n "$CONTAINER_USER_OLD" ]; then usermod -o -u 21000 $CONTAINER_USER_OLD; fi
RUN usermod -o -u ${UID} www-data
RUN CONTAINER_GROUP_OLD=`getent group ${GID} | cut -d: -f1` && \
    if [ -n "$CONTAINER_GROUP_OLD" ]; then groupmod -o -g 21001 $CONTAINER_GROUP_OLD; fi
RUN groupmod -o -g ${GID} www-data

# Set entrypoint script to update hosts for sendmail before calling Wordpress image original entrypoint script
COPY provision/wp/wp-entrypoint.sh /usr/local/bin/
ENTRYPOINT ["wp-entrypoint.sh"]
CMD ["php-fpm"]
