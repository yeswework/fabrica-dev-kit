'use strict';

const fs = require('fs'),
	path = require('path'),
	{ spawnSync } = require('child_process');

const { echo, execWP, warn } = require('./util'),
	{ getProjectConfig } = require('./config'),
	{ connect } = require('./content');

// Fabrica Export's defaults (plugins/fabrica-export/inc/base.php DEFAULT_SETTINGS), plus the active
// theme's global styles, which a block theme's look depends on as much as its templates
const DEFAULT_TYPES = {
	post: { months: 6 },
	page: {},
	nav_menu_item: {},
	wp_block: {},
	wp_template: {},
	wp_template_part: {},
	wp_navigation: {},
	wp_global_styles: {},
	'acf-field-group': {},
	'acf-field': {},
};

// Fabrica Export's OPTIONS, plus what decides the front page and the site's identity
const OPTIONS = ['blogname', 'blogdescription', 'show_on_front', 'page_on_front', 'page_for_posts', 'site_icon', 'site_logo',
	'date_format', 'time_format', 'posts_per_page', 'thumbnail_size_w', 'thumbnail_size_h', 'medium_size_w', 'medium_size_h',
	'large_size_w', 'large_size_h', 'medium_large_size_w', 'medium_large_size_h', 'permalink_structure', 'category_base', 'tag_base'];

// The REST settings route's names for those options; the rest it doesn't expose
const REST_SETTINGS = { title: 'blogname', description: 'blogdescription', show_on_front: 'show_on_front',
	page_on_front: 'page_on_front', page_for_posts: 'page_for_posts', site_icon: 'site_icon', site_logo: 'site_logo',
	date_format: 'date_format', time_format: 'time_format', posts_per_page: 'posts_per_page' };

// Fabrica Export leaves out drafts, auto-drafts and trash; a post named by ID is wanted whatever its state
const STATUSES = 'publish,future,private,pending',
	NAMED_STATUSES = `${STATUSES},draft`;

// Found by theme and slug rather than ID, as WordPress finds them
const THEMED_TYPES = ['wp_template', 'wp_template_part', 'wp_global_styles'];

// The marker the PHP halves print their result after, so anything a plugin echoes can't be taken for it
const MARKER = 'FDK-SEED ';

const count = (value, name) => {
	if (value === undefined || value === null || value === '') { return undefined; }
	const number = Number(value);
	if (!Number.isInteger(number) || number < 0) { throw new Error(`'${name}' must be a whole number, not '${value}'.`); }
	// 0 lifts the filter, so a configured `months: 6` can be widened for one run
	return number || undefined;
};

const postIds = (value, name) => {
	if (value === undefined || value === null || value === '') { return undefined; }
	const ids = (Array.isArray(value) ? value : String(value).split(/[\s,]+/)).filter(id => id !== '');
	for (const id of ids) {
		if (!/^\d+$/.test(String(id))) { throw new Error(`'${name}' holds '${id}', which is not a post ID.`); }
	}
	return ids.length ? ids.map(Number) : undefined;
};

// Which post types a seed copies and how each is narrowed: the defaults, then the section's `seed:`
// block (`false` drops a type), then the command's flags, which apply to every type left
const selection = (seed = {}, { only, limit, months, ids } = {}) => {
	if (typeof seed !== 'object' || Array.isArray(seed)) {
		throw new Error(`'seed:' in 'config.yml' must map post types to their settings.`);
	}
	let types = Object.entries({ ...DEFAULT_TYPES, ...seed }).filter(([, filter]) => filter !== false && filter !== null);
	if (only) {
		const wanted = String(only).split(',').map(type => type.trim()).filter(Boolean);
		types = wanted.map(type => [type, types.find(([name]) => name === type)?.[1] ?? {}]);
	}
	return Object.fromEntries(types.map(([type, filter]) => {
		filter = filter === true ? {} : filter;
		if (typeof filter !== 'object' || Array.isArray(filter)) {
			throw new Error(`'seed.${type}' in 'config.yml' must be true, false, or settings such as '{ months: 6 }'.`);
		}
		const unknown = Object.keys(filter).filter(key => !['limit', 'months', 'ids'].includes(key));
		if (unknown.length) {
			throw new Error(`'seed.${type}' in 'config.yml' has unknown setting(s) ${unknown.join(', ')}: use limit, months or ids.`);
		}
		return [type, Object.fromEntries(Object.entries({
			limit: count(limit ?? filter.limit, `seed.${type}.limit`),
			months: count(months ?? filter.months, `seed.${type}.months`),
			ids: postIds(ids ?? filter.ids, `seed.${type}.ids`),
		}).filter(([, value]) => value !== undefined))];
	}));
};

