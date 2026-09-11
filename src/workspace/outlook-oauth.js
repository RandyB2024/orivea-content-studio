const crypto = require("crypto");
const { db } = require("./db");

const SCOPES = "openid profile offline_access User.Read Mail.Read";
const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";

function encryptionKey() {
  if (!process.env.ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY ontbreekt");
  return crypto.createHash("sha256").update(process.env.ENCRYPTION_KEY).digest();
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decrypt(value) {
  const [iv, tag, encrypted] = String(value).split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function config() {
  return {
    clientId: process.env.MS_CLIENT_ID || "",
    clientSecret: process.env.MS_CLIENT_SECRET || "",
    tenantId: process.env.MS_TENANT_ID || "common",
    redirectUri: process.env.MS_REDIRECT_URI || "https://content.orivea.nl/auth/outlook/callback"
  };
}

function configured() {
  const value = config();
  return Boolean(value.clientId && value.clientSecret && process.env.ENCRYPTION_KEY);
}

function connection() {
  return db.prepare("SELECT * FROM outlook_connections WHERE id=1").get() || null;
}

function saveTokens(tokens, account = {}) {
  const current = connection();
  const expiresAt = new Date(Date.now() + Math.max(60, Number(tokens.expires_in || 3600) - 60) * 1000).toISOString();
  db.prepare(`INSERT INTO outlook_connections (id,account_email,account_name,access_token,refresh_token,expires_at,scopes,status,last_error,updated_at)
    VALUES (1,?,?,?,?,?,?,?,'',CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET account_email=excluded.account_email,account_name=excluded.account_name,access_token=excluded.access_token,
    refresh_token=excluded.refresh_token,expires_at=excluded.expires_at,scopes=excluded.scopes,status='connected',last_error='',updated_at=CURRENT_TIMESTAMP`)
    .run(account.mail || account.userPrincipalName || current?.account_email || "", account.displayName || current?.account_name || "", encrypt(tokens.access_token), tokens.refresh_token ? encrypt(tokens.refresh_token) : current?.refresh_token || "", expiresAt, tokens.scope || SCOPES, "connected");
}

async function tokenRequest(params, fetchImpl = fetch) {
  const value = config();
  const response = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(value.tenantId)}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error(`Microsoft OAuth tokenfout (${response.status})`);
  return payload;
}

async function exchangeCode(code, verifier, fetchImpl = fetch) {
  const value = config();
  const tokens = await tokenRequest({ client_id:value.clientId, client_secret:value.clientSecret, code, redirect_uri:value.redirectUri, grant_type:"authorization_code", code_verifier:verifier, scope:SCOPES }, fetchImpl);
  const profileResponse = await fetchImpl(`${GRAPH_ROOT}/me?$select=displayName,mail,userPrincipalName`, { headers:{ Authorization:`Bearer ${tokens.access_token}` } });
  if (!profileResponse.ok) throw new Error(`Microsoft profiel kon niet worden gelezen (${profileResponse.status})`);
  const profile = await profileResponse.json();
  saveTokens(tokens, profile);
  return profile;
}

async function accessToken(fetchImpl = fetch) {
  const row = connection();
  if (!row?.refresh_token) throw new Error("Outlook opnieuw koppelen");
  if (row.access_token && new Date(row.expires_at).getTime() > Date.now()) return decrypt(row.access_token);
  try {
    const value = config();
    const tokens = await tokenRequest({ client_id:value.clientId, client_secret:value.clientSecret, refresh_token:decrypt(row.refresh_token), grant_type:"refresh_token", redirect_uri:value.redirectUri, scope:SCOPES }, fetchImpl);
    saveTokens(tokens);
    return tokens.access_token;
  } catch (error) {
    db.prepare("UPDATE outlook_connections SET status='reauth_required',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=1").run(error.message);
    throw error;
  }
}

function disconnect() { db.prepare("DELETE FROM outlook_connections WHERE id=1").run(); }
function status() {
  const row = connection();
  return { configured:configured(), connected:row?.status === "connected", status:row?.status || "not_connected", accountEmail:row?.account_email || null, accountName:row?.account_name || null, scopes:row?.scopes || null, expiresAt:row?.expires_at || null, lastError:row?.last_error || null };
}

module.exports = { SCOPES, config, configured, exchangeCode, accessToken, disconnect, status };
