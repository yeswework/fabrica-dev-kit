'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test'),
	fs = require('fs'),
	http = require('http'),
	path = require('path');

const { makeProject } = require('../helpers/project'),
	{ runFdk } = require('../helpers/run'),
	{ stubBin } = require('../helpers/stub-bin'),
	{ cleanTmpDirs, makeTmpDir } = require('../helpers/tmpdir');

after(cleanTmpDirs);

const listen = () => new Promise(resolve => {
	const server = http.createServer((req, res) => { res.writeHead(200); res.end('ok'); });
	server.listen(0, '127.0.0.1', () => resolve(server));
});

// a port nothing answers on: the one a crashed nginx held before Docker restarted it
const deadPort = async () => {
	const server = await listen(),
		{ port } = server.address();
	await new Promise(resolve => server.close(resolve));
	return port;
};

// fabrica-dev-kit-7pz: `web` was recreated and restarted again on a new port after config:url had
// read the old one, so the alias pointed at a port nothing served. Docker here reports the dead
// port first and the live one after, as it does across that restart
test('config:url aliases the port the web container answers on, and the mail UI beside it', async () => {
	const oldPort = await deadPort(),
		server = await listen();
	try {
		const dir = makeProject({ config: 'default:\n  use: [portless, mailpit]\n' }),
			state = makeTmpDir('fdk-docker-state-');
		fs.writeFileSync(path.join(dir, 'docker-compose.yml'),
			'services:\n  web: {}\n  wp: {}\n  mailpit: {}\n');
		const bin = stubBin({
			docker: `case "$*" in
	*"port web 80"*) if [ -e '${state}/seen' ]; then echo 0.0.0.0:${server.address().port}; else : > '${state}/seen'; echo 0.0.0.0:${oldPort}; fi ;;
	*"port mailpit 8025"*) echo 0.0.0.0:61026 ;;
	*"port db 3306"*) echo 0.0.0.0:61000 ;;
	*"option get siteurl"*) echo https://testproj.localhost ;;
esac`,
			portless: `[ "$1" = list ] && printf '%s\\n' https://testproj.localhost https://testproj-mail.localhost
exit 0`,
		}, { isolate: true });
		const res = await runFdk(['config:url'], {
			cwd: dir,
			env: { PATH: bin.path, PORTLESS_STATE_DIR: makeTmpDir('fdk-portless-state-') },
		});
		assert.equal(res.status, 0, res.stderr);
		assert.deepEqual(bin.calls().filter(call => call.startsWith('portless alias')), [
			`portless alias testproj ${server.address().port} --force`,
			'portless alias testproj-mail 61026 --force',
		]);
		// the stored URL already matches the alias, so the database is left alone
		assert.ok(!bin.calls().some(call => call.includes('search-replace')));
	} finally { server.close(); }
});
