'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test'),
	fs = require('fs'),
	path = require('path');

const { makeProject } = require('../helpers/project'),
	{ runFdk } = require('../helpers/run'),
	{ stubBin } = require('../helpers/stub-bin'),
	{ cleanTmpDirs, makeTmpDir } = require('../helpers/tmpdir'),
	{ startWpStub } = require('../helpers/wp-stub');

after(cleanTmpDirs);

// the awkward markup the round trip was proven with on fabri.ca: a JSON className, a synced
// pattern ref, a spaced en dash, an entity, and a wp:html payload that must not be touched
const MARKUP = [
	'<!-- wp:group {"className":"is-style-\\u0022chrome\\u0022"} -->',
	'<div class="wp-block-group"><!-- wp:block {"ref":37827} /-->',
	'<!-- wp:paragraph --><p>Before – after &amp; more</p><!-- /wp:paragraph -->',
	'<!-- wp:html --><style>.x{color:red}</style><iframe src="data:text/html,hi"></iframe><!-- /wp:html --></div>',
	'<!-- /wp:group -->',
].join('\n');

const docker = () => stubBin({ docker: 'exit 0' }).path;

// A project whose `production` section points at `wp`, with `wp` overrides for the credential
const setup = (wp, { section = 'production', settings = {} } = {}) => {
	const values = { url: wp.url, user: 'editor', appPassword: wp.password, ...settings },
		lines = Object.entries(values).filter(([, value]) => value !== undefined)
			.map(([key, value]) => `    ${key}: "${value}"`);
	return makeProject({ config: ['default:', '  themes: []', `${section}:`, '  extend: default', '  wp:', ...lines, ''].join('\n') });
};

const fdk = (dir, ...args) => runFdk(args, { cwd: dir, env: { PATH: docker() } });

// every run's output, checked by one assertion that the credential never shows
const outputs = [];
const run = async (...args) => {
	const res = await fdk(...args);
	outputs.push(res.stdout + res.stderr);
	return res;
};

const withSite = async (options, body) => {
	const wp = await startWpStub(options);
	try {
		await body(wp, setup(wp), makeTmpDir());
	} finally {
		await wp.close();
	}
};

test('pull writes the stored markup byte for byte, and push of it unchanged leaves it identical', () =>
	withSite({ posts: { 12: { type: 'page', raw: MARKUP } }, patterns: { 37827: 'publish' } }, async (wp, dir, tmp) => {
		const file = path.join(tmp, 'page.html');
		let res = await run(dir, 'pull', 'production', '12', file);
		assert.equal(res.status, 0, res.stderr);
		assert.equal(fs.readFileSync(file, 'utf8'), MARKUP);
		assert.equal(JSON.parse(fs.readFileSync(`${file}.fdk.json`, 'utf8')).route, '/wp/v2/pages/12');

		res = await run(dir, 'push', 'production', '12', file);
		assert.equal(res.status, 0, res.stderr);
		assert.equal(wp.posts[12].raw, MARKUP);
		assert.deepEqual(JSON.parse(wp.writes()[0].body), { content: MARKUP });
	}));

test('a second push after a push needs no fresh pull', () =>
	withSite({ posts: { 12: { type: 'page', raw: 'a' } } }, async (wp, dir, tmp) => {
		const file = path.join(tmp, 'page.html');
		await run(dir, 'pull', 'production', '12', file);
		fs.writeFileSync(file, 'b');
		assert.equal((await run(dir, 'push', 'production', '12', file)).status, 0);
		fs.writeFileSync(file, 'c');
		const res = await run(dir, 'push', 'production', '12', file);
		assert.equal(res.status, 0, res.stderr);
		assert.equal(wp.posts[12].raw, 'c');
	}));

test('push refuses when the post changed on the site after the pull', () =>
	withSite({ posts: { 12: { type: 'page', raw: 'a' } } }, async (wp, dir, tmp) => {
		const file = path.join(tmp, 'page.html');
		await run(dir, 'pull', 'production', '12', file);
		wp.posts[12].modified_gmt = '2026-09-30T12:00:00';
		const res = await run(dir, 'push', 'production', '12', file);
		assert.equal(res.status, 1);
		assert.match(res.stderr, /has changed on .* since it was pulled/);
		assert.equal(wp.writes().length, 0);
	}));

