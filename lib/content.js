'use strict';

const fs = require('fs'),
	os = require('os'),
	path = require('path');

const { echo, execWP, warn } = require('./util'),
	{ project } = require('./project'),
	{ connect, request, requestAll } = require('./rest');

// Cache routes a push calls when the site exposes their namespace; a site with none isn't an error
const CACHE_PURGES = [
	// PUT, not POST: POST answers a bare 404 that reads like a missing route
	{ namespace: 'siteground-optimizer/v1', route: '/siteground-optimizer/v1/purge-cache', method: 'PUT' },
];

// `12`, or `pages/12` for a post search can't find
const parsePost = post => {
	const match = /^(?:([\w-]+)\/)?(\d+)$/.exec(post);
	if (!match) {
		throw new Error(`'${post}' is not a post: give its ID, or its type and ID such as 'pages/12'.`);
	}
	return { restBase: match[1], id: match[2] };
};

const defaultFile = (section, id) =>
	path.join(os.tmpdir(), `fdk-${project.slug}-${section.replace(/[^\w-]+/g, '-')}-${id}.html`);

// Where `pull` records which site and route a file came from and when that post was last changed:
// beside the file, since the file itself must hold the post's content and nothing else
const stateFile = file => `${file}.fdk.json`;

const writeState = (file, state) => fs.writeFileSync(stateFile(file), JSON.stringify(state, null, '\t') + '\n');

const resolveRoute = async (site, { restBase, id }) => {
	if (restBase) { return `/wp/v2/${restBase}/${id}`; }
	// search sees published posts only, hence the type/ID form for drafts
	const [hit] = await request(site, `/wp/v2/search?include=${id}&_fields=id,subtype`);
	if (!hit) {
		throw new Error(`No published post with ID ${id} on '${site.url}': for a draft, name its type too, such as 'pages/${id}'.`);
	}
	const type = await request(site, `/wp/v2/types/${hit.subtype}?_fields=rest_base,rest_namespace`);
	return `/${type.rest_namespace || 'wp/v2'}/${type.rest_base}/${id}`;
};

// A synced pattern's delimiter and its attributes. Only `wp:block` counts: core/navigation carries a
// `ref` too, pointing at a different post type. WordPress escapes `--` when it serializes block
// attributes, so the lazy match can't stop early inside them
const PATTERN_BLOCK = /<!--\s+wp:(?:core\/)?block\s+(\{[\s\S]*?\})\s+\/?-->/g;

// Every synced-pattern ref in the markup
const patternRefs = content => {
	const refs = new Set();
	for (const [, attrs] of content.matchAll(PATTERN_BLOCK)) {
		let ref;
		try {
			ref = JSON.parse(attrs).ref;
		} catch (ex) {
			throw new Error(`Could not read a synced pattern's attributes in the file: ${attrs}`);
		}
		if (ref !== undefined) { refs.add(ref); }
	}
	return [...refs];
};

// A ref to anything but a published pattern renders as nothing, with no error anywhere, so a stray
// ID from another environment would empty every page carrying it. Refuse; never rewrite, or the
// round trip stops being byte-for-byte
const checkPatternRefs = async (site, content) => {
	const refs = patternRefs(content),
		ids = refs.filter(Number.isInteger);
	if (!refs.length) { return; }
	const found = ids.length
			? await request(site, `/wp/v2/blocks?status=publish&per_page=100&include=${ids.join(',')}&_fields=id`)
			: [],
		missing = refs.filter(ref => !found.some(block => block.id === ref));
	if (missing.length) {
		throw new Error(`Refusing to push: synced pattern ref(s) ${missing.join(', ')} are not published patterns on '${site.url}', so each would render as nothing. Map them to this site's pattern IDs first.`);
	}
};

// A failed purge is reported but doesn't fail the push: the content is already saved
const purgeCache = async site => {
	for (const purge of CACHE_PURGES.filter(purge => site.namespaces.includes(purge.namespace))) {
		try {
			await request(site, purge.route, { method: purge.method });
			echo(`Purged the cache via '${purge.route}'.`);
		} catch (ex) {
			warn(`The page was saved, but purging its cache failed: ${ex.message}`);
		}
	}
};

// Write a post's stored block markup, byte for byte, into a local file
const pull = async (section, post, file) => {
	const target = parsePost(post),
		site = await connect(section),
		route = await resolveRoute(site, target),
		// without `context=edit` the REST API returns rendered HTML, not block markup
		data = await request(site, `${route}?context=edit&_fields=content,modified_gmt`);
	if (typeof data.content?.raw !== 'string') {
		throw new Error(`'${site.url}' returned no raw content for '${route}'.`);
	}
	file = file || defaultFile(section, target.id);
	fs.writeFileSync(file, data.content.raw);
	writeState(file, { url: site.url, route, modified_gmt: data.modified_gmt });
	echo(`Pulled '${route}' from '${site.url}' into '${file}'`);
};

