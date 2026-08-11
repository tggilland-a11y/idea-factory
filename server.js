/* ============================================================
   Idea Factory — self-hosted collector.

   Zero dependencies: Node's own http/fs/crypto only, so it runs
   anywhere Node runs (a VM, Azure App Service, an internal box)
   with no install step and nothing to keep patched.

     node server.js                     # port 8080, ./data
     PORT=3000 DATA_DIR=D:/if node server.js

   Routes
     GET  /                     the submission form
     GET  /board                the session board
     POST /api/submissions      a submission arrives (open to the team)
     POST /api/auth             board passphrase -> signed cookie
     GET  /api/submissions      every submission (cookie required)
     GET  /api/health           liveness

   Storage is one JSON file per person under DATA_DIR/submissions.
   Plain files on purpose: point DATA_DIR at a synced OneDrive or
   SharePoint folder and the firm's normal backup covers the record.
   ============================================================ */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/* ---------------- config ---------------- */
const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const SUB_DIR = path.join(DATA_DIR, "submissions");

// Board passphrase, stored only as a PBKDF2 verifier.
const PASS_SALT = process.env.PASS_SALT || "dgnr-idea-factory-2026";
const PASS_ITERS = Number(process.env.PASS_ITERS || 250000);
const PASS_VERIFIER = process.env.PASS_VERIFIER ||
  "05e7146ff3fa774f0d473e2d38d8ab05c660e48b2ceff69774c07accc5dc88f4";

// Cookie signing key. Set SESSION_SECRET in production so sessions survive a
// restart; otherwise a random key means everyone signs in again after a deploy.
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);

const MAX_BODY = 256 * 1024;
const MAX_IDEAS = 10;

fs.mkdirSync(SUB_DIR, { recursive: true });

/* ---------------- helpers ---------------- */
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "").slice(0, 60) || "anon";

const clampScore = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(1, Math.min(10, Math.round(n))) : null;
};

const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("too_large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/* ---------------- sessions ---------------- */
function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}
function issueToken() {
  const exp = String(Date.now() + SESSION_HOURS * 3600 * 1000);
  return exp + "." + sign(exp);
}
function tokenValid(token) {
  if (!token || token.indexOf(".") < 0) return false;
  const [exp, mac] = token.split(".");
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = Buffer.from(sign(exp));
  const given = Buffer.from(String(mac));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
function cookieOf(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}
function checkPass(pass) {
  return new Promise((resolve) => {
    crypto.pbkdf2(String(pass || ""), PASS_SALT, PASS_ITERS, 32, "sha256", (err, key) => {
      if (err) return resolve(false);
      const a = Buffer.from(key.toString("hex"));
      const b = Buffer.from(PASS_VERIFIER);
      resolve(a.length === b.length && crypto.timingSafeEqual(a, b));
    });
  });
}

/* ---------------- store ---------------- */
function validateSubmission(raw) {
  if (!raw || typeof raw !== "object") return { error: "Not a submission." };
  const submitter = str(raw.submitter, 80);
  if (submitter.length < 2) return { error: "A submitter name is required." };
  if (!Array.isArray(raw.ideas) || !raw.ideas.length) return { error: "No ideas were included." };

  const ideas = [];
  for (const i of raw.ideas.slice(0, MAX_IDEAS)) {
    const company = str(i && i.company, 120);
    if (!company) continue;
    ideas.push({
      company,
      excitement: clampScore(i.excitement),
      actionability: clampScore(i.actionability),
      why: str(i.why, 4000),
      notes: str(i.notes, 4000),
      nextSteps: str(i.nextSteps, 4000)
    });
  }
  if (!ideas.length) return { error: "No ideas had a company name." };

  return {
    rec: {
      schema: "dragoneer.idea-factory/v1",
      submitter,
      session: str(raw.session, 60) || "Current session",
      submittedAt: new Date().toISOString(),
      ideas
    }
  };
}

function writeSubmission(rec) {
  // Append-only by design: every submission is a new file, nothing is ever
  // overwritten. People add more ideas by submitting again; nothing they have
  // already submitted can be edited or replaced from the form.
  const stamp = rec.submittedAt.replace(/[:.]/g, "-");
  const file = path.join(SUB_DIR,
    slug(rec.session) + "_" + slug(rec.submitter) + "_" + stamp + ".json");
  // Temp file then rename, so a crash mid-write cannot leave a torn record.
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(rec, null, 2), "utf8");
  fs.renameSync(tmp, file);
  return path.basename(file);
}

