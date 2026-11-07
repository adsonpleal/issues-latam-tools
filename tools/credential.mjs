// A Google access token from whatever already exists on this machine.
//
// Prefers a service account key (GOOGLE_APPLICATION_CREDENTIALS); without one,
// uses the refresh token that `firebase login` left in firebase-tools'
// configstore -- so running the seed does not require downloading any key.

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// firebase-tools' public client id/secret (they are in its open source).
const CLI_CLIENT_ID =
  "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const CLI_CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";

const SCOPE = "https://www.googleapis.com/auth/datastore";

function base64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

async function tokenFromServiceAccount(path) {
  const sa = JSON.parse(readFileSync(path, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${body}`)
    .sign(sa.private_key, "base64url");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${body}.${signature}`,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`service account: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function tokenFromCLI() {
  const file = join(homedir(), ".config", "configstore", "firebase-tools.json");
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error("run 'firebase login' or set GOOGLE_APPLICATION_CREDENTIALS");
  }
  const refresh = cfg?.tokens?.refresh_token;
  if (!refresh) throw new Error(`no refresh token in ${file} — run 'firebase login'`);

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLI_CLIENT_ID,
      client_secret: CLI_CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`refresh token: ${JSON.stringify(j)}`);
  return j.access_token;
}

export async function accessToken() {
  const sa = process.env["GOOGLE_APPLICATION_CREDENTIALS"];
  return sa ? tokenFromServiceAccount(sa) : tokenFromCLI();
}
