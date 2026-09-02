'use strict';

const Promise = require('promise'),
	sh = require('shelljs'),
	// `shelljs.exec` doesn't handle color and animations (https://github.com/shelljs/shelljs/issues/86 & https://github.com/shelljs/shelljs/issues/426)
	{ spawnSync } = require('child_process');

const execGet = cmd => sh.exec(cmd, { silent: true }).stdout.trim();
const execWP = (cmd, options) => sh.exec(`docker compose exec -u www-data -T wp ${cmd}`, options);
const execWPGet = cmd => execWP(cmd, { silent: true }).stdout.trim();
const spawn = ([cmd, ...args]) => spawnSync(cmd, args, { stdio: 'inherit' })

// output functions
const echo = (message, icon='🏭') => {
	console.log(`\x1b[7m[FDK]\x1b[27m ${icon}  ${message}`);
};
const warn = message => {
	console.error(`\x1b[1m\x1b[41m[FDK]\x1b[0m ⚠️  ${message}`);
}
const halt = message => {
	warn(message);
	process.exit(1);
};
const wait = (message, callback, delay=500) => {
	return new Promise((resolve, reject) => {
		console.log();
		const spinner = ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'];
		let waitcounter = 0,
			handler,
			stopWaitInterval = (...response) => {
				clearTimeout(handler);
				console.log();
				resolve(response);
			};
		handler = setInterval(() => {
			// clearLine/cursorTo only exist on a TTY; in a non-TTY shell (pipe, CI,
			// agent) calling them throws and aborts the command mid-run
			if (process.stdout.isTTY) {
				// move cursor to beginning of line
				process.stdout.clearLine();
				process.stdout.cursorTo(0);
				// write with no line change
				process.stdout.write(`\x1b[7m[FDK]\x1b[27m ${spinner[waitcounter % 12]}  ${message}`);
			}
			callback(stopWaitInterval);
			waitcounter++;
			// send callback a closure to stop the interval timer
		}, delay);
	});
};

module.exports = { echo, execGet, execWP, execWPGet, halt, spawn, wait, warn };
