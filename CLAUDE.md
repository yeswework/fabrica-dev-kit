**This repo is FDK itself, not a project that uses it.** Editing here changes the toolkit for every project on the machine, so a change is not proven until it has been run against a real FDK project.

`index.js` is the whole `fdk` CLI (a `commander` program, published to npm as the `fdk` bin). It is a shell/node hybrid — the first two lines are an `sh` shim that re-execs node — and it works by shelling out through `shelljs` to `docker compose`, mostly as `docker compose exec -u www-data -T wp <cmd>`.

`dev/` holds the templates FDK writes into a new project: `docker-compose.yml.js`, `package.json.js`, `config.yml`, `webpack.config.js` and `provision/`. A change to project scaffolding belongs there, not in `index.js`.

## Issue tracking

This repo uses **Beads (`bd`)** rather than markdown TODOs: `bd ready` for available work, `bd update <id> --claim`, `bd close <id>`. Issue data lives in a Dolt database under `.beads/` and syncs over `refs/dolt/data` on this remote; `.beads/issues.jsonl` is a passive export, not the source of truth.

Two conventions here override bd's own generated guidance, which says the opposite:

- **Ask before tracking.** bd says create a bead before writing any code. Ask first instead — tiny edits and one-off questions are exempt.
- **Sync freely.** `bd dolt pull` at the start of a session and `bd dolt push` at the end, without asking. That grants no authority over `git commit` or `git push`.
