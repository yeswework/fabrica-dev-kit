'use strict';

const assert = require('node:assert/strict'),
	{ test } = require('node:test');

const { DEFAULT_TYPES, imageIds, multiValued, narrow, replacements, restMedia, restMenuItem, restPost, restTemplate, selection } = require('../../lib/seed');

test('selection defaults to Fabrica Export: posts from the last 6 months, everything else in full', () => {
	const types = selection();
	assert.deepEqual(Object.keys(types), Object.keys(DEFAULT_TYPES));
	assert.deepEqual(types.post, { months: 6 });
	assert.deepEqual(types.page, {});
	assert.deepEqual(types.wp_global_styles, {});
});

test("selection takes the section's seed: block: false drops a type, true or settings add one", () => {
	const types = selection({ post: false, page: { limit: 3 }, product: true, event: { ids: '4, 5' } });
	assert.equal(types.post, undefined);
	assert.deepEqual(types.page, { limit: 3 });
	assert.deepEqual(types.product, {});
	assert.deepEqual(types.event, { ids: [4, 5] });
});

test('--only keeps just the named types, with their configured settings, even one the config dropped', () => {
	assert.deepEqual(selection({ page: { limit: 3 }, post: false }, { only: 'page,post' }), { page: { limit: 3 }, post: {} });
});

test('flags apply to every type left, and --months 0 lifts a configured window', () => {
	assert.deepEqual(selection({}, { only: 'post,page', limit: '2' }), { post: { limit: 2, months: 6 }, page: { limit: 2 } });
	assert.deepEqual(selection({}, { only: 'post', months: '0' }), { post: {} });
	assert.deepEqual(selection({}, { only: 'page', ids: '7,9' }), { page: { ids: [7, 9] } });
});

// a menu item's date is when it was added, global styles' when first saved, and REST serves neither
test('no months window applies to menu items or global styles, from the flags or the config', () => {
	assert.deepEqual(selection({}, { only: 'nav_menu_item,wp_global_styles,post', months: '3' }),
		{ nav_menu_item: {}, wp_global_styles: {}, post: { months: 3 } });
	assert.deepEqual(selection({ nav_menu_item: { months: 2, limit: 5 } }, { only: 'nav_menu_item' }), { nav_menu_item: { limit: 5 } });
});

test('selection refuses what it cannot read', () => {
	assert.throws(() => selection({ page: { since: 3 } }), /unknown setting\(s\) since/);
	assert.throws(() => selection({ page: { limit: 'many' } }), /seed\.page\.limit/);
	assert.throws(() => selection({}, { only: 'page', ids: '7,x' }), /'x', which is not a post ID/);
	assert.throws(() => selection({ page: 'all' }), /must be true, false, or settings/);
	assert.throws(() => selection(['page']), /must map post types/);
});

test('imageIds finds every attachment core renders by ID', () => {
	const markup = '<img class="wp-image-12"/><figure class="wp-block-image size-large"><img class="x wp-image-3 y"/></figure><p>wp-image-</p>';
	assert.deepEqual(imageIds(markup), [12, 3]);
});

test('narrow filters by ID and age, newest first, then limits', () => {
	const items = [{ id: 1, at: '2020-01-01' }, { id: 2, at: '2099-01-01' }, { id: 3, at: '2098-01-01' }],
		id = item => item.id,
		at = item => item.at;
	assert.deepEqual(narrow(items, {}, id, at).map(id), [2, 3, 1]);
	assert.deepEqual(narrow(items, { months: 1 }, id, at).map(id), [2, 3]);
	assert.deepEqual(narrow(items, { ids: [1, 3] }, id, at).map(id), [3, 1]);
	assert.deepEqual(narrow(items, { limit: 1 }, id, at).map(id), [2]);
});

test('restPost keeps the stored values and turns template and featured image into their meta', () => {
	const { post, meta } = restPost({
		id: 7, status: 'publish', slug: 'home', title: { raw: 'Home' }, content: { raw: '<!-- wp:paragraph -->' }, excerpt: { raw: '' },
		date: '2026-01-02T03:04:05', date_gmt: '2026-01-02T03:04:05', parent: 6, menu_order: 2, author: 1, template: 'blank',
		featured_media: 9, meta: { footnotes: '', subtitle: 'Hi', list: [] }, guid: { raw: 'https://x/?page_id=7' },
	}, 'page');
	assert.equal(post.ID, 7);
	assert.equal(post.post_content, '<!-- wp:paragraph -->');
	assert.equal(post.post_date, '2026-01-02 03:04:05');
	assert.equal(post.post_parent, 6);
	assert.deepEqual(meta, [
		{ post_id: 7, key: 'subtitle', value: 'Hi' },
		{ post_id: 7, key: '_wp_page_template', value: 'blank' },
		{ post_id: 7, key: '_thumbnail_id', value: '9' },
	]);
});

