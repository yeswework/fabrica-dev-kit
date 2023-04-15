FROM aheadworks/mhsendmail as mhsendmail
FROM wordpress:php8.0-fpm

# Add dependencies in order to run wp-cli and mhsendmail as the www-data user
RUN apt-get update && apt-get install -yq --no-install-recommends sudo less

# Add WP-CLI
RUN curl https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar > /tmp/wp-cli.phar
RUN chmod +x /tmp/wp-cli.phar
RUN mv /tmp/wp-cli.phar /usr/local/bin/wp
RUN mkdir -p /var/www/.wp-cli/cache

# Install Xdebug
RUN pecl -q install xdebug \
    && docker-php-ext-enable xdebug

# Install mhsendmail
COPY --from=mhsendmail /usr/bin/mhsendmail /usr/bin/mhsendmail

# Permissions and cleanup
RUN chown -R www-data:www-data /var/www/ /usr/local/var/log /usr/bin/mhsendmail
RUN apt-get clean
RUN rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Wordpress image's entrypoint script
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["php-fpm"]