// REST dates are ISO, without a zone; the database's are `Y-m-d H:i:s`
const restDate = date => date ? date.replace('T', ' ') : undefined;

const monthsAgo = months => {
	const date = new Date();
	date.setMonth(date.getMonth() - months);
	return date.toISOString().slice(0, 19);
};

// Attachments a post renders by ID: core puts `wp-image-<id>` on every image it saves, in image,
// gallery, cover and media-text blocks alike
const imageIds = content => [...String(content).matchAll(/\bwp-image-(\d+)\b/g)].map(([, id]) => Number(id));

// The filters for a type the REST API can't filter itself, applied to what it returned
const narrow = (items, { ids, months, limit }, idOf, dateOf) => {
	const since = months && monthsAgo(months);
	items = items.filter(item => (!ids || ids.includes(idOf(item))) && (!since || (dateOf(item) || '') > since))
		.sort((a, b) => String(dateOf(b) || '').localeCompare(String(dateOf(a) || '')));
	return limit ? items.slice(0, limit) : items;
};

const chunks = (list, size = 100) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

// A post as the REST API serves it in edit context, as the row and meta the writer takes
const restPost = (item, type) => ({
	post: {
		ID: item.id,
		post_type: type,
		post_status: item.status,
		post_name: item.slug ?? '',
		post_title: item.title?.raw ?? '',
		post_content: item.content?.raw ?? '',
		post_excerpt: item.excerpt?.raw ?? '',
		post_date: restDate(item.date),
		post_date_gmt: restDate(item.date_gmt),
		post_modified: restDate(item.modified),
		post_modified_gmt: restDate(item.modified_gmt),
		post_parent: item.parent ?? 0,
		menu_order: item.menu_order ?? 0,
		post_author: item.author ?? 0,
		comment_status: item.comment_status ?? 'closed',
		ping_status: item.ping_status ?? 'closed',
		post_password: item.password ?? '',
		guid: item.guid?.raw ?? '',
	},
	meta: [
		// only meta registered for REST is served; an unset key comes back as its empty default
		...Object.entries(item.meta || {})
			.filter(([, value]) => value !== '' && value !== null && !(Array.isArray(value) && !value.length))
			.map(([key, value]) => ({ post_id: item.id, key, value })),
		...(item.template ? [{ post_id: item.id, key: '_wp_page_template', value: item.template }] : []),
		...(item.featured_media ? [{ post_id: item.id, key: '_thumbnail_id', value: String(item.featured_media) }] : []),
	],
});

// A template or template part saved in the database: the theme's own files need no copying
const restTemplate = (item, type) => ({
	post: {
		ID: item.wp_id,
		post_type: type,
		post_status: item.status,
		post_name: item.slug,
		post_title: item.title?.raw ?? '',
		post_content: item.content?.raw ?? '',
		post_excerpt: item.description ?? '',
		post_author: item.author ?? 0,
		post_modified: restDate(item.modified),
	},
	relationships: [
		{ object_id: item.wp_id, taxonomy: 'wp_theme', slug: item.theme },
		...(type === 'wp_template_part' && item.area ? [{ object_id: item.wp_id, taxonomy: 'wp_template_part_area', slug: item.area }] : []),
	],
});

