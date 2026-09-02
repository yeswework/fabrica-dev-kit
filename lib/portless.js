'use strict';

const path = require('path'),
	sh = require('shelljs');

const { echo, warn } = require('./util');

// Check if portless CLI is available
const checkPortless = () => sh.exec('hash portless 2>/dev/null', { silent: true }).code === 0;

// When behind the Portless proxy, WordPress must trust its forwarded headers so it uses
// the real public host/scheme instead of the internal 127.0.0.1 backend address. This
// ships in the setup template for new projects; `configServices` injects it into existing
// projects. `$$` escapes Docker Compose interpolation so the container receives `$_SERVER`.
const PORTLESS_CONFIG_EXTRA = `if (!empty($$_SERVER['HTTP_X_PORTLESS_HOPS'])) {
	if (!empty($$_SERVER['HTTP_X_FORWARDED_HOST'])) $$_SERVER['HTTP_HOST'] = $$_SERVER['HTTP_X_FORWARDED_HOST'];
	if (($$_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') $$_SERVER['HTTPS'] = 'on';
}
`;

// Check if the portless proxy is already running by inspecting its state files.
// Returns { port } if running, null otherwise.
const isPortlessProxyStarted = () => {
	if (!checkPortless()) { return null; }
	const stateDir = process.env.PORTLESS_STATE_DIR || path.join(require('os').homedir(), '.portless'),
		pidPath = path.join(stateDir, 'proxy.pid'),
		portPath = path.join(stateDir, 'proxy.port');
	if (!sh.test('-e', pidPath) || !sh.test('-e', portPath)) { return null; }
	const pid = parseInt(sh.cat(pidPath)?.trim(), 10),
		port = sh.cat(portPath)?.trim() || 0;
	if (pid <= 0 || !port || sh.exec(`kill -0 ${pid}`, { silent: true }).code !== 0) { return null; }
	return { port };
};

// Setup portless alias for a service and return the alias URL (protocol+hostname+proxy port)
const setupPortlessAlias = (name, port) => {
	// 1. Ensure the portless proxy is running
	if (!checkPortless()) {
		echo('Portless CLI not found. Install it with: npm install -g portless', '📛');
		return null;
	}
	// `portless proxy start` is idempotent — starts the proxy if not running, else no-op
	if (!isPortlessProxyStarted()) {
		echo('Portless might require \x1b[1m`sudo`\x1b[22m priviledges to setup the 443 or 80 port. You can skip this and use port 1355 by pressing \x1b[1m`ctrl-d`\x1b[22m when asked for the password.');
		echo('To use other ports or configuration settings, set the corresponding Portless enviroment variables or start the Portless proxy using \x1b[1m`portless proxy start`\x1b[22m with the parameters for the your preferred settings before running this command.')
	}
	const proxyStartResult = sh.exec(`portless proxy start`, { silent: false });
	if (proxyStartResult.code !== 0) {
		warn('Failed to start portless proxy.');
		return null;
	}

	// 2. Register the alias
	const aliasResult = sh.exec(`portless alias "${name}" ${port} --force`, { silent: false });
	if (aliasResult.code !== 0) {
		warn(`Failed to set up portless alias for '${name}'.`);
		return null;
	}

	// 3. Verify by reading back from portless list — extract the full URL (works with any TLD)
	const listOutput = sh.exec(`portless list`, { silent: true }).stdout,
		// Match the full URL: protocol://hostname:port (any TLD, any port)
		urlMatch = listOutput.match(new RegExp(`(https?)://${name}\\.([^\\s:]+)(?::(\\d+))?`));
	if (!urlMatch) { return null; }
	
	const protocol = urlMatch[1],
		tldHost = urlMatch[2],     // e.g. "localhost" or "test" or "loc"
		listPort = urlMatch[3],
		aliasPort = listPort && listPort !== '443' && listPort !== '80' ? `:${listPort}` : '';
	return `${protocol}://${name}.${tldHost}${aliasPort}`;
}

// Remove portless alias for a service
const removePortlessAlias = name => checkPortless() && sh.exec(`portless alias --remove "${name}"`, { silent: true });

module.exports = { PORTLESS_CONFIG_EXTRA, checkPortless, removePortlessAlias, setupPortlessAlias };
