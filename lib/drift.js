'use strict';

const fs = require('fs'),
	os = require('os'),
	path = require('path'),
	sh = require('shelljs'),
	{ spawnSync } = require('child_process');

const { echo, expandHome, halt, warn } = require('./util'),
	{ getProjectConfig, loadConfig } = require('./config'),
	{ MISSING_REMOTE, buildIsStale, filterParams, ignoreParams, lftp, remoteCommands } = require('./deploy');

// Every resource a section deploys, across the section and its `<section>/*` variants, with the
// `ftp` settings of the section that deploys it, once per server: variants usually exist to deploy
// one resource alone, so the base section rarely lists them all, and one may deploy elsewhere
const sectionResources = (config, section) => {
	const seen = new Set(),
		resources = [];
	// the base section first, so one that isn't there stops here as it would for deploy
	for (const name of [section, ...Object.keys(config).filter(name => name.startsWith(`${section}/`))]) {
		const sectionConfig = getProjectConfig(name, config),
			ftp = sectionConfig.ftp || {};
		for (const resourceType of ['themes', 'plugins']) {
			for (const resource of (sectionConfig[resourceType] || []).map(expandHome)) {
				const key = JSON.stringify([path.resolve(resource), ftp.scheme, ftp.user, ftp.host, ftp.port, ftp.path]);
				if (seen.has(key)) { continue; }
				seen.add(key);
				resources.push({ section: name, resourceType, resource, ftp });
			}
		}
	}
	return resources;
};

// `diff -rq` output as `{ kind, file }`, `file` relative to the resource root
const parseDiff = (output, localDir, serverDir) => output.split('\n').filter(Boolean).map(line => {
	const only = line.match(/^Only in (.+): (.+)$/);
	if (only) {
		const local = only[1] === localDir || only[1].startsWith(`${localDir}/`);
		return { kind: local ? 'local only' : 'server only', file: path.relative(local ? localDir : serverDir, path.join(only[1], only[2])) };
	}
	// anything else — a file on one side that's a folder on the other — is still a difference
	const differ = line.match(/^Files (.+) and .+ differ$/);
	return { kind: 'changed', file: differ ? path.relative(localDir, differ[1]) : line };
});

// `diff -rq` of the two copies. Its status 1 is what lists differences; anything else but 0 — an
// unreadable file, a dangling symlink, no `diff` at all — means they weren't compared, whatever it
// printed. So does anything on stderr: Apple's diff reports a dangling symlink there and exits 0
const compare = (localDir, serverDir) => {
	const result = spawnSync('diff', ['-rq', localDir, serverDir], { encoding: 'utf8' });
	if ((result.status !== 0 && result.status !== 1) || result.stderr) {
		return { error: result.error ? result.error.message : result.stderr.trim() };
	}
	return { differences: parseDiff(result.stdout, localDir, serverDir) };
};

// Compare each resource on the server with what `deploy` would upload, file by file. Versions
// aren't bumped reliably and lftp's size-and-time test flags every rebuild, so contents are the
// only honest answer. Read-only: both sides are mirrored into a temp folder through the same
// filters deploy uses, `ftp.params` and `.distignore`, then diffed
const drift = (projectName = 'default') => {
	const resources = sectionResources(loadConfig(), projectName),
		// a variant whose `ftp:` has no host can't be deployed either (see fabrica-dev-kit-hsg)
		unreachable = [...new Set(resources.filter(({ ftp }) => !ftp.host).map(({ section }) => section))],
		reachable = resources.filter(({ ftp }) => ftp.host);
	unreachable.forEach(section => warn(`'${section}' has no FTP host, so deploy can't upload it: skipped.`));
	if (!reachable.length) {
		warn('Settings for FTP upload not found');
		return;
	}
	if (!sh.which('lftp')) { halt(`Could not find dependency 'lftp'.`); }

	echo(`Comparing '${projectName}' resources with ${[...new Set(reachable.map(({ ftp }) => `'${ftp.host}'`))].join(', ')}...`);
	for (const { resourceType, resource, ftp } of reachable) {
		const name = path.basename(resource),
			{ commands, password } = remoteCommands(ftp);
		if (!sh.test('-d', resource)) {
			warn(`Path for resource '${name}' not found`);
			process.exitCode = 1;
			continue;
		}
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `fdk-drift-${name}-`)),
			localDir = path.join(tmp, 'local'),
			serverDir = path.join(tmp, 'server'),
			// in deploy's own order: its parameters, then the resource's `.distignore`
			ignore = `${filterParams(ftp.params)} ${ignoreParams(resource)}`,
			local = lftp(['set cmd:fail-exit yes', 'open file:///', `mirror --verbose=0 ${ignore} ${path.resolve(resource)} ${localDir}`]),
			server = lftp([...commands, `mirror --verbose=0 ${ignore} ${path.join(ftp.path || '', 'wp-content', resourceType, name)} ${serverDir}`], password);

		if (local.status !== 0) {
			warn(`Couldn't copy local '${name}' for comparison:\n${local.stderr}`);
			process.exitCode = 1;
		} else if (server.status !== 0 && !sh.test('-d', serverDir) && MISSING_REMOTE.test(server.stderr)) {
			echo(`${name}: not on the server`, '🔸');
			process.exitCode = 1;
		} else if (server.status !== 0) {
			warn(`Couldn't read '${name}' from the server:\n${server.stderr}`);
			process.exitCode = 1;
		} else {
			const { differences, error } = compare(localDir, serverDir);
			if (error !== undefined) {
				warn(`Couldn't compare '${name}' with the server's copy:\n${error}`);
				process.exitCode = 1;
			} else if (differences.length === 0) {
				echo(`${name}: identical`, '✅');
			} else {
				echo(`${name}: ${differences.length} file(s) differ`, '🔸');
				differences.forEach(({ kind, file }) => console.log(`      ${kind.padEnd(12)} ${file}`));
				if (buildIsStale(resource)) {
					warn(`'${name}' source was edited after its build output last changed. If 'fdk build' hasn't run since, these differences may be a stale local build rather than something missing from the server.`);
				}
				process.exitCode = 1;
			}
		}
		sh.rm('-rf', tmp);
	}
};

module.exports = { compare, drift, parseDiff, sectionResources };