function readAll() {
  let names = [];
  try { names = fs.readdirSync(SUB_DIR); } catch (e) { return []; }
  const out = [];
  for (const n of names) {
    if (!n.endsWith(".json")) continue;
    try {
      const rec = JSON.parse(fs.readFileSync(path.join(SUB_DIR, n), "utf8"));
      if (rec && rec.submitter && Array.isArray(rec.ideas)) out.push(rec);
    } catch (e) { /* skip anything unreadable rather than failing the whole read */ }
  }
  out.sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)));
  return out;
}

/* ---------------- static ---------------- */
// The two HTML files are body fragments (they were authored to be hosted as
// Claude artifacts, which supply the skeleton), so wrap them here.
const SKELETON = (body, title) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>*,*::before,*::after{box-sizing:border-box}body{margin:0}</style>
</head>
<body>
${body}
</body>
</html>`;

function sendPage(res, file, title) {
  fs.readFile(path.join(ROOT, file), "utf8", (err, body) => {
    if (err) { json(res, 500, { error: "Page " + file + " is missing next to server.js." }); return; }
    const html = /<!doctype/i.test(body) ? body : SKELETON(body, title);
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin"
    });
    res.end(html);
  });
}

/* ---------------- routes ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  const p = url.pathname.replace(/\/+$/, "") || "/";

  try {
    if (req.method === "GET" && p === "/api/health") {
      return json(res, 200, { ok: true, submissions: readAll().length, dataDir: DATA_DIR });
    }

    if (req.method === "POST" && p === "/api/submissions") {
      let payload;
      try { payload = JSON.parse(await readBody(req)); }
      catch (e) {
        return json(res, e.message === "too_large" ? 413 : 400,
          { error: e.message === "too_large" ? "That submission is too large." : "Could not read the submission." });
      }
      const v = validateSubmission(payload);
      if (v.error) return json(res, 400, { error: v.error });
      let file;
      try { file = writeSubmission(v.rec); }
      catch (e) {
        console.error("write failed:", e.message);
        return json(res, 500, { error: "The server could not save your submission. Nothing was recorded." });
      }
      console.log(new Date().toISOString(), "saved", file, v.rec.ideas.length + " ideas");
      return json(res, 201, { ok: true, file, ideas: v.rec.ideas.length, submittedAt: v.rec.submittedAt });
    }

    if (req.method === "POST" && p === "/api/auth") {
      let pass = "";
      try { pass = (JSON.parse(await readBody(req)) || {}).passphrase; } catch (e) {}
      if (!(await checkPass(pass))) {
        await new Promise((r) => setTimeout(r, 400));   // blunt the guessing rate
        return json(res, 401, { error: "That passphrase does not match." });
      }
      const secure = (req.headers["x-forwarded-proto"] || "").includes("https") ? " Secure;" : "";
      res.setHeader("set-cookie",
        "dgnr_board=" + issueToken() + "; Path=/; HttpOnly; SameSite=Lax;" + secure +
        " Max-Age=" + SESSION_HOURS * 3600);
      return json(res, 200, { ok: true });
    }

    if (req.method === "GET" && p === "/api/submissions") {
      if (!tokenValid(cookieOf(req, "dgnr_board"))) {
        return json(res, 401, { error: "Sign in to the board first." });
      }
      return json(res, 200, { schema: "dragoneer.idea-factory.session/v1", submissions: readAll() });
    }

    if (req.method === "GET" && (p === "/" || p === "/submit")) {
      return sendPage(res, "submit.html", "Idea Factory — Submit Ideas");
    }
    if (req.method === "GET" && (p === "/board" || p === "/dashboard")) {
      return sendPage(res, "dashboard.html", "Idea Factory — Session Board");
    }

    json(res, 404, { error: "Not found." });
  } catch (e) {
    console.error("unhandled:", e);
    json(res, 500, { error: "Server error." });
  }
});

server.listen(PORT, () => {
  console.log("Idea Factory collector on http://localhost:" + PORT);
  console.log("  form   /        board  /board");
  console.log("  data   " + SUB_DIR);
  if (!process.env.SESSION_SECRET) {
    console.log("  note   SESSION_SECRET is unset, so board sign-ins reset when this restarts.");
  }
});