test('push refuses a synced pattern ref that is missing or unpublished, naming each', () =>
	withSite({ posts: { 12: { type: 'page', raw: 'a' } }, patterns: { 1: 'publish', 2: 'draft' } }, async (wp, dir, tmp) => {
		const file = path.join(tmp, 'page.html');
		await run(dir, 'pull', 'production', '12', file);
		fs.writeFileSync(file, '<!-- wp:block {"ref":1} /--><!-- wp:block {"ref":2} /--><!-- wp:block {"ref":455} /-->');
		const res = await run(dir, 'push', 'production', '12', file);
		assert.equal(res.status, 1);
		assert.match(res.stderr, /ref\(s\) 2, 455 are not published patterns/);
		assert.equal(wp.writes().length, 0);
	}));

test("a navigation block's ref is not mistaken for a synced pattern", () =>
	withSite({ posts: { 12: { type: 'page', raw: 'a' } } }, async (wp, dir, tmp) => {
		const file = path.join(tmp, 'page.html');
		await run(dir, 'pull', 'production', '12', file);
		fs.writeFileSync(file, '<!-- wp:navigation {"ref":99} /-->');
		const res = await run(dir, 'push', 'production', '12', file);
		assert.equal(res.status, 0, res.stderr);
		assert.ok(!wp.requests.some(request => request.route === '/wp/v2/blocks'));
	}));

test('push refuses a user who cannot save unfiltered HTML', () =>
	withSite({ posts: { 12: { type: 'page', raw: 'a' } }, capabilities: { edit_posts: true } }, async (wp, dir, tmp) => {
		const file = path.join(tmp, 'page.html');
		await run(dir, 'pull', 'production', '12', file);
		const res = await run(dir, 'push', 'production', '12', file);
		assert.equal(res.status, 1);
		assert.match(res.stderr, /can't save unfiltered HTML/);
		assert.equal(wp.writes().length, 0);
	}));

test('push refuses a file with no record of a pull', () =>
	withSite({ posts: { 12: { type: 'page', raw: 'a' } } }, async (wp, dir, tmp) => {
		const file = path.join(tmp, 'page.html');
		fs.writeFileSync(file, 'hand-made');
		const res = await run(dir, 'push', 'production', '12', file);
		assert.equal(res.status, 1);
		assert.match(res.stderr, /has no record of a pull/);
		assert.equal(wp.requests.length, 0);
	}));

test('push refuses a file pulled from another site', async () => {
	const staging = await startWpStub({ posts: { 12: { type: 'page', raw: 'a' } } }),
		live = await startWpStub({ posts: { 12: { type: 'page', raw: 'a' } } });
	try {
		const file = path.join(makeTmpDir(), 'page.html');
		await run(setup(staging), 'pull', 'production', '12', file);
		const res = await run(setup(live), 'push', 'production', '12', file);
		assert.equal(res.status, 1);
		assert.match(res.stderr, /was pulled from/);
		assert.equal(live.writes().length, 0);
	} finally {
		await staging.close();
		await live.close();
	}
});

test('the cache is purged where the site exposes a route, and its absence is no error', async () => {
	for (const namespaces of [['wp/v2', 'siteground-optimizer/v1'], ['wp/v2']]) {
		await withSite({ posts: { 12: { type: 'page', raw: 'a' } }, namespaces }, async (wp, dir, tmp) => {
			const file = path.join(tmp, 'page.html');
			await run(dir, 'pull', 'production', '12', file);
			const res = await run(dir, 'push', 'production', '12', file);
			assert.equal(res.status, 0, res.stderr);
			const purged = wp.requests.some(request => request.route === '/siteground-optimizer/v1/purge-cache');
			assert.equal(purged, namespaces.length > 1);
		});
	}
});

test('a failed purge is reported without failing the push', () =>
	withSite({ posts: { 12: { type: 'page', raw: 'a' } }, namespaces: ['siteground-optimizer/v1'], purgeStatus: 500 }, async (wp, dir, tmp) => {
		const file = path.join(tmp, 'page.html');
		await run(dir, 'pull', 'production', '12', file);
		const res = await run(dir, 'push', 'production', '12', file);
		assert.equal(res.status, 0);
		assert.match(res.stderr, /purging its cache failed/);
	}));

test('a bare ID is resolved through search; a draft needs its type named', () =>
	withSite({ posts: { 7: { type: 'post', raw: 'p' }, 8: { type: 'page', raw: 'd', status: 'draft' } } }, async (wp, dir, tmp) => {
		let res = await run(dir, 'pull', 'production', '7', path.join(tmp, 'post.html'));
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /\/wp\/v2\/posts\/7/);

		res = await run(dir, 'pull', 'production', '8', path.join(tmp, 'draft.html'));
		assert.equal(res.status, 1);
		assert.match(res.stderr, /pages\/8/);

		res = await run(dir, 'pull', 'production', 'pages/8', path.join(tmp, 'draft.html'));
		assert.equal(res.status, 0, res.stderr);
		assert.equal(fs.readFileSync(path.join(tmp, 'draft.html'), 'utf8'), 'd');
	}));

