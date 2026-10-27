'use strict';

const { spawnSync } = require('child_process');

const { expandHome } = require('./util');

// WP-CLI commands a push runs when the site has them; a site with none isn't an error
const CACHE_PURGES = [['sg', 'purge']];

// The first user who can save unfiltered HTML: super admins first on multisite, since a subsite's
// administrators can't, then administrators by ID
const UNFILTERED_HTML_USER = `$ids = array_merge(
	is_multisite() ? array_filter(array_map(function ($login) { $user = get_user_by('login', $login); return $user ? $user->ID : 0; }, get_super_admins())) : [],
	get_users(['role' => 'administrator', 'fields' => 'ID', 'orderby' => 'ID'])
);
foreach ($ids as $id) { if (user_can($id, 'unfiltered_html')) { echo $id; break; } }`;

// One argument for the remote shell
const quote = value => `'${String(value).replace(/'/g, `'\\''`)}'`;

// A section's server path as ssh sees it: the login's home is where ssh starts, as sftp does, so
// `~/` is just a relative path
const fromHome = folder => folder.replace(/^~\//, '');

// The `ssh` command line a section's sftp settings already hand lftp as `sftp:connect-program`,
// as argv, when it logs in with a key. Anything else gets null: a password can't be given to ssh
// without a prompt, and an entry with no connect-program may be SFTP-only (WPX is)
const sshCommand = ftp => {
	if (ftp?.scheme !== 'sftp' || !ftp.host) { return null; }
	const program = (ftp.commands || []).map(command => /^set\s+sftp:connect-program\s+"(.*)"\s*$/.exec(command)?.[1]).find(Boolean);
	if (!program) { return null; }
	// spawned without a shell, so `~` has to be expanded here
	const argv = program.trim().split(/\s+/).map(expandHome);
	if (argv[0] !== 'ssh' || !argv.includes('-i')) { return null; }
	if (ftp.port && !argv.includes('-p')) { argv.push('-p', String(ftp.port)); }
	// BatchMode: a host that wants anything typed fails instead of hanging the command
	return [...argv, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', `${ftp.user}@${ftp.host}`];
};

// Published synced patterns as `{ id, title }`, through whichever WP-CLI `run` reaches
const wpCliPatterns = run =>
	JSON.parse(run(['post', 'list', '--post_type=wp_block', '--post_status=publish', '--fields=ID,post_title', '--format=json']))
		.map(({ ID, post_title }) => ({ id: ID, title: post_title }));

// A site reached with WP-CLI over SSH. Offers the same operations as `restSite`. A post's handle is
// its ID: WP-CLI reads any post type and status, so nothing needs resolving
const sshSite = (ftp, ssh) => {
	const [bin, ...args] = ssh,
		wpPath = fromHome(ftp.path || '.'),
		wp = (command, input) => {
			// a seed's snapshot of a whole site can run to many megabytes, far past spawnSync's 1MB default
			const result = spawnSync(bin, [...args, `wp --path=${quote(wpPath)} ${command.map(quote).join(' ')}`],
				{ encoding: 'utf8', input, maxBuffer: 1024 ** 3 });
			if (result.error) { throw new Error(`Could not run ssh: ${result.error.message}`); }
			if (result.status !== 0) {
				throw new Error(`WP-CLI over SSH on '${ftp.host}' failed: ${(result.stderr || result.stdout).trim()}`);
			}
			return result.stdout;
		},
		// JSON, not `--field`: that appends a newline, so the file would no longer match the post
		read = id => {
			const post = JSON.parse(wp(['post', 'get', id, '--fields=post_content,post_modified_gmt', '--format=json']));
			return { handle: id, raw: post.post_content, modified_gmt: post.post_modified_gmt };
		};
	let admin;

	return {
		id: `ssh://${ftp.user}@${ftp.host}/${wpPath}`,
		label: ftp.host,
		home: () => wp(['option', 'get', 'home']).trim(),
		// PHP run inside the site's WordPress, read from stdin; its output
		evalFile: code => wp(['eval-file', '-'], code),
		read: async ({ id }) => read(id),
		modified: async id => read(id).modified_gmt,
		write: async (id, content) => {
			// `-` reads the content from stdin, so a page of markup never meets an argument limit
			wp(['post', 'update', id, '-', `--user=${admin}`], content);
			const saved = read(id);
			return { raw: saved.raw, modified_gmt: saved.modified_gmt };
		},
		patterns: async () => wpCliPatterns(wp),
		// WP-CLI runs as no user unless told, and kses strips markup on save for a user without
		// unfiltered_html, so the write has to run as one who has it. Asked through `user_can`, since
		// the role alone doesn't say: multisite grants it to super admins only, and
		// DISALLOW_UNFILTERED_HTML to no one
		checkCanWrite: async () => {
			admin = wp(['eval', UNFILTERED_HTML_USER]).trim();
			if (!admin) {
				throw new Error(`'${ftp.host}' has no user who can save unfiltered HTML (on multisite, only super admins can; with DISALLOW_UNFILTERED_HTML set, no one can), and WordPress would strip markup from the post saved as anyone else.`);
			}
		},
		// the commands purged
		purge: async () => {
			const purged = [];
			for (const command of CACHE_PURGES) {
				try {
					wp(['cli', 'has-command', command.join(' ')]);
				} catch (ex) {
					continue;
				}
				wp(command);
				purged.push(`wp ${command.join(' ')}`);
			}
			return purged;
		},
	};
};

module.exports = { fromHome, quote, sshCommand, sshSite, wpCliPatterns };
