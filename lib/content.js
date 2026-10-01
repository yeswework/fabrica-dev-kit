'use strict';

const fs = require('fs'),
	os = require('os'),
	path = require('path');

const { echo, execWP, warn } = require('./util'),
	{ getProjectConfig } = require('./config'),
	{ project } = require('./project'),
	{ restSite } = require('./rest'),
	{ sshCommand, sshSite, wpCliPatterns } = require('./ssh');

// SSH where the section's sftp settings log in with a key and the host gives a shell with WP-CLI:
// that access is configured already, so it needs no second credential. REST through `wp:`
// otherwise, which is the only way into a host with no shell
const connect = async section => {
	const config = getProjectConfig(section),
		ssh = sshCommand(config.ftp);
	if (!ssh && !config.wp) {
		throw new Error(`No way into '${section}': it needs either an sftp entry whose 'sftp:connect-program' logs in with a key (-i), or 'wp:' settings in 'config.yml'.`);
	}
	if (ssh) {
		const site = sshSite(config.ftp, ssh);
		let home;
		try {
			home = site.home();
		} catch (ex) {
			if (!config.wp) { throw ex; }
			warn(`${ex.message}\nUsing the 'wp:' settings over REST instead.`);
		}
		if (home !== undefined) {
			// addressed by host, so the site needs no proving unless the section also names a URL
			if (config.wp?.url && home.replace(/\/+$/, '') !== config.wp.url.replace(/\/+$/, '')) {
				throw new Error(`The WordPress at '${config.ftp.host}' reports its home as '${home}', not '${config.wp.url}': refusing to use it for '${section}'.`);
			}
			return site;
		}
	}
	return restSite(section);
};

// `12`, or `pages/12`: REST can only find a published post by ID alone
const parsePost = post => {
	const match = /^(?:([\w-]+)\/)?(\d+)$/.exec(post);
	if (!match) {
		throw new Error(`'${post}' is not a post: give its ID, or its type and ID such as 'pages/12'.`);
	}
	return { type: match[1], id: match[2] };
};

const defaultFile = (section, id) =>
	path.join(os.tmpdir(), `fdk-${project.slug}-${section.replace(/[^\w-]+/g, '-')}-${id}.html`);

// Where `pull` records which site and post a file came from and when that post was last changed:
// beside the file, since the file itself must hold the post's content and nothing else
const stateFile = file => `${file}.fdk.json`;

const writeState = (file, state) => fs.writeFileSync(stateFile(file), JSON.stringify(state, null, '\t') + '\n');

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
	const refs = patternRefs(content);
	if (!refs.length) { return; }
	const published = await site.patterns(),
		missing = refs.filter(ref => !published.some(pattern => pattern.id === ref));
	if (missing.length) {
		throw new Error(`Refusing to push: synced pattern ref(s) ${missing.join(', ')} are not published patterns on '${site.label}', so each would render as nothing. Map them to this site's pattern IDs first.`);
	}
};

// Write a post's stored block markup, byte for byte, into a local file
const pull = async (section, post, file) => {
	const target = parsePost(post),
		site = await connect(section),
		{ handle, raw, modified_gmt } = await site.read(target);
	file = file || defaultFile(section, target.id);
	fs.writeFileSync(file, raw);
	writeState(file, { site: site.id, post: handle, modified_gmt });
	echo(`Pulled '${handle}' from '${site.label}' into '${file}'`);
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
	if (String(state.post).split('/').pop() !== target.id) {
		throw new Error(`'${file}' was pulled from '${state.post}', not post ${target.id}.`);
	}
	// a local ID can happen to be a published pattern on the site too, which the ref check would pass
	if (state.localRefs) {
		throw new Error(`'${file}' holds the local site's pattern IDs: run 'fdk refs ${section} ${file} to-live' first.`);
	}

	const site = await connect(section);
	if (state.site !== site.id) {
		throw new Error(`'${file}' was pulled from '${state.site}', not '${site.id}'.`);
	}
	await site.checkCanWrite();
	const modified = await site.modified(state.post);
	if (modified !== state.modified_gmt) {
		throw new Error(`'${state.post}' has changed on '${site.label}' since it was pulled (${state.modified_gmt} → ${modified}), and pushing would overwrite that change: pull again and redo the edit.`);
	}
	const content = fs.readFileSync(file, 'utf8');
	await checkPatternRefs(site, content);

	// WordPress keeps the previous content as a revision, so this can be rolled back from the editor
	const saved = await site.write(state.post, content);
	writeState(file, { ...state, modified_gmt: saved.modified_gmt });
	echo(`Pushed '${file}' to '${state.post}' on '${site.label}'`);
	if (saved.raw !== content) {
		warn(`WordPress stored different markup from what was sent: check the post in the editor, or restore its previous revision.`);
	}
	// a failed purge doesn't fail the push: the content is already saved
	try {
		for (const purged of await site.purge()) { echo(`Purged the cache with '${purged}'.`); }
	} catch (ex) {
		warn(`The post was saved, but purging its cache failed: ${ex.message}`);
	}
};

const localPatterns = () => {
	try {
		return wpCliPatterns(command => {
			const result = execWP(`wp ${command.join(' ')}`, { silent: true });
			if (result.code !== 0) { throw new Error(result.stderr.trim()); }
			return result.stdout;
		});
	} catch (ex) {
		throw new Error(`Could not read the local site's synced patterns: is it running?${ex.message ? `\n${ex.message}` : ''}`);
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
		remote = await site.patterns(),
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
