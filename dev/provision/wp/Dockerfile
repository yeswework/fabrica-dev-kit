FROM aheadworks/mhsendmail as mhsendmail
FROM wordpress:php8.0-fpm

# Add dependencies in order to run wp-cli and mhsendmail as the www-data user
RUN apt-get update && apt-get install -yq --no-install-recommends sudo less

# Add and configure WP-CLI with Psysh
RUN curl https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar > /usr/local/bin/wp
RUN curl https://psysh.org/psysh > /usr/local/bin/psysh
RUN chmod +x /usr/local/bin/wp /usr/local/bin/psysh
RUN mkdir -p /var/www/.wp-cli/cache
RUN echo -e "require:\n  - /usr/local/bin/psysh" > /var/www/.wp-cli/config.yml

# Install Xdebug
RUN pecl -q install xdebug && docker-php-ext-enable xdebug

# Install mhsendmail
COPY --from=mhsendmail /usr/bin/mhsendmail /usr/bin/mhsendmail

# Permissions and cleanup
RUN chown -R www-data:www-data /var/www/ /usr/local/var/log /usr/bin/mhsendmail
RUN apt-get clean
RUN rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Wordpress image's entrypoint script
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["php-fpm"]