// A classic menu item: WordPress keeps everything but its title and order in meta
const restMenuItem = item => ({
	post: {
		ID: item.id,
		post_type: 'nav_menu_item',
		post_status: item.status,
		post_name: String(item.id),
		post_title: item.title?.raw ?? '',
		post_content: item.description ?? '',
		post_excerpt: item.attr_title ?? '',
		menu_order: item.menu_order ?? 0,
	},
	meta: Object.entries({
		_menu_item_type: item.type,
		_menu_item_menu_item_parent: String(item.parent ?? 0),
		_menu_item_object_id: String(item.object_id ?? 0),
		_menu_item_object: item.object,
		_menu_item_target: item.target ?? '',
		_menu_item_classes: item.classes ?? [''],
		_menu_item_xfn: (item.xfn ?? []).join(' '),
		_menu_item_url: item.url ?? '',
	}).map(([key, value]) => ({ post_id: item.id, key, value })),
});

// An attachment: its row, and the meta that tells WordPress where the file is. The file itself stays
// on the live site, for the project's nginx to fetch when it is asked for
const restMedia = item => {
	const { sizes, ...details } = item.media_details || {},
		file = details.file || /\/uploads\/(.+)$/.exec(item.source_url || '')?.[1],
		metadata = Object.keys(details).length && {
			...details,
			...(sizes && { sizes: Object.fromEntries(Object.entries(sizes).map(([name, { source_url, ...size }]) => [name, size])) }),
		};
	return {
		post: {
			ID: item.id,
			post_type: 'attachment',
			post_status: 'inherit',
			post_name: item.slug ?? '',
			post_title: item.title?.raw ?? '',
			post_content: item.description?.raw ?? '',
			post_excerpt: item.caption?.raw ?? '',
			post_mime_type: item.mime_type ?? '',
			post_parent: item.post ?? 0,
			post_author: item.author ?? 0,
			post_date: restDate(item.date),
			post_date_gmt: restDate(item.date_gmt),
			post_modified: restDate(item.modified),
			post_modified_gmt: restDate(item.modified_gmt),
			guid: item.guid?.raw ?? item.source_url ?? '',
		},
		meta: [
			...(file ? [{ post_id: item.id, key: '_wp_attached_file', value: file }] : []),
			...(metadata ? [{ post_id: item.id, key: '_wp_attachment_metadata', value: metadata }] : []),
			...(item.alt_text ? [{ post_id: item.id, key: '_wp_attachment_image_alt', value: item.alt_text }] : []),
		],
	};
};