test('a section with no wp: settings, or a placeholder in them, is refused before any request', async () => {
	const wp = await startWpStub();
	try {
		const bare = makeProject({ config: 'default:\n  themes: []\nproduction:\n  extend: default\n' });
		let res = await run(bare, 'pull', 'production', '12');
		assert.equal(res.status, 1);
		assert.match(res.stderr, /No 'wp:' settings under 'production'/);

		for (const settings of [{ user: '<wp username>' }, { appPassword: 'xxxx xxxx xxxx xxxx xxxx xxxx' }, { appPassword: undefined }]) {
			res = await run(setup(wp, { settings }), 'pull', 'production', '12');
			assert.equal(res.status, 1);
			assert.match(res.stderr, /missing or still a placeholder/);
		}
		assert.equal(wp.requests.length, 0);
	} finally {
		await wp.close();
	}
});

test('plain http to anything but a local site is refused before any request', async () => {
	const dir = setup({ url: 'http://example.com', password: 'abcd efgh ijkl mnop qrst uvwx' }),
		res = await run(dir, 'pull', 'production', '12');
	assert.equal(res.status, 1);
	assert.match(res.stderr, /must be https/);
});

test('a site whose home differs from the configured url is refused before the credential is sent', () =>
	withSite({ home: 'https://staging.example.com', posts: { 12: { type: 'page', raw: 'a' } } }, async (wp, dir) => {
		const res = await run(dir, 'pull', 'production', '12');
		assert.equal(res.status, 1);
		assert.match(res.stderr, /reports its home as 'https:\/\/staging\.example\.com'/);
		assert.ok(wp.requests.every(request => !request.authorization));
	}));

test('a site that redirects is refused, rather than followed with the credential dropped', async () => {
	const server = require('http').createServer((req, res) => {
		res.writeHead(301, { Location: 'https://www.example.com/wp-json/' });
		res.end();
	});
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	try {
		const url = `http://127.0.0.1:${server.address().port}`,
			res = await run(setup({ url, password: 'abcd efgh ijkl mnop qrst uvwx' }), 'pull', 'production', '12');
		assert.equal(res.status, 1);
		assert.match(res.stderr, /redirects to 'https:\/\/www\.example\.com\/wp-json\/'/);
	} finally {
		await new Promise(resolve => server.close(resolve));
	}
});

test("a wrong password is reported in the site's own words", () =>
	withSite({}, async wp => {
		const res = await run(setup({ url: wp.url, password: 'wrong wrong wrong' }), 'pull', 'production', '12');
		assert.equal(res.status, 1);
		assert.match(res.stderr, /invalid application password/);
	}));

test('a request that arrives without credentials is reported as a stripped header, not a wrong password', () =>
	withSite({ stripAuth: true }, async (wp, dir) => {
		const res = await run(dir, 'pull', 'production', '12');
		assert.equal(res.status, 1);
		assert.match(res.stderr, /stripping the Authorization header/);
	}));

// `docker compose exec … wp post list` answers with the local site's patterns, as WP-CLI's JSON
const localSite = patterns => stubBin({
	docker: `case "$*" in *"post list"*) printf '%s' '${JSON.stringify(patterns.map(([ID, post_title]) => ({ ID, post_title })))}';; esac`,
}).path;
const refsRun = async (dir, patterns, ...args) => {
	const res = await runFdk(args, { cwd: dir, env: { PATH: localSite(patterns) } });
	outputs.push(res.stdout + res.stderr);
	return res;
};

const LIVE_PAGE = '<!-- wp:block {"ref":37827} /--><!-- wp:navigation {"ref":37827} /--><!-- wp:block {"ref":3782} /-->';

