const fs = require("fs");
const path = require("path");
const { db, dbPath, initDb } = require("../src/workspace/db");

const appRoot = path.resolve(__dirname, "..");
const uploadRoot = path.resolve(appRoot, process.env.UPLOAD_PATH || "data/uploads");
const knowledgeRoot = path.resolve(appRoot, process.env.KNOWLEDGE_PATH || "data/knowledge");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const backupRoot = path.join(appRoot, "backups", `backup-${stamp}`);
const databaseDir = path.join(backupRoot, "database");
const mediaDir = path.join(backupRoot, "media");

async function run() {
  initDb();
  fs.mkdirSync(databaseDir, { recursive: true });
  await db.backup(path.join(databaseDir, "orivea-content-studio.sqlite"));

  const tables = ["campaigns", "campaign_bundles", "bundle_items", "content_items", "content_knowledge_links", "knowledge_documents", "knowledge_chunks", "media_assets", "media_tags", "studio_posts", "post_media", "post_knowledge_sources", "post_platforms", "social_accounts", "publication_logs", "ai_generations", "agent_tasks", "agent_events", "agent_state", "settings"];
  const metadata = Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT * FROM ${table}`).all().map((row) => {
    if ("access_token_encrypted" in row) row.access_token_encrypted = row.access_token_encrypted ? "[REDACTED]" : null;
    if ("refresh_token_encrypted" in row) row.refresh_token_encrypted = row.refresh_token_encrypted ? "[REDACTED]" : null;
    return row;
  })]));
  fs.writeFileSync(path.join(backupRoot, "metadata.json"), JSON.stringify(metadata, null, 2));

  if (fs.existsSync(uploadRoot)) fs.cpSync(uploadRoot, mediaDir, { recursive: true });
  if (fs.existsSync(knowledgeRoot)) fs.cpSync(knowledgeRoot, path.join(backupRoot, "knowledge"), { recursive: true });
  const manifest = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath || entry.path, entry.name).replace(`${mediaDir}${path.sep}`, "")) : [];
  fs.writeFileSync(path.join(backupRoot, "upload-manifest.json"), JSON.stringify({ createdAt: new Date().toISOString(), sourceDatabase: path.basename(dbPath), files: manifest }, null, 2));
  console.log(`Backup gereed: ${backupRoot}`);
}

run().then(() => db.close()).catch((error) => { console.error("Backup mislukt:", error.message); process.exitCode = 1; });
