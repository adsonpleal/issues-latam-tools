// Access token do Google a partir do que já existe na máquina.
//
// Preferência para uma chave de service account (GOOGLE_APPLICATION_CREDENTIALS);
// sem ela, usa o refresh token que o `firebase login` deixou no configstore do
// firebase-tools — assim rodar o seed não exige baixar chave nenhuma.

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Client id/secret públicos do firebase-tools (estão no código aberto dele).
const CLI_CLIENT_ID =
  "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const CLI_CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";

const ESCOPO = "https://www.googleapis.com/auth/datastore";

function base64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

async function tokenPorServiceAccount(caminho) {
  const sa = JSON.parse(readFileSync(caminho, "utf8"));
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: ESCOPO,
      aud: "https://oauth2.googleapis.com/token",
      iat: agora,
      exp: agora + 3600,
    }),
  );
  const assinatura = createSign("RSA-SHA256")
    .update(`${cabecalho}.${corpo}`)
    .sign(sa.private_key, "base64url");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${cabecalho}.${corpo}.${assinatura}`,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`service account: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function tokenPorCLI() {
  const arquivo = join(homedir(), ".config", "configstore", "firebase-tools.json");
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(arquivo, "utf8"));
  } catch {
    throw new Error("rode 'firebase login' ou defina GOOGLE_APPLICATION_CREDENTIALS");
  }
  const refresh = cfg?.tokens?.refresh_token;
  if (!refresh) throw new Error(`sem refresh token em ${arquivo} — rode 'firebase login'`);

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
  return sa ? tokenPorServiceAccount(sa) : tokenPorCLI();
}
