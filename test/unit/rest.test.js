'use strict';

const assert = require('node:assert/strict'),
	{ test } = require('node:test');

const { isPlaceholder } = require('../../lib/rest');

test('isPlaceholder recognises what a config holds before the real value is pasted in', () => {
	for (const value of [undefined, null, '', '  ', '<wp username>', 'xxxx xxxx xxxx xxxx xxxx xxxx', 42]) {
		assert.ok(isPlaceholder(value), `${JSON.stringify(value)} should read as a placeholder`);
	}
});

test('isPlaceholder passes real values', () => {
	for (const value of ['editor', 'abcd efgh ijkl mnop qrst uvwx', 'https://www.codastory.com', 'xavier']) {
		assert.ok(!isPlaceholder(value), `${JSON.stringify(value)} should not read as a placeholder`);
	}
});