// Write a pulled file back into its post, refusing whatever would silently lose or break content
const push = async (section, post, file) => {
	const target = parsePost(post);
	file = file || defaultFile(section, target.id);
	if (!fs.existsSync(file)) {
		throw new Error(`No such file '${file}': run 'fdk pull ${section} ${post}' first.`);
	}
	let state;
	try {
		state = JSON.parse(fs.readFileSync(stateFile(file), 'utf8'));
	} catch (ex) {
		throw new Error(`'${file}' has no record of a pull, so there's no telling whether the post changed since: pull into it with 'fdk pull ${section} ${post} ${file}' first.`);
	}
	if (!state.route.endsWith(`/${target.id}`)) {
		throw new Error(`'${file}' was pulled from '${state.route}', not post ${target.id}.`);
	}
	// a local ID can happen to be a published pattern on the site too, which the ref check would pass
	if (state.localRefs) {
		throw new Error(`'${file}' holds the local site's pattern IDs: run 'fdk refs ${section} ${file} to-live' first.`);
	}

	const site = await connect(section);
	if (state.url !== site.url) {
		throw new Error(`'${file}' was pulled from '${state.url}', not '${site.url}'.`);
	}
	if (!site.user.capabilities?.unfiltered_html) {
		throw new Error(`'${site.user.name}' can't save unfiltered HTML on '${site.url}', so WordPress would strip markup from the post: use an administrator's application password.`);
	}
	const live = await request(site, `${state.route}?context=edit&_fields=modified_gmt`);
	if (live.modified_gmt !== state.modified_gmt) {
		throw new Error(`'${state.route}' has changed on '${site.url}' since it was pulled (${state.modified_gmt} → ${live.modified_gmt}), and pushing would overwrite that change: pull again and redo the edit.`);
	}
	const content = fs.readFileSync(file, 'utf8');
	await checkPatternRefs(site, content);

	// WordPress keeps the previous content as a revision, so this can be rolled back from the editor
	const saved = await request(site, `${state.route}?context=edit&_fields=content,modified_gmt`,
		{ method: 'PUT', body: { content } });
	writeState(file, { ...state, modified_gmt: saved.modified_gmt });
	echo(`Pushed '${file}' to '${state.route}' on '${site.url}'`);
	if (saved.content?.raw !== content) {
		warn(`WordPress stored different markup from what was sent: check the post in the editor, or restore its previous revision.`);
	}
	await purgeCache(site);
};

// Published synced patterns as `{ id, title }`: the site's over REST, this project's own through WP-CLI
const sitePatterns = async site =>
	(await requestAll(site, '/wp/v2/blocks?status=publish&context=edit&_fields=id,title'))
		.map(({ id, title }) => ({ id, title: title.raw ?? title.rendered }));
const localPatterns = () => {
	const result = execWP('wp post list --post_type=wp_block --post_status=publish --fields=ID,post_title --format=json', { silent: true });
	try {
		return JSON.parse(result.stdout).map(({ ID, post_title }) => ({ id: ID, title: post_title }));
	} catch (ex) {
		throw new Error(`Could not read the local site's synced patterns: is it running?${result.stderr ? `\n${result.stderr.trim()}` : ''}`);
	}
};

// Synced-pattern IDs differ per environment, so markup moved between the site and the local copy
// renders its patterns as nothing until each ref is swapped for the other side's ID. Patterns are
// matched by title, so renaming one on either side breaks the mapping. Never part of pull or push:
// those stay byte for byte, and this is the explicit step between them
const refs = async (section, file, direction) => {
	if (!['to-local', 'to-live'].includes(direction)) {
		throw new Error(`Direction must be 'to-local' or 'to-live', not '${direction}'.`);
	}
	if (!fs.existsSync(file)) { throw new Error(`No such file '${file}'.`); }
	const site = await connect(section),
		remote = await sitePatterns(site),
		local = localPatterns(),
		[from, to] = direction === 'to-local' ? [remote, local] : [local, remote],
		content = fs.readFileSync(file, 'utf8');

	const mapping = new Map();
	for (const ref of patternRefs(content)) {
		const title = from.find(pattern => pattern.id === ref)?.title,
			matches = to.filter(pattern => pattern.title === title);
		if (title === undefined) {
			warn(`Ref ${ref} is no published pattern on the side it comes from: left alone.`);
		} else if (!matches.length) {
			warn(`'${title}' (${ref}) has no published pattern of that title on the other side: left alone.`);
		} else if (matches.length > 1) {
			throw new Error(`'${title}' names ${matches.length} patterns on the other side (${matches.map(pattern => pattern.id).join(', ')}), so there's no telling which ${ref} means: nothing rewritten.`);
		} else if (matches[0].id !== ref) {
			mapping.set(ref, matches[0].id);
			echo(`${title}: ${ref} → ${matches[0].id}`);
		}
	}

	// only the pattern delimiters, so a navigation block that happens to share a number is untouched
	fs.writeFileSync(file, content.replace(PATTERN_BLOCK, (block, attrs) => {
		const ref = JSON.parse(attrs).ref;
		return mapping.has(ref) ? block.replace(new RegExp(`"ref":${ref}(?!\\d)`), `"ref":${mapping.get(ref)}`) : block;
	}));
	if (fs.existsSync(stateFile(file))) {
		const { localRefs, ...state } = JSON.parse(fs.readFileSync(stateFile(file), 'utf8'));
		writeState(file, direction === 'to-local' ? { ...state, localRefs: true } : state);
	}
	echo(`Rewrote ${mapping.size} ref(s) in '${file}'`);
};

module.exports = { patternRefs, pull, push, refs };
