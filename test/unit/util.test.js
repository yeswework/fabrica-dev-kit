'use strict';

const assert = require('node:assert/strict'),
	{ test } = require('node:test');

const { echo, execGet, warn } = require('../../lib/util'),
	{ runNode } = require('../helpers/run');

const capture = (stream, fn) => {
	const written = [],
		original = console[stream];
	console[stream] = (...args) => written.push(args.join(' '));
	try { fn(); } finally { console[stream] = original; }
	return written;
};

test('echo prefixes the FDK banner and a default icon', () => {
	assert.deepEqual(capture('log', () => echo('hello')), ['\x1b[7m[FDK]\x1b[27m 🏭  hello']);
});

test('echo takes a different icon', () => {
	assert.match(capture('log', () => echo('hello', '📛'))[0], /📛 {2}hello$/);
});

test('warn goes to stderr, not stdout', () => {
	assert.deepEqual(capture('log', () => warn('careful')), []);
	assert.match(capture('error', () => warn('careful'))[0], /⚠️ {2}careful$/);
});

test('execGet trims the trailing newline a shell leaves behind', () => {
	assert.equal(execGet('printf "value\\n"'), 'value');
});

// `halt` is the reason most of this suite's error cases run in a child process
test('halt warns and exits non-zero', () => {
	const res = runNode(`require('./lib/util').halt('stop right there'); console.log('unreachable');`);
	assert.equal(res.status, 1);
	assert.match(res.stderr, /stop right there/);
	assert.doesNotMatch(res.stdout, /unreachable/);
});
