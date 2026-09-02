'use strict';

const assert = require('node:assert/strict'),
	{ after, test } = require('node:test');

const { checkPortless, removePortlessAlias, setupPortlessAlias } = require('../../lib/portless'),
	{ stubBin } = require('../helpers/stub-bin'),
	{ cleanTmpDirs, makeTmpDir } = require('../helpers/tmpdir');

after(cleanTmpDirs);

// `portless list` is the only source of truth for the alias URL — the proxy picks the protocol and
// port, so FDK reads them back rather than assuming. This stub is what lets the parsing be tested
// against the shapes that reading produces
const PORTLESS_STUB = `
case "$1" in
	list) printf '%s\\n' "$PORTLESS_STUB_LIST"; exit 0 ;;
	proxy) exit \${PORTLESS_STUB_PROXY_STATUS:-0} ;;
	alias) exit \${PORTLESS_STUB_ALIAS_STATUS:-0} ;;
esac
exit 0
`;

const withPortless = (env, fn) => {
	const stub = env.portless === false
			? { path: makeTmpDir('fdk-no-portless-') }
			: stubBin({ portless: PORTLESS_STUB }),
		saved = { ...process.env };
	Object.assign(process.env, {
		PATH: stub.path,
		// an empty state folder holds no proxy.pid, so the proxy reads as not yet started
		PORTLESS_STATE_DIR: makeTmpDir('fdk-portless-state-'),
		PORTLESS_STUB_ALIAS_STATUS: String(env.aliasStatus ?? 0),
		PORTLESS_STUB_LIST: env.list ?? '',
		PORTLESS_STUB_PROXY_STATUS: String(env.proxyStatus ?? 0),
	});
	try { return fn(stub); } finally {
		for (const key of Object.keys(process.env)) { delete process.env[key]; }
		Object.assign(process.env, saved);
	}
};

test('checkPortless follows PATH', () => {
	assert.equal(withPortless({}, () => checkPortless()), true);
	assert.equal(withPortless({ portless: false }, () => checkPortless()), false);
});

test('an alias with no port in the listing keeps none', () => {
	const url = withPortless({ list: 'site  ->  https://site.localhost' },
		() => setupPortlessAlias('site', 8080));
	assert.equal(url, 'https://site.localhost');
});

test('the standard ports are dropped from the alias URL', () => {
	assert.equal(withPortless({ list: 'https://site.localhost:443' }, () => setupPortlessAlias('site', 8080)),
		'https://site.localhost');
	assert.equal(withPortless({ list: 'http://site.localhost:80' }, () => setupPortlessAlias('site', 8080)),
		'http://site.localhost');
});

test('a non-standard port is kept, whatever the TLD', () => {
	assert.equal(withPortless({ list: 'http://site.test:1355' }, () => setupPortlessAlias('site', 8080)),
		'http://site.test:1355');
	assert.equal(withPortless({ list: 'https://site.loc:8443' }, () => setupPortlessAlias('site', 8080)),
		'https://site.loc:8443');
});

test('a listing without this alias yields null', () => {
	assert.equal(withPortless({ list: 'https://other.localhost' }, () => setupPortlessAlias('site', 8080)), null);
});

test('a proxy or alias command that fails yields null', () => {
	assert.equal(withPortless({ list: 'https://site.localhost', proxyStatus: 1 },
		() => setupPortlessAlias('site', 8080)), null);
	assert.equal(withPortless({ list: 'https://site.localhost', aliasStatus: 1 },
		() => setupPortlessAlias('site', 8080)), null);
});

test('without the portless CLI both helpers decline quietly', () => {
	assert.equal(withPortless({ portless: false }, () => setupPortlessAlias('site', 8080)), null);
	assert.ok(!withPortless({ portless: false }, () => removePortlessAlias('site')));
});

test('removing an alias calls portless with the name', () => {
	const calls = withPortless({}, stub => { removePortlessAlias('site'); return stub.calls(); });
	assert.deepEqual(calls, ['portless alias --remove site']);
});
