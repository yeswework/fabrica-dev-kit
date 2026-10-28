'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test'),
	fs = require('fs'),
	http = require('http'),
	path = require('path');

const { makeProject } = require('../helpers/project'),
	{ runFdk } = require('../helpers/run'),
	{ stubBin } = require('../helpers/stub-bin'),
	{ cleanTmpDirs, makeTmpDir } = require('../helpers/tmpdir'),
	{ SSH_STUB_BODY, WP_STUB_BODY } = require('../helpers/wp-cli-stub'),
	{ replacements } = require('../../lib/seed');

after(cleanTmpDirs);

const PASSWORD = 'abcd efgh ijkl mnop qrst uvwx',
	AUTH = `Basic ${Buffer.from(`editor:${PASSWORD}`).toString('base64')}`;

// A live block-theme site over REST: page 8 under page 6, which the page query alone doesn't return,
// a database template and a theme-file one, global styles, and an image the front page renders.
// `overrides` replaces any of them. Collections come in pages of at most 10, WordPress's default size
const startSite = async (overrides = {}) => {
	const requests = [],
		pages = {
			6: { id: 6, status: 'publish', slug: 'parent', title: { raw: 'Parent' }, content: { raw: '' }, parent: 0, author: 1 },
			8: { id: 8, status: 'publish', slug: 'home', title: { raw: 'Home' }, content: { raw: '<img class="wp-image-9"/>' }, parent: 6, author: 1 },
		};
	const server = http.createServer((req, res) => {
		const url = new URL(req.url, 'http://stub'),
			route = url.pathname.replace(/^\/wp-json/, ''),
			include = url.searchParams.get('include')?.split(',').map(Number),
			send = data => {
				const size = Math.min(Number(url.searchParams.get('per_page')) || 10, 10),
					page = Number(url.searchParams.get('page')) || 1,
					paged = Array.isArray(data);
				res.writeHead(200, { 'Content-Type': 'application/json', 'X-WP-TotalPages': String(paged ? Math.max(1, Math.ceil(data.length / size)) : 1) });
				res.end(JSON.stringify(paged ? data.slice((page - 1) * size, page * size) : data));
			};
		requests.push({ method: req.method, route, query: url.search });
		if (route === '/') { return send({ home: site.url, namespaces: ['wp/v2'] }); }
		if (req.headers.authorization !== AUTH) {
			res.writeHead(401);
			return res.end('{"code":"incorrect_password"}');
		}
		const routes = {
			'/wp/v2/users/me': { name: 'editor' },
			'/wp/v2/types': { page: { rest_base: 'pages', rest_namespace: 'wp/v2', taxonomies: [] }, post: { rest_base: 'posts', taxonomies: [] },
				attachment: { rest_base: 'media', rest_namespace: 'wp/v2', taxonomies: [] } },
			'/wp/v2/taxonomies': {},
			'/wp/v2/settings': { title: 'Site', url: site.url, show_on_front: 'page', page_on_front: 8, site_icon: 0, site_logo: null },
			'/wp/v2/themes': [{ stylesheet: 'theme', _links: { 'wp:user-global-styles': [{ href: `${site.url}/wp-json/wp/v2/global-styles/15` }] } }],
			'/wp/v2/global-styles/15': { title: { raw: 'Custom Styles' }, styles: { color: { text: '#000' } }, settings: {} },
			'/wp/v2/templates': [
				{ wp_id: 20, slug: 'index', theme: 'theme', status: 'publish', title: { raw: 'Index' }, content: { raw: '<!-- wp:post-content /-->' } },
				{ slug: 'single', theme: 'theme', status: 'publish', title: { raw: 'Single' }, content: { raw: 'from the theme file' } },
			],
			'/wp/v2/template-parts': [],
			'/wp/v2/menus': [],
			'/wp/v2/menu-items': [],
			'/wp/v2/posts': [],
			'/wp/v2/pages': Object.values(pages).filter(page => include ? include.includes(page.id) : page.id !== 6),
			'/wp/v2/media': [{ id: 9, mime_type: 'image/jpeg', source_url: `${site.url}/wp-content/uploads/2026/01/a.jpg`, media_details: { file: '2026/01/a.jpg' } }],
			'/wp/v2/comments': [],
			'/wp/v2/users': [{ id: 1, username: 'admin', slug: 'admin', name: 'Admin', email: 'a@example.com', roles: ['administrator'] }],
			...overrides,
		};
		if (!(route in routes)) {
			res.writeHead(404);
			return res.end('{"code":"rest_no_route"}');
		}
		const data = routes[route];
		send(typeof data === 'function' ? data(url) : data);
	});
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	const site = { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise(resolve => server.close(resolve)) };
	return site;
};

