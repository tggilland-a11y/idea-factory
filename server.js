/* ============================================================
   Idea Factory — RETIRED 2026-10-22.

   The hosted site was taken down at the request of the security team.
   Every submission was exported first; the record now lives in the
   Idea Factory Archive (a private Claude artifact) and in OneDrive
   under "Idea Factory/archive".

   This stub answers every request with 410 Gone. It never reads the
   data directory, has no sign-in, and exposes no API. The working
   collector is in git history (commit 7cc7885) if it is ever needed.
   ============================================================ */
"use strict";

const http = require("http");
const PORT = Number(process.env.PORT || 8080);

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Idea Factory — retired</title>
<style>
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #F7F5F2; color: #1A1A1A; }
  main { max-width: 560px; margin: 16vh auto; padding: 0 24px; }
  p.k { font-size: 11px; letter-spacing: .13em; text-transform: uppercase; color: #AF4739; font-weight: 700; }
  h1 { font-size: 28px; margin: 8px 0 12px; }
  p { color: #4A4845; line-height: 1.55; }
</style></head>
<body><main>
  <p class="k">Dragoneer &middot; Idea Factory</p>
  <h1>This site has been retired</h1>
  <p>Submissions are closed. The results are kept in the Idea Factory archive &mdash; ask Taylor for access.</p>
</main></body></html>`;

http.createServer((req, res) => {
  const wantsJson = /^\/api\//.test(req.url || "");
  res.writeHead(410, {
    "content-type": wantsJson ? "application/json; charset=utf-8" : "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(wantsJson ? JSON.stringify({ error: "This site has been retired." }) : PAGE);
}).listen(PORT, () => console.log("Idea Factory retired stub on port " + PORT));
