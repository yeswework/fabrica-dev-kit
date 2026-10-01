'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test'),
	fs = require('fs'),
	os = require('os'),
	path = require('path');

const { makeProject } = require('../helpers/project'),
	{ runFdk } = require('../helpers/run'),
	{ stubBin } = require('../helpers/stub-bin'),
	{ cleanTmpDirs, makeTmpDir } = require('../helpers/tmpdir'),
	{ SSH_STUB_BODY, WP_STUB_BODY } = require('../helpers/wp-cli-stub'),
	{ startWpStub } = require('../helpers/wp-stub');

after(cleanTmpDirs);

const MARKUP = '<!-- wp:block {"ref":37827} /-->\n<!-- wp:html --><style>.x{color:red}</style><!-- /wp:html -->',
	KEYED = 'ssh -a -x -p 18765 -i ~/.ssh/site_key';

// A project whose `production` sftp entry logs in with `connect`, plus `rest:` settings when given
const project = ({ connect = KEYED, rest } = {}) => makeProject({ config: [
	'default:', '  themes: []', 'production:', '  extend: default',
	'  ftp:', '    scheme: sftp', '    host: ssh.example.com', '    user: u123', '    password: sftp-secret',
	'    port: 18765', '    path: www/example.com/public_html',
	'    commands:', `      - set sftp:connect-program "${connect}"`,
	...(rest ? ['  rest:', ...Object.entries(rest).map(([key, value]) => `    ${key}: "${value}"`)] : []), ''].join('\n') });

// The remote WordPress, as a JSON file the stubbed WP-CLI reads and writes
const remote = (overrides = {}) => {
	const file = path.join(makeTmpDir(), 'site.json');
	fs.writeFileSync(file, JSON.stringify({ home: 'https://example.com', posts: {}, patterns: {}, admins: ['1'],
		commands: ['sg purge'], calls: [], ...overrides }));
	return { file, read: () => JSON.parse(fs.readFileSync(file, 'utf8')) };
};

const run = (dir, site, args, stubs = {}) => {
	const bin = stubBin({ docker: 'exit 0', ssh: SSH_STUB_BODY, wp: WP_STUB_BODY, ...stubs });
	return runFdk(args, { cwd: dir, env: { PATH: bin.path, FDK_WP_STATE: site.file } })
		.then(res => ({ ...res, ssh: bin.calls().filter(call => call.startsWith('ssh ')) }));
};

const page = raw => ({ 12: { raw, modified_gmt: '2026-09-01 00:00:00' } });

test('over SSH, pull and an unchanged push round-trip the markup byte for byte, saved as an administrator', async () => {
	const site = remote({ posts: page(MARKUP), patterns: { 37827: 'Subnav' } }),
		dir = project(),
		file = path.join(makeTmpDir(), 'page.html');
	let res = await run(dir, site, ['pull', 'production', '12', file]);
	assert.equal(res.status, 0, res.stderr);
	assert.equal(fs.readFileSync(file, 'utf8'), MARKUP);

	res = await run(dir, site, ['push', 'production', '12', file]);
	assert.equal(res.status, 0, res.stderr);
	assert.equal(site.read().posts[12].raw, MARKUP);
	assert.ok(site.read().calls.some(call => call.includes('update') && call.includes('--user=1')));
	assert.match(res.stdout, /Purged the cache with 'wp sg purge'/);

	// the entry's own ssh command, made non-interactive, and never its password
	const call = res.ssh[0];
	assert.ok(call.includes(`-i ${os.homedir()}/.ssh/site_key`), call);
	assert.ok(call.includes('-o BatchMode=yes'), call);
	assert.ok(call.includes("u123@ssh.example.com wp --path='www/example.com/public_html'"), call);
	assert.ok(res.ssh.every(entry => !entry.includes('sftp-secret')));
});

test('over SSH, a draft is pulled by its bare ID', async () => {
	const site = remote({ posts: page('draft') }),
		file = path.join(makeTmpDir(), 'page.html'),
		res = await run(project(), site, ['pull', 'production', '12', file]);
	assert.equal(res.status, 0, res.stderr);
	assert.equal(fs.readFileSync(file, 'utf8'), 'draft');
});