// `docker` standing in for the local site: it keeps what the writer was sent and answers with the
// report it is given
const localSite = (report, stubs = {}) => {
	const tmp = makeTmpDir(),
		input = path.join(tmp, 'input.php');
	const bin = stubBin({ docker: `case "$*" in *eval-file*) cat > '${input}'; printf '\\nFDK-SEED %s\\n' '${JSON.stringify(report)}';; esac`, ...stubs });
	return {
		...bin,
		// the snapshot the writer received
		sent: () => {
			const php = fs.readFileSync(input, 'utf8');
			return JSON.parse(Buffer.from(/base64_decode\('([^']+)'\)/.exec(php)[1], 'base64').toString());
		},
	};
};

const REPORT = { clashes: [], commentClashes: [], remapped: [], home: 'https://local.localhost', written: 1 };

const withSite = async (body, seed = '', routes) => {
	const site = await startSite(routes);
	try {
		const dir = makeProject({ config: ['default:', '  themes: []', 'production:', '  extend: default', '  rest:', `    url: "${site.url}"`,
			'    user: editor', `    application_password: "${PASSWORD}"`, seed, ''].join('\n') });
		await body(site, dir);
	} finally {
		await site.close();
	}
};

test('a dry run reads only, and hands the writer posts, parents, templates, styles and media under their live IDs', () =>
	withSite(async (site, dir) => {
		const local = localSite(REPORT),
			res = await runFdk(['seed', 'production', '--dry-run'], { cwd: dir, env: { PATH: local.path } });
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /Dry run: nothing written/);
		assert.deepEqual(site.requests.filter(request => request.method !== 'GET'), []);

		const { snapshot, check, replace } = local.sent(),
			ids = Object.fromEntries(['page', 'wp_template', 'wp_global_styles', 'attachment']
				.map(type => [type, snapshot.posts.filter(post => post.post_type === type).map(post => post.ID).sort()]));
		assert.deepEqual({ check, replace }, { check: true, replace: false });
		// live's home, which every link in the content holds, is the URL the local one replaces
		assert.equal(snapshot.source.home, site.url);
		assert.deepEqual(ids, { page: [6, 8], wp_template: [20], wp_global_styles: [15], attachment: [9] });
		assert.ok(snapshot.relationships.some(rel => rel.object_id === 20 && rel.taxonomy === 'wp_theme' && rel.slug === 'theme'));
		assert.equal(JSON.parse(snapshot.posts.find(post => post.ID === 15).post_content).isGlobalStylesUserThemeJSON, true);
		assert.deepEqual(snapshot.options.find(option => option.name === 'page_on_front'), { name: 'page_on_front', value: 8 });
		assert.match(res.stderr, /'acf-field-group' isn't exposed over REST/);
		// posts are narrowed to the last 6 months on the server, as Fabrica Export narrows them
		assert.ok(site.requests.some(request => request.route === '/wp/v2/posts' && /after=/.test(request.query)));
		assert.ok(!local.calls().some(call => call.includes('search-replace')));
	}));

// a template matched to the local one by theme and slug takes its local ID, which a live page can hold
test('two live posts bound for one local ID write nothing, even with --replace, and a dry run names them', () =>
	withSite(async (site, dir) => {
		const collision = { ...REPORT, collisions: [{ ID: 12, posts: [
			{ ID: 50, type: 'wp_template', title: 'Index' }, { ID: 12, type: 'page', title: 'Home' }] }] };
		let local = localSite(collision),
			res = await runFdk(['seed', 'production', '--replace'], { cwd: dir, env: { PATH: local.path } });
		assert.notEqual(res.status, 0);
		assert.match(res.stderr, /would each hold two live posts, so nothing was written: 12 \(live wp_template 50 'Index', live page 12 'Home'\)/);
		assert.ok(!local.calls().some(call => call.includes('search-replace')));

		local = localSite(collision);
		res = await runFdk(['seed', 'production', '--dry-run'], { cwd: dir, env: { PATH: local.path } });
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stderr, /Two live posts would be written into one local ID, which --replace can't settle: 12 /);
	}));

test('a clash writes nothing and names the post, unless --replace', () =>
	withSite(async (site, dir) => {
		const clash = { ...REPORT, clashes: [{ ID: 8, type: 'page', title: 'Home', local_type: 'post', local_title: 'Hello world!' }] };
		let local = localSite(clash),
			res = await runFdk(['seed', 'production'], { cwd: dir, env: { PATH: local.path } });
		assert.notEqual(res.status, 0);
		assert.match(res.stderr, /8 \(live page 'Home', local post 'Hello world!'\).*--replace/);
		assert.ok(!local.calls().some(call => call.includes('search-replace')));

		local = localSite(REPORT);
		res = await runFdk(['seed', 'production', '--replace'], { cwd: dir, env: { PATH: local.path } });
		assert.equal(res.status, 0, res.stderr);
		assert.equal(local.sent().replace, true);
		const replaced = local.calls().filter(call => call.includes('search-replace')),
			[plain, escaped] = replacements(site.url, 'https://local.localhost');
		assert.equal(replaced.length, 2);
		assert.ok(replaced[0].includes(`search-replace ${plain.join(' ')} --regex`), replaced[0]);
		assert.ok(replaced[1].includes(`search-replace ${escaped.join(' ')} --regex`), replaced[1]);
	}));

test("the section's seed: block and --only narrow what is read", () =>
	withSite(async (site, dir) => {
		const local = localSite(REPORT),
			res = await runFdk(['seed', 'production', '--dry-run', '--only', 'page,post', '--ids', '8'], { cwd: dir, env: { PATH: local.path } });
		assert.equal(res.status, 0, res.stderr);
		assert.deepEqual(local.sent().snapshot.posts.filter(post => post.post_type === 'page').map(post => post.ID).sort(), [6, 8]);
		// named by ID, so a draft is fetched too
		assert.ok(site.requests.some(request => request.route === '/wp/v2/pages' && /include=8/.test(request.query) && /status=[^&]*draft/.test(request.query)));
		// --only overrides the config's `post: false`, and leaves out every type it doesn't name
		assert.ok(site.requests.some(request => request.route === '/wp/v2/posts'));
		assert.ok(!site.requests.some(request => request.route === '/wp/v2/templates'));
		// the front page setting names a post a narrowed seed may not copy
		assert.deepEqual(local.sent().snapshot.options, []);
		assert.match(res.stderr, /Site settings weren't copied: --only and --ids/);
	}, '  seed:\n    post: false'));

// global styles are post 15 on the stub site, which --ids 8 doesn't name
test('--ids leaves the global styles alone over REST, as it does over SSH', () =>
	withSite(async (site, dir) => {
		const local = localSite(REPORT),
			res = await runFdk(['seed', 'production', '--dry-run', '--ids', '8'], { cwd: dir, env: { PATH: local.path } });
		assert.equal(res.status, 0, res.stderr);
		const types = local.sent().snapshot.posts.map(post => post.post_type);
		assert.ok(types.includes('page'));
		assert.ok(!types.includes('wp_global_styles'));
	}));

test('--only attachment asks the media route for its own statuses, and keeps where each file is', () =>
	withSite(async (site, dir) => {
		const local = localSite(REPORT),
			res = await runFdk(['seed', 'production', '--dry-run', '--only', 'attachment'], { cwd: dir, env: { PATH: local.path } });
		assert.equal(res.status, 0, res.stderr);
		const media = site.requests.find(request => request.route === '/wp/v2/media');
		assert.match(media.query, /status=inherit%2Cprivate|status=inherit,private/);
		assert.doesNotMatch(media.query, /publish/);
		const { snapshot } = local.sent();
		assert.deepEqual(snapshot.posts.map(post => [post.ID, post.post_type]), [[9, 'attachment']]);
		assert.ok(snapshot.meta.some(meta => meta.post_id === 9 && meta.key === '_wp_attached_file' && meta.value === '2026/01/a.jpg'));
	}));

// a block theme past one page of each: core's own routes don't page these, but the read mustn't
// depend on that
test('every page of templates and template parts is read, each record once', () => {
	const records = (first, slug, extra = {}) => Array.from({ length: 12 }, (_, i) => ({ wp_id: first + i, slug: `${slug}-${i}`, theme: 'theme',
		status: 'publish', title: { raw: `${slug} ${i}` }, content: { raw: '' }, ...extra }));
	return withSite(async (site, dir) => {
		const local = localSite(REPORT),
			res = await runFdk(['seed', 'production', '--dry-run', '--only', 'wp_template,wp_template_part'], { cwd: dir, env: { PATH: local.path } });
		assert.equal(res.status, 0, res.stderr);
		const ids = type => local.sent().snapshot.posts.filter(post => post.post_type === type).map(post => post.ID).sort((a, b) => a - b);
		assert.deepEqual(ids('wp_template'), records(100, 'template').map(item => item.wp_id));
		assert.deepEqual(ids('wp_template_part'), records(200, 'part').map(item => item.wp_id));
		assert.ok(site.requests.some(request => request.route === '/wp/v2/template-parts' && /page=2/.test(request.query)));
	}, '', { '/wp/v2/templates': records(100, 'template'), '/wp/v2/template-parts': records(200, 'part', { area: 'header' }) });
});

// core serves a `single: false` key as the array of its rows, and tells it from a single key holding
// an array only in the route's schema
test('over REST, a meta key registered single: false is one row per value, and an array-valued single key one row', () =>
	withSite(async (site, dir) => {
		const local = localSite(REPORT),
			res = await runFdk(['seed', 'production', '--dry-run', '--only', 'page', '--ids', '8'], { cwd: dir, env: { PATH: local.path } });
		assert.equal(res.status, 0, res.stderr);
		const meta = local.sent().snapshot.meta.filter(meta => meta.post_id === 8 && ['tags', 'pair'].includes(meta.key));
		assert.deepEqual(meta, [
			{ post_id: 8, key: 'tags', value: 'a' },
			{ post_id: 8, key: 'tags', value: 'b' },
			{ post_id: 8, key: 'pair', value: ['x', 'y'] },
		]);
		assert.deepEqual(site.requests.filter(request => request.method !== 'GET'), []);
	}, '', {
		'/wp/v2/pages': url => url.searchParams.get('_method') === 'OPTIONS'
			? { schema: { properties: { meta: { type: 'object', properties: {
				tags: { type: 'array', items: { type: 'string', title: '', description: '', default: '' } },
				pair: { type: 'array', title: '', description: '', default: [], items: { type: 'string' } },
			} } } } }
			: [{ id: 8, status: 'publish', slug: 'home', title: { raw: 'Home' }, content: { raw: '' }, parent: 0, author: 1,
				meta: { tags: ['a', 'b'], pair: ['x', 'y'] } }],
	}));

// A seed of page 7 over SSH from a live site whose home is `home`
const sshSeed = async (home = 'https://example.com', flags = ['--only', 'page', '--ids', '7'], siteurl = home) => {
	const state = path.join(makeTmpDir(), 'site.json'),
		// stored rows as the reader prints them: serialized meta and options stay raw strings
		snapshot = {
			source: { home, siteurl, stylesheet: 'theme' },
			posts: [{ ID: '7', post_type: 'page', post_status: 'draft', post_content: '<!-- wp:paragraph -->' }],
			meta: [{ post_id: 7, key: '_custom', raw: 'a:1:{s:1:"a";s:1:"b";}' }],
			terms: [], relationships: [], comments: [], users: [],
			options: [{ name: 'page_on_front', raw: '7' }], menuLocations: {}, gaps: [],
		};
	fs.writeFileSync(state, JSON.stringify({ home: 'https://example.com', posts: {}, patterns: {}, admins: ['1'], commands: [], calls: [], snapshot }));
	const dir = makeProject({ config: ['default:', '  themes: []', 'production:', '  extend: default',
		'  ftp:', '    scheme: sftp', '    host: ssh.example.com', '    user: u123', '    password: sftp-secret', '    path: wordpress',
		'    commands:', '      - set sftp:connect-program "ssh -a -x -i ~/.ssh/site_key"', ''].join('\n') });
	const local = localSite(REPORT, { ssh: SSH_STUB_BODY, wp: WP_STUB_BODY }),
		res = await runFdk(['seed', 'production', ...flags], { cwd: dir, env: { PATH: local.path, FDK_WP_STATE: state } });
	return { local, res, site: JSON.parse(fs.readFileSync(state, 'utf8')), snapshot };
};

test('over SSH, the reader gets the selection, and its raw rows reach the writer untouched', async () => {
	const { local, res, site, snapshot } = await sshSeed();
	assert.equal(res.status, 0, res.stderr);

	assert.deepEqual(site.evalInput.types, { page: { ids: [7] } });
	assert.ok(site.evalInput.options.includes('page_on_front'));
	assert.deepEqual(local.sent().snapshot.meta, snapshot.meta);
	// narrowed by --only and --ids, so the site's settings stay local
	assert.deepEqual(local.sent().snapshot.options, []);

	// logged in with the entry's key, non-interactively, never with its password
	const ssh = local.calls().filter(call => call.startsWith('ssh '));
	assert.ok(ssh.length > 0 && ssh.every(call => call.includes('-o BatchMode=yes') && !call.includes('sftp-secret')), ssh.join('\n'));
	assert.ok(ssh.some(call => call.includes("u123@ssh.example.com wp --path='wordpress' 'eval-file' '-'")), ssh.join('\n'));
	// no gaps over SSH, and the live URL is replaced locally afterwards
	assert.doesNotMatch(res.stderr, /exposed over REST/);
	assert.ok(local.calls().some(call => call.includes(`search-replace ${replacements('https://example.com', 'https://local.localhost')[0].join(' ')}`)));
});

test('a seed over SSH that names no posts copies the stored settings untouched', async () => {
	const { local, res, snapshot } = await sshSeed(undefined, []);
	assert.equal(res.status, 0, res.stderr);
	assert.deepEqual(local.sent().snapshot.options, snapshot.options);
});

// the URL comes from the live site and reaches a local shell, which must take it as one argument
test("a live URL the shell would act on reaches search-replace as written", async () => {
	const marker = path.join(makeTmpDir(), 'ran'),
		home = `https://example.com/it's'; touch ${marker}; echo '`,
		{ local, res } = await sshSeed(home);
	assert.equal(res.status, 0, res.stderr);
	assert.ok(!fs.existsSync(marker), 'the URL ran as a command');
	assert.ok(local.calls().some(call => call.includes(`search-replace ${replacements(home, 'https://local.localhost')[0].join(' ')}`)), local.calls().join('\n'));
});

// WordPress in a subdirectory: replacing home first would leave `/wp` on every siteurl link
test('a siteurl under home is replaced before home', async () => {
	const { local, res } = await sshSeed(undefined, undefined, 'https://example.com/wp'),
		replaced = local.calls().filter(call => call.includes('search-replace'));
	assert.equal(res.status, 0, res.stderr);
	assert.ok(replaced[0]?.includes(`search-replace ${replacements('https://example.com/wp', 'https://local.localhost')[0].join(' ')}`), replaced.join('\n'));
});
