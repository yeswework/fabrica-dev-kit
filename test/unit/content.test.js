'use strict';

const assert = require('node:assert/strict'),
	{ test } = require('node:test');

const { patternRefs } = require('../../lib/content');

test('patternRefs finds every synced pattern ref once', () => {
	const markup = '<!-- wp:block {"ref":1} /--><p>x</p><!-- wp:block {"ref":2} /-->\n<!-- wp:block {"ref":1} /-->';
	assert.deepEqual(patternRefs(markup), [1, 2]);
});

test('patternRefs accepts the namespaced form and a pattern with more attributes', () => {
	assert.deepEqual(patternRefs('<!-- wp:core/block {"ref":5,"content":{"a":{"b":"}"}}} /-->'), [5]);
});

test('patternRefs ignores refs on other blocks', () => {
	const markup = '<!-- wp:navigation {"ref":9} /--><!-- wp:blockquote {"ref":3} --><!-- /wp:blockquote -->';
	assert.deepEqual(patternRefs(markup), []);
});

test('patternRefs keeps a ref that is not a number, so it gets refused rather than skipped', () => {
	assert.deepEqual(patternRefs('<!-- wp:block {"ref":"37827"} /-->'), ['37827']);
});

test('patternRefs throws on attributes it cannot read', () => {
	assert.throws(() => patternRefs('<!-- wp:block {"ref":1,} /-->'), /synced pattern's attributes/);
});