// The snapshot the writer takes, read over the REST API. GET only: nothing here can change the site
const readRest = async (site, types) => {
	const snapshot = { posts: [], meta: [], terms: [], relationships: [], comments: [], users: [], options: [], menuLocations: {}, gaps: [] },
		add = ({ post, meta = [], relationships = [] }) => {
			snapshot.posts.push(post);
			snapshot.meta.push(...meta);
			snapshot.relationships.push(...relationships);
		},
		gap = message => snapshot.gaps.push(message),
		postTypes = await site.get('/wp/v2/types?context=edit'),
		taxonomies = await site.get('/wp/v2/taxonomies?context=edit'),
		settings = await site.get('/wp/v2/settings'),
		[theme] = await site.get('/wp/v2/themes?status=active&context=edit&_fields=stylesheet,_links'),
		// term IDs per taxonomy, to fetch once every post has been read
		termIds = {};
	snapshot.source = { home: site.url, siteurl: settings.url || site.url, stylesheet: theme.stylesheet };

	for (const [type, filter] of Object.entries(types)) {
		if (type === 'wp_template' || type === 'wp_template_part') {
			const items = (await site.get(`/wp/v2/${type === 'wp_template' ? 'templates' : 'template-parts'}?context=edit`))
				.filter(item => item.wp_id);
			narrow(items, filter, item => item.wp_id, item => item.modified).forEach(item => add(restTemplate(item, type)));
		} else if (type === 'wp_global_styles') {
			const href = theme._links?.['wp:user-global-styles']?.[0]?.href,
				id = Number(href?.split('/').pop());
			if (!id) { continue; }
			const styles = await site.get(`/wp/v2/global-styles/${id}?context=edit`);
			add({
				post: {
					ID: id,
					post_type: type,
					post_status: 'publish',
					post_name: `wp-global-styles-${encodeURIComponent(theme.stylesheet)}`,
					post_title: styles.title?.raw ?? 'Custom Styles',
					// the writer adds the schema version its own WordPress expects
					post_content: JSON.stringify({ styles: styles.styles, settings: styles.settings, isGlobalStylesUserThemeJSON: true }),
				},
				relationships: [{ object_id: id, taxonomy: 'wp_theme', slug: theme.stylesheet }],
			});
		} else if (type === 'nav_menu_item') {
			const menus = await site.getAll('/wp/v2/menus?context=edit'),
				items = narrow(await site.getAll('/wp/v2/menu-items?context=edit'), filter, item => item.id, () => '');
			for (const item of items) {
				const { post, meta } = restMenuItem(item),
					menu = menus.find(menu => (item.menus === menu.id) || (Array.isArray(item.menus) && item.menus.includes(menu.id)));
				add({ post, meta, relationships: menu ? [{ object_id: item.id, taxonomy: 'nav_menu', slug: menu.slug }] : [] });
			}
			for (const menu of menus) {
				snapshot.terms.push({ term_id: menu.id, taxonomy: 'nav_menu', slug: menu.slug, name: menu.name, description: menu.description ?? '' });
				for (const location of menu.locations || []) {
					snapshot.menuLocations[location] = { taxonomy: 'nav_menu', slug: menu.slug };
				}
			}
		} else if (!postTypes[type]) {
			gap(`'${type}' isn't exposed over REST on '${site.label}' (or the site doesn't have it): none copied.`);
		} else {
			const { rest_base: base, rest_namespace: namespace = 'wp/v2', taxonomies: postTaxonomies = [] } = postTypes[type],
				route = `/${namespace}/${base}?context=edit&status=${filter.ids ? NAMED_STATUSES : STATUSES}`,
				items = await site.getAll(`${route}&orderby=date&order=desc${filter.months ? `&after=${monthsAgo(filter.months)}` : ''}${filter.ids ? `&include=${filter.ids.join(',')}` : ''}`, filter.limit),
				seen = new Set(items.map(item => item.id));
			// and their parents, as Fabrica Export adds them
			for (let missing; (missing = [...new Set(items.map(item => item.parent).filter(id => id && !seen.has(id)))]).length;) {
				missing.forEach(id => seen.add(id));
				for (const ids of chunks(missing)) { items.push(...await site.getAll(`${route}&include=${ids.join(',')}`)); }
			}
			for (const item of items) {
				const relationships = [];
				for (const taxonomy of postTaxonomies) {
					const field = taxonomies[taxonomy]?.rest_base;
					for (const id of (field && item[field]) || []) {
						(termIds[taxonomy] ??= new Set()).add(id);
						relationships.push({ object_id: item.id, taxonomy, term_id: id });
					}
				}
				add({ ...restPost(item, type), relationships });
			}
		}
	}
	if (snapshot.posts.some(post => !THEMED_TYPES.includes(post.post_type) && post.post_type !== 'nav_menu_item')) {
		gap(`Over REST only meta registered for it comes across: other post meta (most ACF fields, for one) was not copied.`);
	}

	// terms, and their parents, so the hierarchy holds
	for (const [taxonomy, ids] of Object.entries(termIds)) {
		const { rest_base: base, rest_namespace: namespace = 'wp/v2' } = taxonomies[taxonomy],
			terms = new Map();
		for (let missing = [...ids]; missing.length;) {
			for (const batch of chunks(missing)) {
				for (const term of await site.getAll(`/${namespace}/${base}?context=edit&include=${batch.join(',')}`)) { terms.set(term.id, term); }
			}
			missing = [...new Set([...terms.values()].map(term => term.parent).filter(id => id && !terms.has(id)))];
		}
		for (const term of terms.values()) {
			snapshot.terms.push({ term_id: term.id, taxonomy, slug: term.slug, name: term.name, description: term.description ?? '',
				parent: terms.get(term.parent)?.slug });
		}
		for (const relationship of snapshot.relationships.filter(relationship => relationship.taxonomy === taxonomy && relationship.term_id)) {
			relationship.slug = terms.get(relationship.term_id)?.slug;
			delete relationship.term_id;
		}
	}

	for (const [field, option] of Object.entries(REST_SETTINGS)) {
		if (settings[field] !== undefined && settings[field] !== null) { snapshot.options.push({ name: option, value: settings[field] }); }
	}
	gap(`Image sizes, the permalink structure and the category and tag bases aren't exposed over REST: the local site keeps its own.`);

	// the attachments the chosen posts and the site's icon and logo render by ID
	const ids = new Set(snapshot.posts.map(post => post.ID)),
		media = new Set([
			...snapshot.meta.filter(meta => meta.key === '_thumbnail_id').map(meta => Number(meta.value)),
			...snapshot.posts.flatMap(post => imageIds(post.post_content)),
			settings.site_icon, settings.site_logo,
		].filter(id => id && !ids.has(id)));
	for (const batch of chunks([...media])) {
		(await site.getAll(`/wp/v2/media?context=edit&include=${batch.join(',')}`)).forEach(item => add(restMedia(item)));
	}

	const commented = snapshot.posts.filter(post => !['attachment', 'nav_menu_item', ...THEMED_TYPES].includes(post.post_type)).map(post => post.ID);
	for (const batch of chunks(commented)) {
		for (const comment of await site.getAll(`/wp/v2/comments?context=edit&post=${batch.join(',')}`)) {
			snapshot.comments.push({
				comment_ID: comment.id, comment_post_ID: comment.post, comment_parent: comment.parent ?? 0, user_id: comment.author ?? 0,
				comment_author: comment.author_name ?? '', comment_author_email: comment.author_email ?? '', comment_author_url: comment.author_url ?? '',
				comment_author_IP: comment.author_ip ?? '', comment_agent: comment.author_user_agent ?? '', comment_content: comment.content?.raw ?? '',
				comment_date: restDate(comment.date), comment_date_gmt: restDate(comment.date_gmt), comment_approved: '1', comment_type: comment.type || 'comment',
			});
		}
	}

	const authors = [...new Set([...snapshot.posts.map(post => post.post_author), ...snapshot.comments.map(comment => comment.user_id)].filter(Boolean))];
	try {
		for (const batch of chunks(authors)) {
			for (const user of await site.getAll(`/wp/v2/users?context=edit&include=${batch.join(',')}`)) {
				snapshot.users.push({ ID: user.id, user_login: user.username, user_nicename: user.slug,
					display_name: user.name, user_registered: restDate(user.registered_date), roles: user.roles || [] });
			}
		}
	} catch (ex) {
		gap(`The authors couldn't be read (${ex.message}): their posts keep live's author IDs.`);
	}
	return snapshot;
};

