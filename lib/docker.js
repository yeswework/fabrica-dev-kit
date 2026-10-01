'use strict';

const http = require('http'),
	sh = require('shelljs'),
	yaml = require('js-yaml');

const { execGet, execWPGet, wait } = require('./util'),
	{ project } = require('./project');

// maximum time (in milliseconds) to wait for wp container to be up and running
const WAIT_WP_CONTAINER_TIMEOUT = 360 * 1000;

// Get external Docker port
const getDockerPort = (service, port) => {
	return execGet(`docker compose port ${service} ${port}`).replace(/^.*:(\d+)$/g, '$1');
}

// Each answer holds until the containers restart, so it's asked once per run; `force` asks again
const cached = (key, lookup) => (force=false) => {
	if (!force && project[key]) { return project[key]; }
	return project[key] = lookup();
}

const getWebPort = cached('webPort', () => getDockerPort('web', 80)),
	getDBPort = cached('dbPort', () => getDockerPort('db', 3306)),
	getSiteURL = cached('siteURL', () => execWPGet('wp option get siteurl'));

// Get current Docker automatically assigned ports for extra services
const getServicesPorts = () => {
	const dockerConfig = yaml.load(sh.cat(`./docker-compose.yml`)),
		ports = [];
	if (dockerConfig.services?.mailpit) {
		const mailpitPort = getDockerPort('mailpit', 8025);
		ports.push({
			icon: '📨',
			name: 'Mailpit',
			port: mailpitPort,
		});
	}
	return ports;
}

const waitForWebContainer = (forcePortCheck=false) => {
	let startTime = Date.now(), getting = false, webPort;
	return wait(`Waiting for 'web' container...`, stopWaitInterval => {
		// get port dynamically assigned by Docker to expose web container's port 80
		webPort = forcePortCheck ? getWebPort(true) : (webPort || getWebPort());
		if (webPort && !getting) {
			// check if WordPress is already available at the expected URL
			getting = true;
			http.get(`http://localhost:${webPort}/wp-admin/install.php`, response => {
				getting = false;
				if (response.statusCode == '200') {
					// container is up
					stopWaitInterval(true, webPort);
				}
			}).on('error', error => {
				// ignore errors (container still not up)
				getting = false;
			});
		}
		if (Date.now() - startTime > WAIT_WP_CONTAINER_TIMEOUT) {
			// timeout
			stopWaitInterval(false);
		}
	});
};

module.exports = { WAIT_WP_CONTAINER_TIMEOUT, getDBPort, getServicesPorts, getSiteURL, getWebPort, waitForWebContainer };