test('restTemplate keys a template by its database ID and ties it to its theme and area', () => {
	const { post, relationships } = restTemplate({ wp_id: 20, slug: 'header', theme: 'lulu', area: 'header', status: 'publish',
		title: { raw: 'Header' }, content: { raw: 'x' } }, 'wp_template_part');
	assert.equal(post.ID, 20);
	assert.equal(post.post_name, 'header');
	assert.deepEqual(relationships, [
		{ object_id: 20, taxonomy: 'wp_theme', slug: 'lulu' },
		{ object_id: 20, taxonomy: 'wp_template_part_area', slug: 'header' },
	]);
});

test('restMedia points the attachment at its file and drops the live URLs from its sizes', () => {
	const { post, meta } = restMedia({ id: 9, mime_type: 'image/jpeg', source_url: 'https://x/wp-content/uploads/2026/01/a.jpg', alt_text: 'A',
		media_details: { width: 10, file: '2026/01/a.jpg', sizes: { thumbnail: { file: 'a-1.jpg', width: 1, source_url: 'https://x/a-1.jpg' } } } });
	assert.equal(post.post_type, 'attachment');
	assert.deepEqual(meta, [
		{ post_id: 9, key: '_wp_attached_file', value: '2026/01/a.jpg' },
		{ post_id: 9, key: '_wp_attachment_metadata', value: { width: 10, file: '2026/01/a.jpg', sizes: { thumbnail: { file: 'a-1.jpg', width: 1 } } } },
		{ post_id: 9, key: '_wp_attachment_image_alt', value: 'A' },
	]);
	// an SVG has no media details: its path comes from the URL, and there is no metadata to write
	assert.deepEqual(restMedia({ id: 3, source_url: 'https://x/wp-content/uploads/2026/01/l.svg', media_details: {} }).meta,
		[{ post_id: 3, key: '_wp_attached_file', value: '2026/01/l.svg' }]);
});

test('restMenuItem keeps what WordPress stores in meta as meta', () => {
	const { post, meta } = restMenuItem({ id: 5, status: 'publish', title: { raw: 'Home' }, type: 'post_type', object: 'page',
		object_id: 7, parent: 0, menu_order: 1, url: 'https://x/', classes: ['a'], xfn: ['me', 'friend'], target: '' });
	assert.equal(post.post_name, '5');
	assert.deepEqual(Object.fromEntries(meta.map(({ key, value }) => [key, value])), {
		_menu_item_type: 'post_type', _menu_item_menu_item_parent: '0', _menu_item_object_id: '7', _menu_item_object: 'page',
		_menu_item_target: '', _menu_item_classes: ['a'], _menu_item_xfn: 'me friend', _menu_item_url: 'https://x/',
	});
});

test('restPost writes a key named in multiple as one row per value', () => {
	const { meta } = restPost({ id: 7, meta: { tags: ['a', 'b'], pair: ['x', 'y'] } }, 'page', new Set(['tags']));
	assert.deepEqual(meta, [
		{ post_id: 7, key: 'tags', value: 'a' },
		{ post_id: 7, key: 'tags', value: 'b' },
		{ post_id: 7, key: 'pair', value: ['x', 'y'] },
	]);
});

// the shapes WP_REST_Meta_Fields::get_registered_fields gives each kind of key
test('multiValued finds the keys registered single: false in a route schema, not single keys typed array', () => {
	const schema = { properties: { meta: { properties: {
		tags: { type: 'array', items: { type: 'string', title: '', description: '', default: '' } },
		pair: { type: 'array', title: '', description: '', default: [], items: { type: 'string' } },
		subtitle: { type: 'string', title: '', description: '', default: '' },
	} } } };
	assert.deepEqual([...multiValued(schema)], ['tags']);
	assert.deepEqual([...multiValued(undefined)], []);
});

test('replacements match home and what follows it, and leave a longer host alone, plain and \\/-escaped', () => {
	const [[plain, to], [escaped, escapedTo]] = replacements('https://ex.com', 'https://l.localhost'),
		matches = (pattern, text) => new RegExp(pattern).test(text);
	for (const text of ['https://ex.com', 'https://ex.com/path', '"https://ex.com"', 'https://ex.com?p=1']) { assert.ok(matches(plain, text), text); }
	for (const text of ['https://ex.com.au', 'https://ex.community', 'https://ex.com-staging.net']) { assert.ok(!matches(plain, text), text); }
	assert.ok(matches(escaped, 'https:\\/\\/ex.com\\/path'));
	assert.ok(!matches(escaped, 'https:\\/\\/ex.com.au\\/path'));
	// preg_replace reads `\\` and `$` in a replacement, so the escaped form's backslashes are doubled
	assert.equal(to, 'https://l.localhost');
	assert.equal(escapedTo, 'https:\\\\/\\\\/l.localhost');
});
