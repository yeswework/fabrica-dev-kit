# Tests

Two tiers. The fast one is the default and needs nothing but Node and git; the live one needs
Docker and `lftp`, and is opt-in.

```bash
npm test           # unit + integration — no Docker, no lftp, no network
npm run test:live  # the real FTP/SFTP server matrix
```

The runner is `node:test`, which ships with Node. This package has six runtime dependencies and no
devDependencies, and a published CLI shouldn't grow a test framework to be tested.

## Layout

| Folder | What lives there | Needs |
| --- | --- | --- |
| `unit/` | one module under `lib/` per file, called directly | Node, git |
| `integration/` | the real CLI, driven as a child process against stub binaries | Node, git |
| `live/` | the real CLI and helpers against real servers | Docker, `lftp`, `ssh-keyscan` |
| `helpers/` | fixtures and stubs shared by all three | |
| `acf-json-guard.md` | a manual procedure, kept for the cases a harness can't judge | |

`live/` skips itself with a message naming what is missing, so `npm run test:live` on a machine
without Docker reports that rather than failing.

## Helpers

- **`tmpdir.js`** — `makeTmpDir()` for a throwaway folder, `cleanTmpDirs()` in an `after` hook to
  remove every one the file made. Nothing should write outside these.
- **`project.js`** — `makeProject()` builds a directory FDK recognises as an installed project:
  the `.setup.yml` marker plus the `docker-compose.yml` and `package.json` that must sit beside
  it. Resources can be given committed files, uncommitted files, or no git repository at all.
- **`stub-bin.js`** — `stubBin({ lftp: '…' })` writes fake executables into a folder and hands
  back a PATH to put in front. Each records its full command line, so a test can assert on the
  arguments a command was really called with rather than on what it printed. `{ absent: ['lftp'] }`
  narrows PATH to the stub folder instead, which is how a missing binary is simulated.
- **`lftp-stub.js`** — the `lftp` stub body, driven by environment variables, plus the real stderr
  wording four different servers produce for a folder that isn't there.
- **`run.js`** — `runFdk()` runs the CLI as a user would; `runNode()` evaluates a snippet in a
  child process, which is how anything reaching `halt` gets tested, since `halt` calls
  `process.exit` and would take the runner down with it.
- **`ftp-servers.js`** — starts and seeds the containers for the live tier.

## Adding a test

Put it beside the module it covers: a new helper in `lib/foo.js` gets cases in
`unit/foo.test.js`. If the behaviour only shows up through a command, it belongs in
`integration/`, driven with `runFdk` and a stub for whatever it shells out to. Reach for `live/`
only when the thing under test is what a real server or a real `lftp` does — that tier is slow and
needs a daemon.

Nothing in `unit/` or `integration/` may depend on Docker, `lftp`, the network, or anything in the
developer's home directory. Stub the binary and assert on the command line it was given.

### Known bugs

A bug that is filed but not yet fixed gets a test asserting the behaviour it *should* have, marked
`{ todo: '<bead id>' }`:

```js
test('a missing config.yml fails as softly as a malformed one',
	{ todo: 'fabrica-dev-kit-vgd' }, () => { … });
```

`node:test` reports these without failing the run, so the suite records the bug instead of
pretending it isn't there — and the day it is fixed the test starts passing and the marker comes
off. Keep the assertion narrow: a whole stack trace in the diff of every run costs more than the
reminder is worth.

## The live tier

`npm run test:live` starts three containers — `fdk-test-pureftpd`, `fdk-test-vsftpd` and
`fdk-test-sftp` — on high ports, seeds each with the same fixtures, and removes them afterwards.
It also covers `file://`, which needs no server.

It exists for one thing a stub can't reproduce: the sentence a server puts after its 550. All
three word a missing directory differently — and lftp's sftp transport words it differently again
— which is why the deploy guard matches lftp's own `Access failed:` wrapper rather than the
wording underneath. Those four sentences are also kept as fixtures in `helpers/lftp-stub.js`, so
the fast tier can check the matching without a server; the live tier is what proves the fixtures
still match reality.

Host-key checking is left on for the sftp container. The run scrapes the key with `ssh-keyscan`
into a `known_hosts` file scoped to that run — a throwaway container is not a reason to disable
verification, and the user's own `~/.ssh` is never touched.
