module.exports = (settings) => `
{
  "name": "${settings.slug}",
  "version": "0.1.0",
  "description": "${settings.title}",
  "private": true,
  "scripts": {
    "start": "func() { fdk config:all && webpack --watch --mode=development --env.fdk_project=\\"\${1:-default}\\"; }; func",
    "build": "func() { fdk config:all && webpack --mode=production --env.fdk_project=\\"\${1:-default}\\"; }; func",
    "dc": "docker-compose",
    "sh": "docker-compose exec -u www-data wp /bin/bash",
    "shroot": "docker-compose exec wp /bin/bash",
    "wp": "docker-compose exec -u www-data -T wp wp",
    "logs": "docker-compose logs -f --tail='46' wp | sed -e \\"s/ WARNING: .* into stderr: \\\\\\"\\\\(NOTICE: PHP message: \\\\)\\\\{0,1\\\\}\\\\(\\\\[[a-zA-Z0-9 :\\\\-]\\\\{1,\\\\}\\\\]\\\\)\\\\{0,1\\\\} \\\\{0,1\\\\}\\\\(.*\\\\)\\\\\\"/ ⚠️  $(tput setaf 3)\\\\3$(tput sgr0)/\\"",
    "remove": "docker-compose down --volumes --rmi local"
  },
  "fabrica_dev_kit": {
    "scripts_info": {
      "start": ["Run 'webpack' in development mode. All available resources 'webpack' configurations and loaded, and changed files are watched.", "[project]"],
      "build": ["Run 'webpack' in production mode and build source for all available resources 'webpack' configurations.", "[project]"],
      "dc": "Run 'docker-compose', eg. 'fdk dc ps'.",
      "sh": "Start shell on WP container.",
      "shroot": "Start shell as root on WP container.",
      "wp": "Run WP Cli. eg. 'fdk wp option list' or 'fdk wp -- --info'",
      "logs": "Tail WP container logs.",
      "remove": "Stop all project containers, remove their volumes and WP project image."
    }
  },
  "devDependencies": {
    "js-yaml": "^3.13.1",
    "rimraf": "^3.0.2",
    "webpack": "^4.41.5",
    "webpack-cli": "^3.3.10"
  }
}
`;