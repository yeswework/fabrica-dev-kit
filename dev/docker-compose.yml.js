module.exports = (settings) => `
services:
  web:
    image: nginx:latest
    restart: unless-stopped
    volumes:
      - ./www:/var/www/html
      - ./provision/web/wordpress-fpm.conf:/etc/nginx/conf.d/default.conf
      - ./provision/web/global:/etc/nginx/global
    ports:
      - '80'
    links:
      - wp
  db:
    image: mysql/mysql-server:latest
    volumes:
      - db:/var/lib/mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: wordpress
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: wordpress
    ports:
      - '3306'
  wp:
    image: fabricawp/wordpress:0.0.3
    restart: unless-stopped
    volumes:
      - ./www:/var/www/html
      - ./provision/wp/zz-php.ini:/usr/local/etc/php/conf.d/zz-php.ini
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_NAME: wordpress
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: wordpress${
        settings?.db?.prefix ? `      WORDPRESS_DB_PREFIX: ${settings?.db?.prefix}` : ''
      }
      WORDPRESS_DEBUG: 'true'
      # When behind the Portless proxy, trust its forwarded headers so WordPress uses the real public host/scheme instead of the internal 127.0.0.1 backend address
      WORDPRESS_CONFIG_EXTRA: |
        if (!empty($$_SERVER['HTTP_X_PORTLESS_HOPS'])) {
        	if (!empty($$_SERVER['HTTP_X_FORWARDED_HOST'])) $$_SERVER['HTTP_HOST'] = $$_SERVER['HTTP_X_FORWARDED_HOST'];
        	if (($$_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') $$_SERVER['HTTPS'] = 'on';
        }
    links:
      - db:mysql
volumes:
  db: {}
`;
