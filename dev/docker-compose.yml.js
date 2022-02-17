module.exports = (settings) => `
version: '2'

services:
  web:
    image: nginx:latest
    container_name: ${settings.slug}_web
    restart: unless-stopped
    volumes:
      - ./www:/var/www/html
      - ./provision/web/wordpress-fpm.conf:/etc/nginx/conf.d/default.conf
      - ./provision/web/global:/etc/nginx/global
${settings.wp.multisite
  ? `    environment:\n` +
    `      VIRTUAL_HOST: ${settings.slug}.local`
    : ''
}
    ports:
      - "80"
    links:
      - wp
${settings.wp.multisite ? '      - proxy' : ''
}
  db:
    image: mysql/mysql-server:latest
    container_name: ${settings.slug}_db
    volumes:
      - ./db:/var/lib/mysql
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
        UID: ${settings.user.uid}
        GID: ${settings.user.gid}
    container_name: ${settings.slug}_wp
    restart: unless-stopped
    volumes:
      - ./www:/var/www/html
      - ./provision/wp/zz-php.ini:/usr/local/etc/php/conf.d/zz-php.ini
    environment:
      WORDPRESS_DB_HOST: db:3306
      WORDPRESS_DB_NAME: wordpress
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: wordpress
      WORDPRESS_DB_PREFIX: ${settings.db.prefix}
      WORDPRESS_DEBUG: "true"
    links:
      - db:mysql
${settings.wp.multisite
  ? `  proxy:\n` +
    `    image: jwilder/nginx-proxy:alpine\n` +
    `    ports:\n` +
    `      - "80:80"\n` +
    `    volumes:\n` +
    `      - /var/run/docker.sock:/tmp/docker.sock:ro\n` +
    `    restart: unless-stopped`
  : ''}
`;
