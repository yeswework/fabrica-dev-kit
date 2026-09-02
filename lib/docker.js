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

// Get current web Docker container automatically assigned port
const getWebPort = (force=false) => {
	if (!force && project && project.webPort) { return project.webPort; }

	const webPort = getDockerPort('web', 80);
	if (project) {
		project.webPort = webPort;
	}

	return webPort;
}

// Get current db Docker container automatically assigned port
const getDBPort = () => {
	if (project && project.dbPort) { return project.dbPort; }

	const dbPort = getDockerPort('db', 3306);
	if (project) {
		project.dbPort = dbPort;
	}

	return dbPort;
}

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

// Get current db Docker container automatically assigned port
const getSiteURL = () => {
	if (project && project.siteURL) { return project.siteURL; }

	const siteURL = execWPGet('wp option get siteurl');
	if (project) {
		project.siteURL = siteURL;
	}

	return siteURL;
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
