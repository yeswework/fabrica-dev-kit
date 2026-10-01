'use strict';

// WP-CLI as the SSH route calls it, run by a stubbed `wp` against a JSON file standing in for the
// remote site (`FDK_WP_STATE`). `stubBin` pairs it with an `ssh` that runs its remote command
// locally, so the whole command line the CLI builds is exercised:
//
//   const bin = stubBin({ ssh: SSH_STUB_BODY, wp: WP_STUB_BODY, docker: 'exit 0' });
//
// State: `{ home, posts: { id: { raw, modified_gmt } }, patterns: { id: title }, admins: ['1'],
// commands: ['sg purge'], purgeFails, calls }`. A post saved as anyone but an administrator has its
// <style> stripped, as kses would.
const fs = require('fs');

const SSH_STUB_BODY = 'for last; do :; done; exec sh -c "$last"',
	WP_STUB_BODY = `exec node '${__filename}' "$@"`;

if (require.main === module) {
	const file = process.env.FDK_WP_STATE,
		state = JSON.parse(fs.readFileSync(file, 'utf8')),
		save = () => fs.writeFileSync(file, JSON.stringify(state)),
		fail = message => {
			save();
			process.stderr.write(`Error: ${message}\n`);
			process.exit(1);
		},
		out = text => process.stdout.write(text);
	state.calls.push(process.argv.slice(2));
	const args = process.argv.slice(2).filter(arg => !arg.startsWith('--path=')),
		[group, command, subject] = args,
		post = state.posts[subject];

	if (group === 'option' && command === 'get' && subject === 'home') {
		out(`${state.home}\n`);
	} else if (group === 'post' && command === 'get') {
		if (!post) { fail(`Could not find the post with ID ${subject}.`); }
		out(JSON.stringify({ post_content: post.raw, post_modified_gmt: post.modified_gmt }));
	} else if (group === 'post' && command === 'update') {
		const user = args.find(arg => arg.startsWith('--user='))?.slice('--user='.length),
			content = fs.readFileSync(0, 'utf8');
		post.raw = state.admins.includes(user) ? content : content.replace(/<style>[\s\S]*?<\/style>/g, '');
		post.modified_gmt = `2026-09-01 00:01:${String(state.calls.length).padStart(2, '0')}`;
		out(`Success: Updated post ${subject}.\n`);
	} else if (group === 'user' && command === 'list') {
		out(state.admins.map(id => `${id}\n`).join(''));
	} else if (group === 'post' && command === 'list') {
		out(JSON.stringify(Object.entries(state.patterns).map(([ID, post_title]) => ({ ID: Number(ID), post_title }))));
	} else if (group === 'cli' && command === 'has-command') {
		if (!state.commands.includes(subject)) { save(); process.exit(1); }
	} else if (group === 'sg' && command === 'purge') {
		if (state.purgeFails) { fail('Purge failed.'); }
		out('Success: Purged.\n');
	} else {
		fail(`'${args.join(' ')}' is not a registered wp command.`);
	}
	save();
}

module.exports = { SSH_STUB_BODY, WP_STUB_BODY };
