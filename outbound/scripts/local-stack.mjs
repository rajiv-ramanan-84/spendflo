/**
 * Local stand-in for a Supabase project, for end-to-end checks on one machine:
 * Postgres (stubs + migrations + seeds) + PostgREST + a small gateway that
 * serves /rest/v1 and a minimal /auth/v1.
 *
 * Usage: node scripts/local-stack.mjs <data-dir> <postgrest-binary>
 * Prints the env vars to point the app at it. Tokens are HS256 JWTs signed
 * with a local secret; user tokens carry sub = auth user id.
 */
import { spawn, execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const [dataDir, pgrstBin] = process.argv.slice(2);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PG_PORT = 55433, PGRST_PORT = 54322, GATEWAY_PORT = 54321;
const SECRET = "local-dev-jwt-secret-at-least-32-characters-long";
const pgbin = execFileSync("bash", ["-c", "ls -d /usr/lib/postgresql/*/bin | tail -1"]).toString().trim();
const asPg = (cmd, args) => execFileSync("runuser", ["-u", "postgres", "--", cmd, ...args], { stdio: "pipe" }).toString();

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export function jwt(claims) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ exp: Math.floor(Date.now() / 1000) + 86400 * 30, ...claims });
  return `${head}.${body}.${createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;
}

const fresh = !existsSync(path.join(dataDir, "PG_VERSION"));
if (fresh) {
  mkdirSync(dataDir, { recursive: true });
  execFileSync("chown", ["-R", "postgres", dataDir]);
  asPg(`${pgbin}/initdb`, ["-D", dataDir, "-U", "postgres", "-A", "trust"]);
}
let running = false;
try { asPg(`${pgbin}/pg_ctl`, ["-D", dataDir, "status"]); running = true; } catch {}
if (!running) asPg(`${pgbin}/pg_ctl`, ["-D", dataDir, "-o", `-p ${PG_PORT} -k /tmp -c listen_addresses=localhost`, "-l", path.join(dataDir, "log"), "-w", "start"]);
const psql = (file) => execFileSync("psql", ["-h", "localhost", "-p", String(PG_PORT), "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-f", file]);
if (fresh) {
  psql(`${ROOT}/supabase/tests/supabase_stubs.sql`);
  for (const f of readdirSync(`${ROOT}/supabase/migrations`).sort()) psql(`${ROOT}/supabase/migrations/${f}`);
  for (const f of ["seed.sql", "seed_holidays.sql", "seed_skill.sql"]) psql(`${ROOT}/supabase/${f}`);
}

const conf = path.join(dataDir, "..", "postgrest.conf");
writeFileSync(conf, [
  `db-uri = "postgres://authenticator@localhost:${PG_PORT}/postgres"`,
  `db-schemas = "public"`,
  `db-anon-role = "anon"`,
  `jwt-secret = "${SECRET}"`,
  `server-port = ${PGRST_PORT}`,
].join("\n"));
const pgrst = spawn(pgrstBin, [conf], { stdio: "inherit" });

const anonKey = jwt({ role: "anon" });
const serviceKey = jwt({ role: "service_role" });

function userFromBearer(h) {
  const t = (h ?? "").replace(/^Bearer /, "");
  try {
    const [, body] = t.split(".");
    const c = JSON.parse(Buffer.from(body, "base64url").toString());
    return c.sub ? c : null;
  } catch { return null; }
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/rest/v1")) {
    const fwd = http.request({ host: "localhost", port: PGRST_PORT, path: url.pathname.slice("/rest/v1".length) + url.search, method: req.method, headers: { ...req.headers, host: `localhost:${PGRST_PORT}` } }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    fwd.on("error", (e) => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: `PostgREST not reachable: ${e.code}` }));
    });
    req.pipe(fwd);
    return;
  }
  if (url.pathname === "/auth/v1/user") {
    const c = userFromBearer(req.headers.authorization);
    if (!c) { res.writeHead(401, { "content-type": "application/json" }); return res.end('{"msg":"invalid"}'); }
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ id: c.sub, email: c.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: { full_name: c.name } }));
  }
  if (url.pathname.startsWith("/auth/v1/logout")) { res.writeHead(204); return res.end(); }
  res.writeHead(404); res.end();
}).listen(GATEWAY_PORT);

console.log(JSON.stringify({ NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${GATEWAY_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey, PG_PORT }));
const stop = () => { pgrst.kill(); try { asPg(`${pgbin}/pg_ctl`, ["-D", dataDir, "-m", "fast", "stop"]); } catch {} process.exit(0); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
