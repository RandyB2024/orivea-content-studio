const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const appRoot = path.resolve(__dirname, "..", "..");
const dbPath = path.resolve(appRoot, process.env.DATABASE_PATH || "data/orivea-workspace.sqlite");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE,
      customer_name TEXT,
      customer_email TEXT,
      customer_phone TEXT,
      customer_address TEXT,
      order_date TEXT,
      order_items TEXT,
      subtotal REAL DEFAULT 0,
      shipping_cost REAL DEFAULT 0,
      vat_rate REAL DEFAULT 21,
      vat_amount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      paypal_transaction_id TEXT,
      payment_status TEXT,
      payment_method TEXT,
      status TEXT DEFAULT 'Nieuw',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contact_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT,
      phone TEXT,
      subject TEXT,
      message_type TEXT,
      message_body TEXT,
      status TEXT DEFAULT 'Nieuw',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS newsletter_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT,
      name TEXT,
      event_type TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS social_posts (
      id TEXT PRIMARY KEY,
      date TEXT,
      category TEXT,
      theme TEXT,
      status TEXT,
      platform_payload TEXT,
      asset_id INTEGER,
      approved_by TEXT,
      approved_at TEXT,
      scheduled_at TEXT,
      published_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT,
      original_name TEXT,
      category TEXT,
      mime_type TEXT,
      size INTEGER,
      url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT,
      entity_id TEXT,
      action TEXT,
      previous_status TEXT,
      new_status TEXT,
      by_user TEXT,
      reason TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      start_date TEXT,
      end_date TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      target_url TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS content_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_name TEXT,
      content_type TEXT NOT NULL,
      category TEXT NOT NULL,
      caption_original TEXT,
      caption_orivea TEXT,
      product_reference TEXT,
      campaign_id INTEGER,
      valid_from TEXT,
      valid_until TEXT,
      usage_permission TEXT NOT NULL DEFAULT 'unknown',
      date_added TEXT DEFAULT CURRENT_TIMESTAMP,
      last_used TEXT,
      times_used INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'new',
      notes TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_item_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      media_path TEXT NOT NULL,
      thumbnail_path TEXT,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS studio_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_item_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      cta TEXT,
      target_url TEXT,
      generated_url TEXT,
      scheduled_at TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      approved_at TEXT,
      approved_by TEXT,
      published_at TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS post_platforms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      caption TEXT,
      hashtags TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      platform_post_id TEXT,
      error_message TEXT,
      UNIQUE(post_id, platform),
      FOREIGN KEY (post_id) REFERENCES studio_posts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS social_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL UNIQUE,
      account_id TEXT,
      account_name TEXT,
      access_token_encrypted TEXT,
      refresh_token_encrypted TEXT,
      token_expires_at TEXT,
      connected_at TEXT,
      status TEXT NOT NULL DEFAULT 'not_configured',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS publication_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      scheduled_at TEXT,
      started_at TEXT,
      published_at TEXT,
      platform_post_id TEXT,
      status TEXT NOT NULL,
      http_status INTEGER,
      error_code TEXT,
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      response_summary TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES studio_posts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_content_status ON content_items(status, category);
    CREATE INDEX IF NOT EXISTS idx_posts_schedule ON studio_posts(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_logs_post ON publication_logs(post_id, platform);
  `);

  const defaults = {
    autoPublish: "false",
    requiresApproval: "true",
    allowPerfumeReferences: "false",
    allowIncomeClaims: "false",
    allowMedicalClaims: "false",
    defaultLanguage: "nl",
    timezone: "Europe/Amsterdam",
    contentReuseCooldownDays: "21",
    productReuseCooldownDays: "7",
    defaultPostingTimes: "09:30,19:30",
    defaultPlatforms: "instagram,facebook,pinterest"
  };
  const insert = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  Object.entries(defaults).forEach(([key, value]) => insert.run(key, value));
}

module.exports = { db, initDb };
