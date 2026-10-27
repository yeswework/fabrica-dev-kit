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
	{ SSH_STUB_BODY, WP_STUB_BODY } = require('../helpers/wp-cli-stub');

after(cleanTmpDirs);

const PASSWORD = 'abcd efgh ijkl mnop qrst uvwx',
	AUTH = `Basic ${Buffer.from(`editor:${PASSWORD}`).toString('base64')}`;

// A live block-theme site over REST: page 8 under page 6, which the page query alone doesn't return,
// a database template and a theme-file one, global styles, and an image the front page renders
const startSite = async () => {
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
				res.writeHead(200, { 'Content-Type': 'application/json', 'X-WP-TotalPages': '1' });
				res.end(JSON.stringify(data));
			};
		requests.push({ method: req.method, route, query: url.search });
		if (route === '/') { return send({ home: site.url, namespaces: ['wp/v2'] }); }
		if (req.headers.authorization !== AUTH) {
			res.writeHead(401);
			return res.end('{"code":"incorrect_password"}');
		}
		const routes = {
			'/wp/v2/users/me': { name: 'editor' },
			'/wp/v2/types': { page: { rest_base: 'pages', rest_namespace: 'wp/v2', taxonomies: [] }, post: { rest_base: 'posts', taxonomies: [] } },
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
		};
		if (!(route in routes)) {
			res.writeHead(404);
			return res.end('{"code":"rest_no_route"}');
		}
		send(routes[route]);
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

const withSite = async (body, seed = '') => {
	const site = await startSite();
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
		const replaced = local.calls().filter(call => call.includes('search-replace'));
		assert.equal(replaced.length, 2);
		assert.ok(replaced[0].includes(`${site.url} https://local.localhost`));
		assert.ok(replaced[1].includes(site.url.replace(/\//g, '\\/')));
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
	}, '  seed:\n    post: false'));

// A seed of page 7 over SSH from a live site whose home is `home`
const sshSeed = async (home = 'https://example.com') => {
	const state = path.join(makeTmpDir(), 'site.json'),
		// stored rows as the reader prints them: serialized meta and options stay raw strings
		snapshot = {
			source: { home, siteurl: home, stylesheet: 'theme' },
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
		res = await runFdk(['seed', 'production', '--only', 'page', '--ids', '7'], { cwd: dir, env: { PATH: local.path, FDK_WP_STATE: state } });
	return { local, res, site: JSON.parse(fs.readFileSync(state, 'utf8')), snapshot };
};

test('over SSH, the reader gets the selection, and its raw rows reach the writer untouched', async () => {
	const { local, res, site, snapshot } = await sshSeed();
	assert.equal(res.status, 0, res.stderr);

	assert.deepEqual(site.evalInput.types, { page: { ids: [7] } });
	assert.ok(site.evalInput.options.includes('page_on_front'));
	assert.deepEqual(local.sent().snapshot.meta, snapshot.meta);
	assert.deepEqual(local.sent().snapshot.options, snapshot.options);

	// logged in with the entry's key, non-interactively, never with its password
	const ssh = local.calls().filter(call => call.startsWith('ssh '));
	assert.ok(ssh.length > 0 && ssh.every(call => call.includes('-o BatchMode=yes') && !call.includes('sftp-secret')), ssh.join('\n'));
	assert.ok(ssh.some(call => call.includes("u123@ssh.example.com wp --path='wordpress' 'eval-file' '-'")), ssh.join('\n'));
	// no gaps over SSH, and the live URL is replaced locally afterwards
	assert.doesNotMatch(res.stderr, /exposed over REST/);
	assert.ok(local.calls().some(call => call.includes('search-replace') && call.includes('https://example.com https://local.localhost')));
});

// the URL comes from the live site and reaches a local shell, which must take it as one argument
test("a live URL the shell would act on reaches search-replace as written", async () => {
	const marker = path.join(makeTmpDir(), 'ran'),
		home = `https://example.com/it's'; touch ${marker}; echo '`,
		{ local, res } = await sshSeed(home);
	assert.equal(res.status, 0, res.stderr);
	assert.ok(!fs.existsSync(marker), 'the URL ran as a command');
	assert.ok(local.calls().some(call => call.includes(`search-replace ${home} https://local.localhost`)), local.calls().join('\n'));
});
