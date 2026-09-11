const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

process.env.DATABASE_PATH = "data/test-outlook-oauth.sqlite";
process.env.ENCRYPTION_KEY = "test-key-that-is-never-used-in-production";
process.env.MS_CLIENT_ID = "client";
process.env.MS_CLIENT_SECRET = "secret";
process.env.MS_TENANT_ID = "tenant";
process.env.MS_REDIRECT_URI = "https://content.orivea.nl/auth/outlook/callback";
const dbFile = path.resolve(__dirname, "..", process.env.DATABASE_PATH);
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dbFile + suffix, {force:true});

const { db, initDb } = require("../src/workspace/db");
const outlook = require("../src/workspace/outlook-oauth");
initDb();
const mockFetch = async (url) => String(url).includes("/token")
  ? new Response(JSON.stringify({access_token:"ACCESS-SECRET",refresh_token:"REFRESH-SECRET",expires_in:3600,scope:outlook.SCOPES}),{status:200,headers:{"Content-Type":"application/json"}})
  : new Response(JSON.stringify({displayName:"ORIVÈA Mailbox",mail:"shop@orivea.nl",userPrincipalName:"shop@orivea.nl"}),{status:200,headers:{"Content-Type":"application/json"}});

(async()=>{
  await outlook.exchangeCode("code","verifier",mockFetch);
  const row=db.prepare("SELECT * FROM outlook_connections WHERE id=1").get();
  assert.equal(row.status,"connected");
  assert.equal(row.account_email,"shop@orivea.nl");
  assert.doesNotMatch(row.access_token,/ACCESS-SECRET/);
  assert.doesNotMatch(row.refresh_token,/REFRESH-SECRET/);
  assert.equal(await outlook.accessToken(mockFetch),"ACCESS-SECRET");
  outlook.disconnect();
  assert.equal(outlook.status().connected,false);
  console.log("Outlook OAuth tests geslaagd: code exchange, versleutelde tokens, status en disconnect.");
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dbFile + suffix, {force:true});
})().catch((error)=>{console.error(error);db.close();process.exitCode=1;});
