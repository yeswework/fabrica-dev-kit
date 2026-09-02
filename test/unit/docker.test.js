'use strict';

const assert = require('node:assert/strict'),
	{ after, beforeEach, test } = require('node:test'),
	fs = require('fs'),
	http = require('http'),
	path = require('path');

const { getDBPort, getServicesPorts, getWebPort, waitForWebContainer } = require('../../lib/docker'),
	{ project } = require('../../lib/project'),
	{ requireLib, runNode } = require('../helpers/run'),
	{ stubBin } = require('../helpers/stub-bin'),
	{ cleanTmpDirs, makeTmpDir } = require('../helpers/tmpdir');

after(cleanTmpDirs);

// Docker assigns these ports itself, so FDK asks `docker compose port` for them. The stub answers
// in the shape Docker does — `0.0.0.0:<port>` — which is what the getters have to strip
const DOCKER_STUB = `
case "$*" in
	*"port web 80"*) printf '0.0.0.0:%s\\n' "\${DOCKER_STUB_WEB_PORT:-50000}" ;;
	*"port db 3306"*) printf '0.0.0.0:%s\\n' "\${DOCKER_STUB_DB_PORT:-50001}" ;;
	*"port mailpit 8025"*) printf '0.0.0.0:%s\\n' "\${DOCKER_STUB_MAILPIT_PORT:-50002}" ;;
esac
exit 0
`;

let docker, savedPath;

beforeEach(() => {
	docker = stubBin({ docker: DOCKER_STUB });
	savedPath = process.env.PATH;
	process.env.PATH = docker.path;
	// the getters cache into the shared project object; each case starts from a cold cache
	delete project.webPort;
	delete project.dbPort;
});

const restore = () => { process.env.PATH = savedPath; };

test('the web port is read from Docker and stripped of its host', () => {
	try {
		process.env.DOCKER_STUB_WEB_PORT = '53465';
		assert.equal(getWebPort(), '53465');
	} finally { restore(); delete process.env.DOCKER_STUB_WEB_PORT; }
});

test('a second read comes from the cache, not from Docker', () => {
	try {
		getWebPort();
		getWebPort();
		getDBPort();
		getDBPort();
		assert.deepEqual(docker.calls(), ['compose port web 80', 'compose port db 3306']);
	} finally { restore(); }
});

test('forcing a re-check goes back to Docker', () => {
	try {
		getWebPort();
		getWebPort(true);
		assert.equal(docker.calls().length, 2);
	} finally { restore(); }
});

test('extra services are listed only when docker-compose.yml declares them', () => {
	restore();
	const withMailpit = makeTmpDir('fdk-compose-'),
		without = makeTmpDir('fdk-compose-'),
		read = cwd => JSON.parse(runNode(
			`console.log(JSON.stringify(${requireLib('docker')}.getServicesPorts()))`,
			{ cwd, env: { PATH: docker.path } }).stdout.trim());
	fs.writeFileSync(path.join(withMailpit, 'docker-compose.yml'),
		'services:\n  wp: {}\n  mailpit:\n    image: axllent/mailpit\n');
	fs.writeFileSync(path.join(without, 'docker-compose.yml'), 'services:\n  wp: {}\n');

	assert.deepEqual(read(withMailpit), [{ icon: '📨', name: 'Mailpit', port: '50002' }]);
	assert.deepEqual(read(without), []);
});

// `waitForWebContainer` polls the port Docker reports until WordPress answers on it
test('waiting for the web container resolves once it answers', async () => {
	const server = http.createServer((req, res) => { res.writeHead(200); res.end('ok'); });
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	try {
		process.env.DOCKER_STUB_WEB_PORT = String(server.address().port);
		const [success, port] = await waitForWebContainer(true);
		assert.equal(success, true);
		assert.equal(port, String(server.address().port));
	} finally {
		restore();
		delete process.env.DOCKER_STUB_WEB_PORT;
		server.close();
	}
});