// PHP for WordPress's `eval-file -`, with its input set as `$input` before it runs
const php = (file, input) =>
	`<?php $input = json_decode(base64_decode('${Buffer.from(JSON.stringify(input)).toString('base64')}'), true); ?>`
	+ fs.readFileSync(path.join(__dirname, file), 'utf8');

const result = (output, where) => {
	const line = String(output).split('\n').reverse().find(line => line.startsWith(MARKER));
	if (!line) { throw new Error(`${where} printed no result:\n${String(output).trim().slice(-2000)}`); }
	return JSON.parse(line.slice(MARKER.length));
};

const readSsh = (site, types) => result(site.evalFile(php('seed-read.php', { types, options: OPTIONS })), `Reading '${site.label}' over SSH`);

// The local site's half, run through WP-CLI in the `wp` container: refuses on any clash before
// writing, unless told to replace
const writeLocal = input => {
	const run = spawnSync('docker', ['compose', 'exec', '-u', 'www-data', '-T', 'wp', 'wp', 'eval-file', '-'],
		{ input: php('seed-write.php', input), encoding: 'utf8', maxBuffer: 1024 ** 3 });
	if (run.error) { throw new Error(`Could not run docker: ${run.error.message}`); }
	if (run.status !== 0) {
		throw new Error(`Writing into the local site failed: is it running?\n${(run.stderr || run.stdout).trim()}`);
	}
	return result(run.stdout, 'The local site');
};

