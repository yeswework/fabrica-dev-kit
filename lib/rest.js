'use strict';

const { getProjectConfig } = require('./config');

// What a config holds before someone pastes the real value in: `<wp username>`, `xxxx xxxx …`
const isPlaceholder = value => typeof value !== 'string' || /^\s*$|^</.test(value) || /^[x\s]+$/i.test(value);

// Plain http would send the application password in the clear, so only a local site may use it
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/;

// The `wp:` settings of a `config.yml` section, checked before anything is sent. `default` carries
// none on purpose, like `ftp:`, so a forgotten section argument can't reach a live site
const getSite = section => {
	const wp = getProjectConfig(section).wp;
	if (!wp) {
		throw new Error(`No 'wp:' settings under '${section}' in 'config.yml': add its url, user and appPassword.`);
	}
	for (const key of ['url', 'user', 'appPassword']) {
		if (isPlaceholder(wp[key])) {
			throw new Error(`'wp.${key}' under '${section}' in 'config.yml' is missing or still a placeholder.`);
		}
	}
	let url;
	try {
		url = new URL(wp.url);
	} catch (ex) {
		throw new Error(`'wp.url' under '${section}' in 'config.yml' is not a URL.`);
	}
	if (url.protocol !== 'https:' && !LOOPBACK.test(url.hostname)) {
		throw new Error(`'wp.url' under '${section}' in 'config.yml' must be https, or the application password would cross the network in the clear.`);
	}
	return {
		url: wp.url.replace(/\/+$/, ''),
		auth: `Basic ${Buffer.from(`${wp.user}:${wp.appPassword}`).toString('base64')}`,
	};
};

// `route` is relative to the REST root, e.g. `/wp/v2/pages/12`. Resolves to the response and its
// parsed body, or throws with what the server said — never with the request itself, which carries
// the credential
const send = async (site, route, { method = 'GET', body, auth = true } = {}) => {
	let response;
	try {
		response = await fetch(`${site.url}/wp-json${route}`, {
			method,
			headers: { ...(auth && { Authorization: site.auth }), ...(body && { 'Content-Type': 'application/json' }) },
			body: body && JSON.stringify(body),
			// followed, a redirect to another origin would drop the Authorization header and come
			// back as a 401 that reads like a wrong password
			redirect: 'manual',
		});
	} catch (ex) {
		throw new Error(`Could not reach '${site.url}': ${ex.cause?.message || ex.message}`);
	}
	if (response.status >= 300 && response.status < 400) {
		throw new Error(`'${site.url}' redirects to '${response.headers.get('location')}': set 'wp.url' to the address the site answers on.`);
	}
	let data = null;
	try {
		data = JSON.parse(await response.text());
	} catch (ex) {}
	if (response.ok && data !== null) { return { response, data }; }
	// an anonymous request, not a rejected one: a wrong password fails with its own code
	if (data?.code === 'rest_not_logged_in' && auth) {
		throw new Error(`'${site.url}' received the request without credentials: the host is probably stripping the Authorization header before PHP sees it.`);
	}
	throw new Error(`${method} ${route} on '${site.url}' failed (${response.status})${data?.message ? `: ${data.message}` : ''}`);
};

const request = async (...args) => (await send(...args)).data;

// Every item of a collection route, across as many pages as the site reports
const requestAll = async (site, route) => {
	const items = [];
	for (let page = 1, pages = 1; page <= pages; page++) {
		const { response, data } = await send(site, `${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
		items.push(...data);
		pages = Number(response.headers.get('x-wp-totalpages')) || 1;
	}
	return items;
};

// Proves WHICH site before trusting the credential with it, then WHO the credential is. The right
// password aimed at the wrong URL fails open: a staging copy answers every content question
// plausibly, so without the `home` check a read from one could be written back to the other
const connect = async section => {
	const site = getSite(section),
		index = await request(site, '/', { auth: false }),
		home = String(index.home).replace(/\/+$/, '');
	if (home !== site.url) {
		throw new Error(`'${site.url}' reports its home as '${home}': refusing to use the '${section}' credential on a site it doesn't name.`);
	}
	const user = await request(site, '/wp/v2/users/me?context=edit&_fields=name,capabilities');
	return { ...site, namespaces: index.namespaces || [], user };
};

module.exports = { connect, getSite, isPlaceholder, request, requestAll };
