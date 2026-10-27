'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test'),
	fs = require('fs'),
	http = require('http'),
	path = require('path'),
	yaml = require('js-yaml');

const { makeProject } = require('../helpers/project'),
	{ runFdk } = require('../helpers/run'),
	{ stubBin } = require('../helpers/stub-bin'),
	{ cleanTmpDirs } = require('../helpers/tmpdir');

after(cleanTmpDirs);

const THEME_VOLUME = './mytheme:/var/www/html/wp-content/themes/mytheme',
	COMPOSE = yaml.dump({
		services: {
			web: { image: 'nginx', volumes: ['./www:/var/www/html', THEME_VOLUME] },
			wp: { image: 'wordpress', environment: {}, volumes: ['./www:/var/www/html', THEME_VOLUME] },
		},
		volumes: {},
	});

// `config:resources` diffs the config against `docker-compose.yml` and rewrites the file, so a
// config it could not read must stop it before the diff — an unreadable config that reads as
// 'no resources' is indistinguishable from one that says 'unmount everything'
const configResources = async ({ config, webPort, portless = false, compose = COMPOSE }) => {
	const dir = makeProject({
		config,
		resources: { mytheme: { files: { 'style.css': '/* theme */' }, git: false } },
	});
	fs.writeFileSync(path.join(dir, 'docker-compose.yml'), compose);

	// `configResources` calls `removePortlessAlias` on every run, so a test that inherited the
	// developer's PATH would reach the real Portless and touch real aliases. Either stub it and
	// watch what it was asked to do, or declare it absent — both narrow the child's PATH to the
	// stub folder alone
	const dockerBody = webPort
		? `case "$*" in *"port web 80"*) printf '0.0.0.0:%s\\n' "${webPort}" ;; esac\nexit 0`
		: 'exit 0';
	const docker = portless
		? stubBin({ docker: dockerBody, portless: 'exit 0' }, { isolate: true })
		: stubBin({ docker: dockerBody }, { absent: ['portless'] });
	const res = await runFdk(['config:resources'], { cwd: dir, env: { PATH: docker.path } });
	return {
		calls: docker.calls(),
		compose: fs.readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8'),
		output: res.stdout + res.stderr,
		status: res.status,
	};
};

const volumesOf = compose => yaml.load(compose).services.wp.volumes;

test('a config.yml that will not parse leaves docker-compose.yml untouched', async () => {
	const run = await configResources({ config: 'default:\n  themes: [unclosed\n' });
	assert.equal(run.status, 1);
	assert.equal(run.compose, COMPOSE, 'docker-compose.yml was rewritten');
	assert.ok(!run.calls.some(call => call.includes('up')), 'containers were recreated');
	assert.match(run.output, /Error loading 'config.yml'/);
});

test('a config.yml that is not there leaves docker-compose.yml untouched', async () => {
	const run = await configResources({});
	assert.equal(run.status, 1);
	assert.equal(run.compose, COMPOSE);
	assert.ok(!run.calls.some(call => call.includes('up')));
});

test('a config.yml still listing the resource changes nothing and starts nothing', async () => {
	const run = await configResources({ config: 'default:\n  themes:\n    - ./mytheme\n' });
	assert.equal(run.status, 0);
	assert.deepEqual(volumesOf(run.compose), ['./www:/var/www/html', THEME_VOLUME]);
	assert.ok(!run.calls.some(call => call.includes('up')));
});

// the other half of the bug: a config that genuinely lists nothing *should* unmount, and still does
test('a config.yml that genuinely lists no resources still unmounts them', async () => {
	const server = http.createServer((req, res) => { res.writeHead(200); res.end('ok'); });
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	try {
		const run = await configResources({ config: 'default:\n  use: []\n', webPort: server.address().port });
		assert.equal(run.status, 0);
		assert.deepEqual(volumesOf(run.compose), ['./www:/var/www/html']);
		assert.ok(run.calls.some(call => call.includes('compose up -d --remove-orphans')));
	} finally { server.close(); }
});

// ——— the Portless cleanup, which used to read its slug off the wrong `project` ————

test('dropping portless from `use` removes that project\'s alias, by slug', async () => {
	const run = await configResources({
		config: 'default:\n  use: []\n  themes:\n    - ./mytheme\n',
		portless: true,
	});
	assert.equal(run.status, 0);
	// `testproj` is the name in the project's package.json — the state object's slug, not the
	// `default` section name the command was invoked with
	assert.deepEqual(run.calls.filter(call => call.startsWith('portless')),
		['portless alias --remove testproj']);
	assert.ok(!run.calls.some(call => call.includes('undefined')));
});

test('a project still using portless keeps its alias', async () => {
	const server = http.createServer((req, res) => { res.writeHead(200); res.end('ok'); });
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	try {
		const run = await configResources({
			config: 'default:\n  use:\n    - portless\n  themes:\n    - ./mytheme\n',
			portless: true,
			webPort: server.address().port,
		});
		assert.equal(run.status, 0);
		assert.deepEqual(run.calls.filter(call => call.includes('alias --remove')), []);
	} finally { server.close(); }
});

// ——— the Portless header trust, which used to replace a project's own WORDPRESS_CONFIG_EXTRA ————

const PORTLESS_CONFIG = 'default:\n  use:\n    - portless\n  themes:\n    - ./mytheme\n',
	CUSTOM_EXTRA = "define('WP_CACHE', false);\n",
	composeWithExtra = extra => yaml.dump({
		...yaml.load(COMPOSE),
		services: {
			...yaml.load(COMPOSE).services,
			wp: { ...yaml.load(COMPOSE).services.wp, environment: { WORDPRESS_CONFIG_EXTRA: extra } },
		},
	}),
	extraOf = compose => yaml.load(compose).services.wp.environment.WORDPRESS_CONFIG_EXTRA;

const withWebServer = async fn => {
	const server = http.createServer((req, res) => { res.writeHead(200); res.end('ok'); });
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	try { return await fn(server.address().port); } finally { server.close(); }
};

test('portless keeps a project\'s own WORDPRESS_CONFIG_EXTRA and adds its block once', () => withWebServer(async webPort => {
	const first = await configResources({
		compose: composeWithExtra(CUSTOM_EXTRA), config: PORTLESS_CONFIG, portless: true, webPort,
	});
	assert.equal(first.status, 0);
	const extra = extraOf(first.compose);
	assert.ok(extra.endsWith(CUSTOM_EXTRA), 'the custom content was lost');
	assert.equal(extra.match(/HTTP_X_PORTLESS_HOPS/g).length, 1);
	assert.ok(first.calls.some(call => call.includes('compose up')));

	const again = await configResources({ compose: first.compose, config: PORTLESS_CONFIG, portless: true });
	assert.equal(again.compose, first.compose, 'a second run rewrote docker-compose.yml');
	assert.ok(!again.calls.some(call => call.includes('compose up')), 'a second run recreated containers');
}));

test('a project migrated to portless before keeps its value and starts nothing', async () => {
	const block = await withWebServer(webPort => configResources({ config: PORTLESS_CONFIG, portless: true, webPort }));
	const run = await configResources({ compose: block.compose, config: PORTLESS_CONFIG, portless: true });
	assert.equal(run.compose, block.compose);
	assert.ok(!run.calls.some(call => call.includes('compose up')));
});

test('a project not using portless keeps WORDPRESS_CONFIG_EXTRA as it is', async () => {
	const compose = composeWithExtra(CUSTOM_EXTRA),
		run = await configResources({ compose, config: 'default:\n  themes:\n    - ./mytheme\n' });
	assert.equal(run.compose, compose);
});
