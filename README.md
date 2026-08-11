# Idea Factory

Monthly idea-submission site for the Dragoneer private team, plus the board that
runs the session.

- `submit.html` — the form. First name and last initial, then 3–10 ideas, six
  questions each. Pressing Submit files the ideas directly; nothing is saved to
  the submitter's computer and there is nothing to email.
- `dashboard.html` — the session board. Passphrase protected. Loads every
  submission, charts them, and runs the meeting in Present mode.
- `server.js` — the collector. Zero dependencies, Node built-ins only.

## Run it

```bash
node server.js
```

Then the form is at `http://localhost:8080/` and the board at
`http://localhost:8080/board`.

For anything real, set the two environment variables below and put it behind
HTTPS.

## Configuration

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `8080` | Listening port. |
| `DATA_DIR` | `./data` | Where submissions are written. **Point this at a synced OneDrive or SharePoint folder** so the firm's normal backup covers the record. |
| `SESSION_SECRET` | random each start | Signs board sign-in cookies. Set it, or everyone signs in again after a restart. |
| `PASS_VERIFIER` | current passphrase | PBKDF2-SHA256 verifier for the board passphrase. See below to change it. |
| `PASS_SALT` | `dgnr-idea-factory-2026` | Salt for the verifier. Change it and the verifier together. |
| `PASS_ITERS` | `250000` | PBKDF2 iterations. |
| `SESSION_HOURS` | `12` | How long a board sign-in lasts. |

Example on Windows:

```bash
set SESSION_SECRET=some-long-random-string && set DATA_DIR=C:\Users\Taylor\OneDrive - Dragoneer Investment Group\Idea Factory && node server.js
```

### Changing the board passphrase

The passphrase is never stored, only a verifier. Generate a new one:

```bash
node -e "const c=require('crypto');c.pbkdf2(process.argv[1],'dgnr-idea-factory-2026',250000,32,'sha256',(e,k)=>console.log(k.toString('hex')))" "your new passphrase"
```

Set the output as `PASS_VERIFIER`. It also needs updating inside
`dashboard.html` (the `VERIFIER` constant) for the offline fallback path.

## Where submissions go

One JSON file per person per session, under `DATA_DIR/submissions`, named
`<session>_<person>.json`. Plain readable files on purpose — no database to
maintain or migrate.

Writes go to a temp file and are then renamed, so an interrupted write cannot
truncate an existing submission. Submitting again replaces that person's file
rather than adding a duplicate, so people can revise up to the meeting.

The board also has a **Choose archive folder** control that writes a second copy
wherever you point it. That is belt-and-braces; with `DATA_DIR` on OneDrive the
server copy is already the durable record.

## API

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/submissions` | open | A submission arrives. Validated and size-capped. |
| `POST /api/auth` | — | Board passphrase in, signed HttpOnly cookie out. |
| `GET /api/submissions` | cookie | Every submission, for the board. |
| `GET /api/health` | open | Liveness and a submission count. |

`POST /api/submissions` is deliberately open so anyone who can reach the page
can submit. That means **whoever can reach the site can submit under any name** —
fine on an internal network, not fine on the open internet. Put it behind the
VPN, or in front of your SSO proxy, and let that establish identity.

Reading submissions always requires the passphrase, server-side.

## Deploying

It is one file with no dependencies, so most options work:

- **Internal VM or box** — simplest. Run it behind the VPN with a reverse proxy
  terminating HTTPS.
- **Azure App Service (Node)** — deploy the folder, set the environment
  variables, and set `DATA_DIR` to persistent storage, not the default
  filesystem. Restrict access with Easy Auth against Entra ID and you get real
  identity for free.
- **Anywhere else Node runs** — nothing special required.

Whatever you pick, terminate HTTPS in front of it. The cookie is marked `Secure`
automatically when it sees `X-Forwarded-Proto: https`.

## Without a collector

The form **requires** the collector: submitting never touches the submitter's
computer, so if the board is unreachable the page says plainly that nothing was
recorded and offers a retry — the draft stays safe in the browser. There is no
file fallback by design.

The board is more forgiving offline: it verifies the passphrase locally and can
still load submissions by file drop, paste, or session archive — useful for
re-reading an old session's archive folder.

## Notes

- The Dragoneer logo is embedded in both pages as a data URI, so they work with
  no external requests and render offline.
- Data-viz colours are the house chart palette (`#AF4739` red, `#226296` navy),
  validated for colour-blind separation and contrast in both light and dark mode.
- Both pages follow the viewer's light/dark preference.
