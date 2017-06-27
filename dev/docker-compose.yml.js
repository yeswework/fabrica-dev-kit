module.exports = (data) => `
version: '2'

services:
  web:
    image: nginx:latest
    container_name: ${data.slug}_web
    restart: unless-stopped
    volumes:
      - ./www:/var/www/html
      - ./provision/web/wordpress-fpm.conf:/etc/nginx/conf.d/default.conf
      - ./provision/web/global:/etc/nginx/global
    ports:
      - "80"
    links:
      - wp
  db:
    image: mysql:5.7
    container_name: ${data.slug}_db
    volumes:
      - db-data:/var/lib/mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: wordpress
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: wordpress
    ports:
      - "3306"
  wp:
    build:
      context: .
      dockerfile: provision/wp/Dockerfile
      args:
        UID: ${data.user.uid}
        GID: ${data.user.gid}
    container_name: ${data.slug}_wp
    restart: unless-stopped
    volumes:
      - ./www:/var/www/html
      - ./src:/var/www/src
      - ./provision/wp/zz-php.ini:/usr/local/etc/php/conf.d/zz-php.ini
    environment:
      WORDPRESS_DB_HOST: db:3306
      WORDPRESS_DB_PASSWORD: wordpress
      WORDPRESS_DB_PREFIX: ${data.db.prefix}
      WORDPRESS_DEBUG: "true"
    links:
      - db:mysql

volumes:
  db-data:
`;
