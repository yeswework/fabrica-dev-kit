'use strict';

// A stubbed `lftp` for the deploy tests. FDK shells out to it twice per resource — once for the
// ACF preflight (`mirror --verbose=0 <remote> <dest>`) and once for the upload
// (`mirror --reverse …`) — and the guard's whole job is to tell those two apart, so the stub
// branches on `--reverse` and only ever fakes the preflight.
//
// The destination is passed in rather than parsed back out of the command script: `deploy` builds
// it as `<tmpdir>/fdk-acf-<resource>`, which a test can compute for itself with `acfPullDest`.
//
// The upload is the `--reverse` branch: `LFTP_STUB_UPLOAD_STATUS` is what it exits with. `--backup`
// and a `--delete` dry run probe for the resource on the server first, with `cls -d`: `LFTP_STUB_EXISTS_STATUS` and
// `LFTP_STUB_EXISTS_STDERR` answer that. The backup itself passes through a local `fdk-backup-`
// folder, which is how it is told apart from the upload: `LFTP_STUB_BACKUP_STATUS` answers it. A
// section with `--delete` in its params has the upload run with `--dry-run` first, which prints
// `LFTP_STUB_DRY_RUN` and exits with `LFTP_STUB_DRY_RUN_STATUS`. The uncommitted-changes check
// mirrors locally over `file:///`, which the stub answers with a plain copy: the filters it passes
// are lftp's to apply, and the live tier runs them for real.
//
// A bare 550 sends FDK to list the folder above, with `cls -1 <folder>/`, as vsftpd would answer
// it: `LFTP_STUB_LIST_PATH` is the one folder that lists, printing `LFTP_STUB_LIST`, and any other
// answers `BARE_550` — or `LFTP_STUB_LIST_STDERR` when set.
//
// Preflight outcomes, matching the ones the guard has to distinguish:
//   status  0 + fixture   a copy arrived
//   status  0 + empty fixture + `UNREADABLE_LISTING`   an empty copy the server said it couldn't list
//   status  1 + `Access failed: … No such file …`, no directory   the server holds none yet
//   status  1 + `BARE_550`, no directory   none yet only if the listing above confirms it
//   status  1 + `Fatal error: …`   the pull broke, state indeterminate
//   signal                          killed mid-run, likewise indeterminate
//   (no stub at all)                the binary isn't installed
const LFTP_STUB_BODY = `
case "$*" in
	*--dry-run*)
		if [ -n "\${LFTP_STUB_STDERR:-}" ]; then printf '%s\\n' "$LFTP_STUB_STDERR" >&2; fi
		printf '%s' "\${LFTP_STUB_DRY_RUN:-}"
		exit \${LFTP_STUB_DRY_RUN_STATUS:-0} ;;
	*"cls -1 "*)
		set -- $(printf '%s' "$2" | sed 's/; *$//; s/.*; //')
		if [ -n "\${LFTP_STUB_LIST_PATH:-}" ] && [ "$3" = "$LFTP_STUB_LIST_PATH/" ]; then
			printf '%s' "\${LFTP_STUB_LIST:-}"
			exit 0
		fi
		printf '%s\\n' "\${LFTP_STUB_LIST_STDERR:-cls: Access failed: 550 Failed to change directory. ($3)}" >&2
		exit 1 ;;
	*fdk-backup-*) exit \${LFTP_STUB_BACKUP_STATUS:-0} ;;
	*--reverse*) exit \${LFTP_STUB_UPLOAD_STATUS:-0} ;;
	*"open file:///"*)
		set -- $(printf '%s' "$2" | sed 's/; *$//; s/.*; //')
		eval "src=\\\${$(($# - 1))} dest=\\\${$#}"
		mkdir -p "$dest" && cp -R "$src/." "$dest/"
		exit 0 ;;
	*"cls -d"*)
		if [ -n "\${LFTP_STUB_EXISTS_STDERR:-}" ]; then printf '%s\\n' "$LFTP_STUB_EXISTS_STDERR" >&2; fi
		exit \${LFTP_STUB_EXISTS_STATUS:-0} ;;
esac
if [ -n "\${LFTP_STUB_STDERR:-}" ]; then printf '%s\\n' "$LFTP_STUB_STDERR" >&2; fi
if [ -n "\${LFTP_STUB_FIXTURE:-}" ] && [ -n "\${LFTP_STUB_DEST:-}" ]; then
	mkdir -p "$LFTP_STUB_DEST" && cp -R "$LFTP_STUB_FIXTURE/." "$LFTP_STUB_DEST/"
fi
if [ "\${LFTP_STUB_SIGNAL:-}" = "1" ]; then kill -TERM $$; sleep 5; fi
exit \${LFTP_STUB_STATUS:-0}
`;

// Where `deploy` puts the copy it pulls, for a resource of this name
const acfPullDest = name => require('path').join(require('os').tmpdir(), `fdk-acf-${name}`);

// lftp's own wrapper around whatever the far end said, in the shapes seen in the wild. The wording
// after a 550 is the server's, not lftp's: these say outright that the folder isn't there
const MISSING_FOLDER = {
	pureFtpd: `mirror: Access failed: 550 Can't change directory to /nope: No such file or directory`,
	pyftpdlib: 'mirror: Access failed: 550 No such file or directory. (/nope)',
	sftp: 'mirror: Access failed: No such file (/nope)',
};

// these say it is there and refused
const DENIED_FOLDER = {
	pureFtpd: "mirror: Access failed: 550 Can't change directory to /nope: Permission denied",
	sftp: 'mirror: Access failed: Permission denied (/nope)',
};

// vsftpd's answer both for a folder that isn't there and for one it refuses
const BARE_550 = 'mirror: Access failed: 550 Failed to change directory. (/nope)';

const BROKEN_PULL = 'mirror: Fatal error: max-retries exceeded (Connection refused)';

// lftp's `debug 5` transcript of a pull that came back empty and exited 0, as vsftpd 3.0.3 and
// pure-ftpd answered it: for a folder the login can write to but not list, and for one that is
// simply empty
const UNREADABLE_LISTING = {
	vsftpd: '---> LIST\n<--- 150 Here comes the directory listing.\n<--- 226 Transfer done (but failed to open directory).\n',
	pureFtpd: "---> MLSD\n<--- 550 Can't check for file existence\n---> PRET LIST \n<--- 200 Ready to proceed\n---> PASV\n"
		+ '<--- 227 Entering Passive Mode (127,0,0,1,117,151)\n---- Connecting data socket to (127.0.0.1) port 30103\n---> LIST\n'
		+ '<--- 150 Accepted data connection\n<--- 226-Sorry, we were unable to read [.]\n<--- 226-Options: -l \n<--- 226 0 matches total\n',
};
const EMPTY_LISTING = {
	vsftpd: '---> LIST\n<--- 150 Here comes the directory listing.\n<--- 226 Directory send OK.\n',
	pureFtpd: '---> MLSD\n<--- 150 Accepted data connection\n<--- 226 2 matches total\n',
};

module.exports = { BARE_550, BROKEN_PULL, DENIED_FOLDER, EMPTY_LISTING, LFTP_STUB_BODY, MISSING_FOLDER, UNREADABLE_LISTING, acfPullDest };
