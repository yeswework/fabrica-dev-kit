FROM wordpress:fpm

# Add sudo in order to run wp-cli as the www-data user 
RUN apt-get update && apt-get install -y sudo less

# Add WP-CLI 
RUN curl https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar > /tmp/wp-cli.phar 
RUN chmod +x /tmp/wp-cli.phar
RUN mv /tmp/wp-cli.phar /usr/local/bin/wp

# Cleanup
RUN apt-get clean
RUN rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

USER www-data
