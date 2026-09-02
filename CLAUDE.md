**This repo is FDK itself, not a project that uses it.** Editing here changes the toolkit for every project on the machine, so a change is not proven until it has been run against a real FDK project.

`index.js` is the `fdk` CLI (a `commander` program, published to npm as the `fdk` bin). It is a shell/node hybrid — the first two lines are an `sh` shim that re-execs node — and it works by shelling out through `shelljs` to `docker compose`, mostly as `docker compose exec -u www-data -T wp <cmd>`. It holds the command wiring, the `config:*` commands and `buildResources`; everything else lives in `lib/`:

| Module | Holds |
| --- | --- |
| `lib/util.js` | `echo`, `warn`, `halt`, `wait` and the exec helpers |
| `lib/config.js` | `getProjectConfig` — its `project` argument is a section name in `config.yml`, *not* the state object below |
| `lib/project.js` | the mutable `project` state object and `loadProjectSettings` |
| `lib/portless.js` | the Portless proxy and alias helpers |
| `lib/docker.js` | `waitForWebContainer` and the container port and URL getters |
| `lib/setup.js` | `init`, `setup` and everything they call |
| `lib/deploy.js` | `deploy` and the ACF preflight helpers |

`project` is a single object mutated in place and imported by reference — never reassign it and never spread it into a copy, or the copy stops seeing later writes. `__dirname` inside `lib/` is not the package root, so anything reaching for `dev/` or `setup.yml.js` goes through `lib/setup.js`'s `FDK_ROOT`.

`dev/` holds the templates FDK writes into a new project: `docker-compose.yml.js`, `package.json.js`, `config.yml`, `webpack.config.js` and `provision/`. A change to project scaffolding belongs there, not in `index.js`.

## Tests

`npm test` runs the unit and integration tiers: no Docker, no `lftp`, no network. `npm run test:live` runs an opt-in tier against real FTP and SFTP servers in containers, and skips itself with a message when Docker or `lftp` is missing. `test/README.md` covers the layout, the helpers and how to add a case — including the `{ todo: '<bead id>' }` convention for a bug that is filed but not yet fixed.

Neither tier replaces the first line of this file: a change still isn't proven until it has been run against a real FDK project.

## Issue tracking

This repo uses **Beads (`bd`)** rather than markdown TODOs: `bd ready` for available work, `bd update <id> --claim`, `bd close <id>`. Issue data lives in a Dolt database under `.beads/` and syncs over `refs/dolt/data` on this remote; `.beads/issues.jsonl` is a passive export, not the source of truth.

Two conventions here override bd's own generated guidance, which says the opposite:

- **Ask before tracking.** bd says create a bead before writing any code. Ask first instead — tiny edits and one-off questions are exempt.
- **Sync freely.** `bd dolt pull` at the start of a session and `bd dolt push` at the end, without asking. That grants no authority over `git commit` or `git push`.
