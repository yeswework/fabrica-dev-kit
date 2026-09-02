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
const configResources = async ({ config, webPort }) => {
	const dir = makeProject({
		config,
		resources: { mytheme: { files: { 'style.css': '/* theme */' }, git: false } },
	});
	fs.writeFileSync(path.join(dir, 'docker-compose.yml'), COMPOSE);

	// `portless` is declared absent rather than stubbed, which narrows the child's PATH to the
	// stub folder alone. `configResources` calls `removePortlessAlias` on every run, and with the
	// developer's own PATH inherited that would reach the real Portless and touch real aliases
	const docker = stubBin({ docker: webPort
		? `case "$*" in *"port web 80"*) printf '0.0.0.0:%s\\n' "${webPort}" ;; esac\nexit 0`
		: 'exit 0' }, { absent: ['portless'] });
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
