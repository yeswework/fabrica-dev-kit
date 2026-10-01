'use strict';

const http = require('http');

// A WordPress REST API standing in for a live site, answering only the routes `fdk pull` and
// `fdk push` call. Every request is recorded, so a test can assert that a refusal sent nothing,
// or that a push never reached the write.
//
//   const wp = await startWpStub({ posts: { 12: { type: 'page', raw: '<!-- wp:paragraph -->…' } } });
//   … `wp.url` goes into the project's `config.yml` …
//   await wp.close();
//
// `user`/`password` is the only credential accepted. `home` defaults to the server's own URL; set
// it to test a site that names a different home. Posts are `{ type, raw, modified_gmt, status }`,
// and only `publish` ones are found by search, as in WordPress.
const TYPES = { page: 'pages', post: 'posts' };

const startWpStub = async ({
	user = 'editor',
	password = 'abcd efgh ijkl mnop qrst uvwx',
	capabilities = { edit_posts: true, unfiltered_html: true },
	home,
	namespaces = ['wp/v2'],
	posts = {},
	patterns = {}, // id → status, or { status, title }
	purgeStatus = 200,
	stripAuth = false, // drop the Authorization header, as some Apache/CGI hosts do before PHP
} = {}) => {
	const requests = [],
		expected = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
	let stamp = 0;
	const nextModified = () => new Date(Date.UTC(2026, 8, 1, 0, 0, ++stamp)).toISOString().slice(0, 19);
	for (const post of Object.values(posts)) {
		post.status = post.status || 'publish';
		post.modified_gmt = post.modified_gmt || nextModified();
	}

	const server = http.createServer((req, res) => {
		let body = '';
		req.on('data', chunk => { body += chunk; });
		req.on('end', () => {
			if (stripAuth) { delete req.headers.authorization; }
			const url = new URL(req.url, 'http://stub'),
				route = url.pathname.replace(/^\/wp-json/, ''),
				authed = req.headers.authorization === expected;
			requests.push({ method: req.method, route, query: url.search, authorization: req.headers.authorization, body });
			const send = (status, data, headers = {}) => {
				res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
				res.end(JSON.stringify(data));
			};
			const denied = () => req.headers.authorization
				? send(401, { code: 'incorrect_password', message: 'The provided password is an invalid application password.' })
				: send(401, { code: 'rest_not_logged_in', message: 'You are not currently logged in.' });

			if (route === '/') {
				return send(200, { home: home ?? stub.url, namespaces });
			}
			if (!authed) { return denied(); }
			if (route === '/wp/v2/users/me') {
				return send(200, { name: user, capabilities });
			}
			if (route === '/wp/v2/search') {
				const post = posts[url.searchParams.get('include')];
				return send(200, post?.status === 'publish' ? [{ id: Number(url.searchParams.get('include')), subtype: post.type }] : []);
			}
			const type = /^\/wp\/v2\/types\/(\w+)$/.exec(route);
			if (type) { return send(200, { rest_base: TYPES[type[1]], rest_namespace: 'wp/v2' }); }
			if (route === '/wp/v2/blocks') {
				const include = url.searchParams.get('include')?.split(',') ?? Object.keys(patterns),
					published = include.filter(id => (patterns[id]?.status ?? patterns[id]) === 'publish')
						.map(id => ({ id: Number(id), title: { raw: patterns[id].title, rendered: `rendered ${patterns[id].title}` } })),
					perPage = Number(url.searchParams.get('per_page')) || 10,
					page = Number(url.searchParams.get('page')) || 1;
				return send(200, published.slice((page - 1) * perPage, page * perPage),
					{ 'X-WP-TotalPages': String(Math.max(1, Math.ceil(published.length / perPage))) });
			}
			if (route === '/siteground-optimizer/v1/purge-cache' && req.method === 'PUT') {
				return send(purgeStatus, { status: purgeStatus, message: 'Dynamic Caching successfully purged' });
			}
			const single = /^\/wp\/v2\/(\w+)\/(\d+)$/.exec(route),
				post = single && posts[single[2]];
			if (post && TYPES[post.type] === single[1]) {
				if (req.method === 'PUT') {
					post.raw = JSON.parse(body).content;
					post.modified_gmt = nextModified();
				}
				return send(200, { content: { raw: post.raw }, modified_gmt: post.modified_gmt });
			}
			send(404, { code: 'rest_no_route', message: 'No route was found matching the URL and request method.' });
		});
	});
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

	const stub = {
		url: `http://127.0.0.1:${server.address().port}`,
		password,
		posts,
		requests,
		// whether anything was sent that wasn't a read
		writes: () => requests.filter(request => request.method !== 'GET'),
		close: () => new Promise(resolve => server.close(resolve)),
	};
	return stub;
};

module.exports = { startWpStub };
