# Verifying the `acf-json` deploy guard

Manual procedure for the check added in #58. It builds a throwaway resource and deploys it into a
scratch directory on a server, so no real site or theme is involved at any point. Runnable by hand or
by an agent — each case states the exact command and the exact expected outcome.

Allow about ten minutes.

## What you need

- `lftp`, and this branch of FDK linked as your `fdk` binary (`npm link` in the repo, or run
  `node /path/to/index.js` in place of `fdk` throughout).
- A deploy target you can write a scratch directory to: any FTP/SFTP account you already use. It
  never touches WordPress — the files land in a directory nothing reads. Copy the `ftp:` block from
  one of your own `config.yml` files and change only `path`.
- `git`.

Nothing here needs shell access on the server. Every "the server is ahead" state is produced by
deploying a newer file and then rewinding the local copy, which is also how the original bug
happened.

## Setup

Two directories: a stub FDK project, and a git repo standing in for a theme.

```bash
mkdir -p /tmp/guard-test/proj /tmp/guard-test/guard-theme/acf-json
cd /tmp/guard-test/proj
touch .setup.yml docker-compose.yml
printf '{"name":"guardtest","description":"acf-json guard harness","scripts":{}}\n' > package.json
```

`config.yml`, with the `ftp:` block replaced by your own and `path` pointing somewhere disposable:

```yaml
default:
  themes:
    - ../guard-theme
  ftp:
    user: <your user>
    password: "<your password>"
    host: <your host>
    scheme: "sftp"
    port: "18765"
    path: "/home/customer/www/<a site you control>/tmp-fdk-guard-test"
    params: [--delete]
    commands:
      - set sftp:auto-confirm yes
      - set sftp:connect-program "ssh -a -x -p 18765 -i ~/.ssh/<your key>"
      - set net:max-retries 2
      - set net:timeout 20
```

Then the resource — two field groups, both stamped `1000`:

```bash
cd /tmp/guard-test/guard-theme
printf '.git/\n.distignore\n' > .distignore
printf '{"key":"group_alpha","title":"Alpha","fields":[],"modified":1000}\n' > acf-json/group_alpha.json
printf '{"key":"group_beta","title":"Beta","fields":[],"modified":1000}\n' > acf-json/group_beta.json
git init -q && git add -A && git commit -q -m seed
```

Run every `fdk deploy` below from `/tmp/guard-test/proj`. Outside a project directory `fdk` doesn't
register the `deploy` command at all, and `--force` fails with `unknown option`.

## The cases

### 1. No remote `acf-json` yet

First deploy, nothing on the server to lose.

```bash
fdk deploy
```

**Expect:** both files transfer. No warning. In particular no `Access failed: No such file` — the
pre-flight is silenced precisely so a first deploy doesn't look like a failure.

### 2. In sync

```bash
fdk deploy
```

**Expect:** the `Deploying resource` line and nothing else.

### 3. Local newer — the everyday case

The one that must not be blocked: a field group edited locally, on its way up.

```bash
cd /tmp/guard-test/guard-theme
printf '{"key":"group_alpha","title":"Alpha","fields":[],"modified":2000}\n' > acf-json/group_alpha.json
git commit -qam "local edit"
cd /tmp/guard-test/proj && fdk deploy
```

**Expect:** `group_alpha.json` transfers. No warning.

### 4. Server newer, working tree clean

Rewind the local copy and commit, so the tree is clean and the server holds `2000` against the
local `1000`.

```bash
cd /tmp/guard-test/guard-theme
printf '{"key":"group_alpha","title":"Alpha","fields":[],"modified":1000}\n' > acf-json/group_alpha.json
git commit -qam rewind
git status --short          # must be empty
cd /tmp/guard-test/proj && fdk deploy
```

**Expect:** deploy stops, naming `acf-json/group_alpha.json`, saying it has been pulled into the
working tree. Then:

```bash
cd /tmp/guard-test/guard-theme
git status --short                              # ` M acf-json/group_alpha.json`
grep -o '"modified":[0-9]*' acf-json/group_alpha.json   # `"modified":2000`
```

The server's version is now an ordinary unstaged change, ready to review and commit. Nothing was
uploaded.

### 5. Server newer, and the file is dirty

The refusal case: pulling would destroy uncommitted local work.

```bash
cd /tmp/guard-test/guard-theme
printf '{"key":"group_alpha","title":"Alpha","fields":[],"modified":1500}\n' > acf-json/group_alpha.json
cd /tmp/guard-test/proj && fdk deploy
```

**Expect:** deploy stops with `Pulling them would overwrite uncommitted local changes`, naming the
file, and:

```bash
grep -o '"modified":[0-9]*' /tmp/guard-test/guard-theme/acf-json/group_alpha.json   # still 1500
```

The local file must be untouched. If it reads `2000`, the dirty check has failed and the guard has
destroyed local work — that is the serious failure mode for this feature.

### 6. `--force` overrides

```bash
cd /tmp/guard-test/guard-theme && git restore acf-json/group_alpha.json
cd /tmp/guard-test/proj && fdk deploy --force
```

**Expect:** `group_alpha.json` transfers, overwriting the newer server copy. No warning.

### 7. A group that exists only on the server

Stands in for a field group created in production wp-admin that the repo has never seen.

```bash
cd /tmp/guard-test/guard-theme
git rm -q acf-json/group_beta.json && git commit -qm "drop beta locally"
cd /tmp/guard-test/proj && fdk deploy
```

**Expect:** deploy stops, naming `acf-json/group_beta.json` as pulled. Then:

```bash
cd /tmp/guard-test/guard-theme && git status --short   # `?? acf-json/group_beta.json`
```

It comes back as an untracked file rather than a modification, which is correct — the repo never had
it.

## Teardown

```bash
rm -rf /tmp/guard-test
```

Then delete the scratch directory on the server. Over SSH that is one `rm -rf` of the `path` you
configured; over FTP, remove it in your client.

## Not covered

The "resource isn't a git repository" branch, which warns and declines to pull. Every resource in
the fleet is a git repo, so there is nothing realistic to run it against.

## Two traps in the harness itself

Neither is caused by this change; both will stop you before you reach case 1.

- **`package.json` needs a `scripts` key**, even empty. `addScriptCommands` calls `Object.keys` on
  it unguarded, so a stub without one crashes `fdk` on startup with `Cannot convert undefined or
  null to object`.
- **The `ftp:` block needs a `password`, even a placeholder, when authenticating by SSH key.**
  Without one, lftp falls back to anonymous login, drops the configured user, and fails with
  `GetPass() failed -- assume anonymous login` followed by `Permission denied (publickey)`.
