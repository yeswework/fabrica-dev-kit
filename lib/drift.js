'use strict';

const fs = require('fs'),
	os = require('os'),
	path = require('path'),
	sh = require('shelljs'),
	{ spawnSync } = require('child_process');

const { echo, halt, warn } = require('./util'),
	{ getProjectConfig, loadConfig } = require('./config'),
	{ MISSING_REMOTE, ignoreParams, remoteCommands } = require('./deploy');

// Every resource a section deploys, across the section and its `<section>/*` variants, each once:
// variants usually exist to deploy one resource alone, so the base section rarely lists them all
const sectionResources = (config, section) => {
	const seen = new Set(),
		resources = [];
	for (const name of Object.keys(config).filter(name => name === section || name.startsWith(`${section}/`))) {
		const sectionConfig = getProjectConfig(name, config);
		for (const resourceType of ['themes', 'plugins']) {
			for (const resource of sectionConfig[resourceType] || []) {
				if (seen.has(path.resolve(resource))) { continue; }
				seen.add(path.resolve(resource));
				resources.push({ resourceType, resource });
			}
		}
	}
	return resources;
};

const newestMtime = dir => Math.max(0, ...sh.find(dir).filter(file => sh.test('-f', file)).map(file => fs.statSync(file).mtimeMs));

// Source edited since the build output last changed. Only a hint: webpack doesn't rewrite output
// whose contents are unchanged, so a fresh build of a comment-only edit still reads as stale
const buildIsStale = resource => {
	const src = path.join(resource, 'src'),
		build = path.join(resource, 'build');
	return sh.test('-d', src) && sh.test('-d', build) && newestMtime(src) > newestMtime(build);
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

// lftp's own exit status and stderr, in English so `MISSING_REMOTE` can read it
const lftp = script => {
	const result = spawnSync('lftp', ['-c', script.join('; ') + '; '], { stdio: ['inherit', 'ignore', 'pipe'], env: { ...process.env, LC_ALL: 'C' } });
	return { status: result.status, stderr: (result.stderr || '').toString() };
};

// Compare each resource on the server with what `deploy` would upload, file by file. Versions
// aren't bumped reliably and lftp's size-and-time test flags every rebuild, so contents are the
// only honest answer. Read-only: both sides are mirrored into a temp folder through the same
// `.distignore` filters deploy uses, then diffed
const drift = (projectName = 'default') => {
	const config = loadConfig(),
		ftp = getProjectConfig(projectName, config).ftp;
	if (!ftp || !ftp.host) {
		warn('Settings for FTP upload not found');
		return;
	}
	if (!sh.which('lftp')) { halt(`Could not find dependency 'lftp'.`); }

	const { commands } = remoteCommands(ftp);
	echo(`Comparing '${projectName}' resources with '${ftp.host}'...`);
	for (const { resourceType, resource } of sectionResources(config, projectName)) {
		const name = path.basename(resource);
		if (!sh.test('-d', resource)) {
			warn(`Path for resource '${name}' not found`);
			process.exitCode = 1;
			continue;
		}
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `fdk-drift-${name}-`)),
			localDir = path.join(tmp, 'local'),
			serverDir = path.join(tmp, 'server'),
			ignore = ignoreParams(resource),
			local = lftp(['set cmd:fail-exit yes', 'open file:///', `mirror --verbose=0 ${ignore} ${path.resolve(resource)} ${localDir}`]),
			server = lftp([...commands, `mirror --verbose=0 ${ignore} ${path.join(ftp.path || '', 'wp-content', resourceType, name)} ${serverDir}`]);

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
			const differences = parseDiff(spawnSync('diff', ['-rq', localDir, serverDir]).stdout.toString(), localDir, serverDir);
			if (differences.length === 0) {
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

module.exports = { buildIsStale, drift, parseDiff, sectionResources };