// a themed post is matched by theme and slug, so its local ID can differ from live's
const describe = clash => `${clash.ID} (live ${clash.type}${clash.live && clash.live !== clash.ID ? ` ${clash.live}` : ''} '${clash.title}', local ${clash.local_type} '${clash.local_title}')`;

// Fill the local site with the live content of `section`, keeping live's IDs so everything that
// refers to a post by ID (synced patterns, navigation, the front page, images) still finds it
const seed = async (section, flags = {}) => {
	const types = selection(getProjectConfig(section).seed, flags),
		site = await connect(section);
	echo(`Reading ${Object.keys(types).join(', ')} from '${site.label}'`);
	const snapshot = site.evalFile ? readSsh(site, types) : await readRest(site, types);
	snapshot.gaps.forEach(warn);

	const report = writeLocal({ snapshot, replace: Boolean(flags.replace), check: Boolean(flags.dryRun) });
	const byType = snapshot.posts.reduce((all, post) => ({ ...all, [post.post_type]: [...(all[post.post_type] || []), post.ID] }), {});
	for (const [type, ids] of Object.entries(byType)) { echo(`${type}: ${ids.length} (${ids.join(', ')})`); }
	const clashes = [...report.clashes.map(describe), ...report.commentClashes.map(id => `comment ${id}`)];
	if (flags.dryRun) {
		clashes.forEach(clash => warn(`Taken on the local site, so this needs --replace, which would overwrite it: ${clash}`));
		echo(`Dry run: nothing written.`);
		return;
	}
	if (clashes.length && !flags.replace) {
		throw new Error(`${clashes.length} ID(s) are taken on the local site, so nothing was written: ${clashes.join('; ')}. Run again with --replace to overwrite those.`);
	}
	for (const remap of report.remapped) { warn(remap); }

	// `\/` too: WordPress escapes slashes in the JSON it stores, global styles among it
	const from = [...new Set([snapshot.source.home, snapshot.source.siteurl])].filter(url => url && url !== report.home);
	for (const url of from) {
		for (const [search, replace] of [[url, report.home], [url.replace(/\//g, '\\/'), report.home.replace(/\//g, '\\/')]]) {
			const replaced = execWP(`wp search-replace '${search}' '${replace}' --skip-columns=guid --format=count`, { silent: true });
			if (replaced.code !== 0) { throw new Error(`Replacing '${search}' failed: ${replaced.stderr.trim()}`); }
		}
	}
	echo(`Seeded ${snapshot.posts.length} post(s), ${snapshot.comments.length} comment(s) into '${report.home}'${from.length ? `, with '${from.join("', '")}' replaced` : ''}`);
	const nginx = 'provision/web/wordpress-fpm.conf';
	if (snapshot.posts.some(post => post.post_type === 'attachment')
		&& !(fs.existsSync(nginx) && /@live\b/.test(fs.readFileSync(nginx, 'utf8')))) {
		warn(`The media library entries point at files this site doesn't have: proxy missing uploads from '${snapshot.source.home}' in 'provision/web/wordpress-fpm.conf' (the fdk skill has the block).`);
	}
};

module.exports = { DEFAULT_TYPES, imageIds, narrow, restMedia, restMenuItem, restPost, restTemplate, seed, selection };
