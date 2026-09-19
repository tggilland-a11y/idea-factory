# Idea Factory

Monthly idea-submission site for the Dragoneer private team: a two-part form,
the team's session board, and a pipeline tracker that is safe to share beyond
the team.

## The monthly format (since September 2026)

- **Part 1 — pipeline & private opportunities.** Up to 10 names, each with a
  1–10 excitement score. Biased toward pipeline names in progress; new ideas
  count. **Shared broadly with colleagues outside the team** via the pipeline
  tracker.
- **Part 2 — not a big time bet today.** Up to 5 companies with the full six
  questions (company, excitement, actionability, why, notes, next steps).
  Team-only, discussed on the session board.

August 2026 predates the split: those records carry six-question ideas only and
appear on the board under their own session.

## Pages

| Path | What | Who |
|---|---|---|
| `/` | The form. First name + last initial, then Part 1 and Part 2. Submitting files everything directly — nothing is saved to the submitter's computer. Submissions are append-only: no editing after submit, but submitting again adds more. | Anyone with the link |
| `/board` | Session board for Part 2: agenda ranked by total excitement, conviction/actionability map, per-person views, present mode. One month at a time — a session picker (and `?session=september-2026` links) switches months. | Team (board passphrase) |
| `/pipeline` | Pipeline tracker for Part 1: this month's ranking by total excitement points and a month-over-month matrix with deltas. Shows names, points, and vote counts — never individual attributions or Part 2 commentary. | Broad (tracker passphrase; the board passphrase works too) |

## Run it

```bash
node server.js
```

Zero dependencies, Node built-ins only.

## Configuration

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `8080` | Listening port. |
| `DATA_DIR` | `./data` | Where submissions are written (point at persistent/backed-up storage). |
| `SESSION_SECRET` | random each start | Signs sign-in cookies. Set it, or everyone signs in again after a restart. |
| `PASS_VERIFIER` | current board passphrase | PBKDF2-SHA256 verifier for the board. |
| `PIPE_VERIFIER` | current tracker passphrase | Verifier for the pipeline tracker's viewer passphrase. |
| `PASS_SALT` | `dgnr-idea-factory-2026` | Salt for both verifiers. |
| `PASS_ITERS` | `250000` | PBKDF2 iterations. |
| `SESSION_HOURS` | `12` | How long a sign-in lasts. |

### Changing a passphrase

Passphrases are never stored, only verifiers. Generate one:

```bash
node -e "const c=require('crypto');c.pbkdf2(process.argv[1],'dgnr-idea-factory-2026',250000,32,'sha256',(e,k)=>console.log(k.toString('hex')))" "your new passphrase"
```

Set the output as `PASS_VERIFIER` (board) or `PIPE_VERIFIER` (tracker). The
board's offline fallback also has a `VERIFIER` constant inside
`dashboard.html`.

## Where submissions go

One JSON file per submission under `DATA_DIR/submissions`, named
`<session>_<person>_<timestamp>.json`. Append-only: nothing is ever
overwritten; the board's owner-only Remove is the single deletion path.
Writes go to a temp file then rename, so a crash cannot tear a record.

## API

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/submissions` | open | A submission arrives (both parts). Validated and size-capped. |
| `POST /api/auth` | — | Board passphrase → `board`-scoped cookie. |
| `POST /api/pipe-auth` | — | Tracker (or board) passphrase → `pipe`-scoped cookie. |
| `GET /api/submissions` | board cookie | Everything, for the board. |
| `DELETE /api/submissions?file=` | board cookie | Owner removes one submission. |
| `GET /api/pipeline` | pipe or board cookie | Part 1 only: submitter, session, names, scores. |
| `GET /api/health` | open | Liveness and a submission count. |

Cookie scopes are enforced server-side: a tracker sign-in can never read the
board's six-question commentary.

`POST /api/submissions` is deliberately open so the form is frictionless;
whoever can reach the site can submit under any name. Fine behind a VPN or SSO
proxy; on the open internet it is a trade-off made knowingly.

## Deploying

Currently on Render (auto-deploys from `main`, persistent disk at `/var/data`,
HTTPS terminated by Render — see `render.yaml`). Anything that runs Node works;
set `DATA_DIR` to storage that survives deploys.

## Notes

- The Dragoneer logo is embedded in all three pages as a data URI — no external
  requests.
- All pages are deliberately light-only after a half-applied dark theme broke
  the form on dark-mode phones.
- Chart colours are the house palette (`#AF4739` red, `#226296` navy),
  validated for colour-blind separation and contrast.
