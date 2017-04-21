FROM wordpress:fpm

# Add sudo in order to run wp-cli as the www-data user
RUN apt-get update && apt-get install -y sudo less

# Add WP-CLI
RUN curl https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar > /tmp/wp-cli.phar
RUN chmod +x /tmp/wp-cli.phar
RUN mv /tmp/wp-cli.phar /usr/local/bin/wp

# Install Xdebug
RUN pecl -q install xdebug \
    && echo "zend_extension=$(find /usr/local/lib/php/extensions/ -name xdebug.so)" > /usr/local/etc/php/conf.d/xdebug.ini \
    && echo "xdebug.remote_enable=on" >> /usr/local/etc/php/conf.d/xdebug.ini \
    && echo "xdebug.remote_autostart=off" >> /usr/local/etc/php/conf.d/xdebug.ini

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

USER www-data