test('over SSH, push refuses a post changed since the pull, and an unpublished pattern ref', async () => {
	const site = remote({ posts: page('a'), patterns: { 1: 'Subnav' } }),
		dir = project(),
		file = path.join(makeTmpDir(), 'page.html');
	await run(dir, site, ['pull', 'production', '12', file]);

	fs.writeFileSync(file, '<!-- wp:block {"ref":455} /-->');
	let res = await run(dir, site, ['push', 'production', '12', file]);
	assert.equal(res.status, 1);
	assert.match(res.stderr, /ref\(s\) 455 are not published patterns on 'ssh\.example\.com'/);

	const state = site.read();
	state.posts[12].modified_gmt = '2026-09-30 12:00:00';
	fs.writeFileSync(site.file, JSON.stringify(state));
	res = await run(dir, site, ['push', 'production', '12', file]);
	assert.equal(res.status, 1);
	assert.match(res.stderr, /has changed on 'ssh\.example\.com' since it was pulled/);
	assert.ok(!site.read().calls.some(call => call.includes('update')));
});

test('over SSH, push refuses a site with no administrator to save as', async () => {
	const site = remote({ posts: page('a'), admins: [] }),
		dir = project(),
		file = path.join(makeTmpDir(), 'page.html');
	await run(dir, site, ['pull', 'production', '12', file]);
	const res = await run(dir, site, ['push', 'production', '12', file]);
	assert.equal(res.status, 1);
	assert.match(res.stderr, /no administrator to save as/);
	assert.ok(!site.read().calls.some(call => call.includes('update')));
});

test('over SSH, a WordPress whose home differs from rest.url is refused', async () => {
	const site = remote({ home: 'https://staging.example.com', posts: page('a') }),
		res = await run(project({ rest: { url: 'https://example.com', user: 'editor', application_password: 'abcd efgh ijkl mnop' } }),
			site, ['pull', 'production', '12']);
	assert.equal(res.status, 1);
	assert.match(res.stderr, /reports its home as 'https:\/\/staging\.example\.com', not 'https:\/\/example\.com'/);
});

test('an sftp entry with no key is not tried over SSH: REST is used', async () => {
	const wp = await startWpStub({ posts: { 12: { type: 'page', raw: 'via rest' } } });
	try {
		const site = remote(),
			file = path.join(makeTmpDir(), 'page.html'),
			res = await run(project({ connect: 'ssh -a -x -p 2222 -o HostKeyAlgorithms=+ssh-rsa',
				rest: { url: wp.url, user: 'editor', application_password: wp.password } }), site, ['pull', 'production', '12', file]);
		assert.equal(res.status, 0, res.stderr);
		assert.equal(fs.readFileSync(file, 'utf8'), 'via rest');
		assert.equal(res.ssh.length, 0);
	} finally {
		await wp.close();
	}
});

test('a host with no WP-CLI falls back to REST when rest: is set, and says so', async () => {
	const wp = await startWpStub({ posts: { 12: { type: 'page', raw: 'via rest' } } });
	try {
		const file = path.join(makeTmpDir(), 'page.html'),
			res = await run(project({ rest: { url: wp.url, user: 'editor', application_password: wp.password } }), remote(),
				['pull', 'production', '12', file], { ssh: 'echo "This service allows sftp connections only." >&2; exit 1' });
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stderr, /sftp connections only[\s\S]*Using the 'rest:' settings over REST instead/);
		assert.equal(fs.readFileSync(file, 'utf8'), 'via rest');
	} finally {
		await wp.close();
	}
});

test('a host with no WP-CLI and no wp: settings is an error naming what the host said', async () => {
	const res = await run(project(), remote(), ['pull', 'production', '12'],
		{ ssh: 'echo "bash: wp: command not found" >&2; exit 127' });
	assert.equal(res.status, 1);
	assert.match(res.stderr, /WP-CLI over SSH on 'ssh\.example\.com' failed: bash: wp: command not found/);
});

test('refs reads the live patterns over SSH', async () => {
	const site = remote({ patterns: { 37827: 'Monetization Kit subnav' } }),
		file = path.join(makeTmpDir(), 'page.html');
	fs.writeFileSync(file, '<!-- wp:block {"ref":37827} /-->');
	const res = await run(project(), site, ['refs', 'production', file, 'to-local'], {
		// `docker compose exec … wp post list` is the local site
		docker: `case "$*" in *"post list"*) printf '%s' '[{"ID":455,"post_title":"Monetization Kit subnav"}]';; esac`,
	});
	assert.equal(res.status, 0, res.stderr);
	assert.equal(fs.readFileSync(file, 'utf8'), '<!-- wp:block {"ref":455} /-->');
});
