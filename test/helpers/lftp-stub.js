'use strict';

// A stubbed `lftp` for the deploy tests. FDK shells out to it twice per resource — once for the
// ACF preflight (`mirror --verbose=0 <remote> <dest>`) and once for the upload
// (`mirror --reverse …`) — and the guard's whole job is to tell those two apart, so the stub
// branches on `--reverse` and only ever fakes the preflight.
//
// The destination is passed in rather than parsed back out of the command script: `deploy` builds
// it as `<tmpdir>/fdk-acf-<resource>`, which a test can compute for itself with `acfPullDest`.
//
// Outcomes, matching the ones the guard has to distinguish:
//   status  0 + fixture   a copy arrived
//   status  1 + `Access failed: 550 …`, no directory   the server holds none yet
//   status  1 + `Fatal error: …`   the pull broke, state indeterminate
//   signal                          killed mid-run, likewise indeterminate
//   (no stub at all)                the binary isn't installed
const LFTP_STUB_BODY = `
case "$*" in
	*--reverse*) exit 0 ;;
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

// lftp's own wrapper around whatever the far end said. The wording after a 550 is the server's,
// not lftp's, so the guard matches the wrapper — these are the four shapes seen in the wild
const MISSING_FOLDER = {
	pureFtpd: `mirror: Access failed: 550 Can't change directory to /nope: No such file or directory (/nope)`,
	pyftpdlib: 'mirror: Access failed: 550 No such file or directory. (/nope)',
	sftp: 'mirror: Access failed: No such file (/nope)',
	vsftpd: 'mirror: Access failed: 550 Failed to change directory. (/nope)',
};

const BROKEN_PULL = 'mirror: Fatal error: max-retries exceeded (Connection refused)';

module.exports = { BROKEN_PULL, LFTP_STUB_BODY, MISSING_FOLDER, acfPullDest };