test('refs swaps pattern IDs by title and back, touching nothing else, and push waits for to-live', () =>
	withSite({ posts: { 12: { type: 'page', raw: LIVE_PAGE } },
		patterns: { 37827: { status: 'publish', title: 'Monetization Kit subnav' }, 3782: { status: 'publish', title: 'Footer' } } },
	async (wp, dir, tmp) => {
		const file = path.join(tmp, 'page.html'),
			local = [[455, 'Monetization Kit subnav'], [3782, 'Footer']];
		await run(dir, 'pull', 'production', '12', file);

		let res = await refsRun(dir, local, 'refs', 'production', file, 'to-local');
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /Monetization Kit subnav: 37827 → 455/);
		assert.equal(fs.readFileSync(file, 'utf8'),
			'<!-- wp:block {"ref":455} /--><!-- wp:navigation {"ref":37827} /--><!-- wp:block {"ref":3782} /-->');

		res = await run(dir, 'push', 'production', '12', file);
		assert.equal(res.status, 1);
		assert.match(res.stderr, /holds the local site's pattern IDs/);

		res = await refsRun(dir, local, 'refs', 'production', file, 'to-live');
		assert.equal(res.status, 0, res.stderr);
		assert.equal(fs.readFileSync(file, 'utf8'), LIVE_PAGE);
		res = await run(dir, 'push', 'production', '12', file);
		assert.equal(res.status, 0, res.stderr);
	}));

test("refs reads every page of the site's patterns", () => {
	const patterns = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [1000 + i, { status: 'publish', title: `Pattern ${i}` }]));
	return withSite({ patterns }, async (wp, dir, tmp) => {
		const file = path.join(tmp, 'page.html');
		fs.writeFileSync(file, '<!-- wp:block {"ref":1149} /-->');
		const res = await refsRun(dir, [[7, 'Pattern 149']], 'refs', 'production', file, 'to-local');
		assert.equal(res.status, 0, res.stderr);
		assert.equal(fs.readFileSync(file, 'utf8'), '<!-- wp:block {"ref":7} /-->');
	});
});

test('refs refuses a title shared by two patterns on the other side, and rewrites nothing', () =>
	withSite({ patterns: { 1: { status: 'publish', title: 'Subnav' }, 2: { status: 'publish', title: 'CTA' } } }, async (wp, dir, tmp) => {
		const file = path.join(tmp, 'page.html'),
			markup = '<!-- wp:block {"ref":2} /--><!-- wp:block {"ref":1} /-->';
		fs.writeFileSync(file, markup);
		const res = await refsRun(dir, [[20, 'CTA'], [10, 'Subnav'], [11, 'Subnav']], 'refs', 'production', file, 'to-local');
		assert.equal(res.status, 1);
		assert.match(res.stderr, /'Subnav' names 2 patterns on the other side \(10, 11\)/);
		assert.equal(fs.readFileSync(file, 'utf8'), markup);
	}));

test('refs leaves a ref with no counterpart alone and says so', () =>
	withSite({ patterns: { 1: { status: 'publish', title: 'Only live' } } }, async (wp, dir, tmp) => {
		const file = path.join(tmp, 'page.html');
		fs.writeFileSync(file, '<!-- wp:block {"ref":1} /--><!-- wp:block {"ref":99} /-->');
		const res = await refsRun(dir, [[5, 'Other']], 'refs', 'production', file, 'to-local');
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stderr, /'Only live' \(1\) has no published pattern of that title/);
		assert.match(res.stderr, /Ref 99 is no published pattern/);
		assert.equal(fs.readFileSync(file, 'utf8'), '<!-- wp:block {"ref":1} /--><!-- wp:block {"ref":99} /-->');
	}));

test('refs says so when the local site cannot be read', () =>
	withSite({}, async (wp, dir, tmp) => {
		const file = path.join(tmp, 'page.html');
		fs.writeFileSync(file, '<!-- wp:block {"ref":1} /-->');
		const res = await runFdk(['refs', 'production', file, 'to-local'],
			{ cwd: dir, env: { PATH: stubBin({ docker: 'echo "service wp is not running" >&2; exit 1' }).path } });
		assert.equal(res.status, 1);
		assert.match(res.stderr, /Could not read the local site's synced patterns: is it running\?\nservice wp is not running/);
	}));

test('a relative file path is taken from where fdk was run, not the project root', () =>
	withSite({ posts: { 12: { type: 'page', raw: 'a' } } }, async (wp, dir) => {
		const sub = path.join(dir, 'notes');
		fs.mkdirSync(sub);
		const res = await runFdk(['pull', 'production', '12', 'page.html'], { cwd: sub, env: { PATH: docker() } });
		assert.equal(res.status, 0, res.stderr);
		assert.equal(fs.readFileSync(path.join(sub, 'page.html'), 'utf8'), 'a');
	}));

test('the credential never appears in any output', () => {
	assert.ok(outputs.length > 10);
	for (const output of outputs) {
		assert.ok(!output.includes('abcd efgh ijkl mnop qrst uvwx'));
		assert.ok(!output.includes(Buffer.from('editor:abcd efgh ijkl mnop qrst uvwx').toString('base64')));
	}
});
