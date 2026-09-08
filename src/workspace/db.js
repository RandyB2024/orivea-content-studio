const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const appRoot = path.resolve(__dirname, "..", "..");
const dbPath = path.resolve(appRoot, process.env.DATABASE_PATH || "data/orivea-content-studio.sqlite");
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

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT,
      phone TEXT,
      address TEXT,
      newsletter_opt_in INTEGER NOT NULL DEFAULT 0,
      newsletter_opt_in_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_reference TEXT,
      variant TEXT,
      variant_label TEXT,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      line_total REAL NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS webshop_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      aggregate_id TEXT,
      payload TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      read_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS integration_health (
      integration TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      last_event_at TEXT,
      last_order_sync_at TEXT,
      last_scent_club_sync_at TEXT,
      last_error TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS products (
      product_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      glantier_reference TEXT,
      price REAL,
      active INTEGER NOT NULL DEFAULT 1,
      payload TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
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
    CREATE TABLE IF NOT EXISTS post_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, label TEXT,
      platform_payload TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      applied_at TEXT, FOREIGN KEY(post_id) REFERENCES studio_posts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS post_media (
      post_id INTEGER NOT NULL,
      media_asset_id INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (post_id, media_asset_id),
      FOREIGN KEY (post_id) REFERENCES studio_posts(id) ON DELETE CASCADE,
      FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, source_type TEXT NOT NULL,
      file_name TEXT NOT NULL, file_path TEXT NOT NULL, mime_type TEXT NOT NULL, document_type TEXT NOT NULL,
      campaign_id INTEGER, valid_from TEXT, valid_until TEXT, status TEXT NOT NULL DEFAULT 'processing',
      extracted_text TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, document_id INTEGER NOT NULL, chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL, embedding_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(document_id,chunk_index), FOREIGN KEY (document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS content_knowledge_links (
      content_item_id INTEGER NOT NULL, document_id INTEGER NOT NULL, relevance REAL NOT NULL DEFAULT 0,
      PRIMARY KEY(content_item_id,document_id), FOREIGN KEY(content_item_id) REFERENCES content_items(id) ON DELETE CASCADE,
      FOREIGN KEY(document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS post_knowledge_sources (
      post_id INTEGER NOT NULL, document_id INTEGER NOT NULL, chunk_id INTEGER, reason TEXT,
      PRIMARY KEY(post_id,document_id,chunk_id), FOREIGN KEY(post_id) REFERENCES studio_posts(id) ON DELETE CASCADE,
      FOREIGN KEY(document_id) REFERENCES knowledge_documents(id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS media_tags (
      media_asset_id INTEGER NOT NULL, tag TEXT NOT NULL, confidence REAL DEFAULT 1,
      PRIMARY KEY(media_asset_id,tag), FOREIGN KEY(media_asset_id) REFERENCES media_assets(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS campaign_bundles (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, campaign_id INTEGER, notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS bundle_items (
      bundle_id INTEGER NOT NULL, item_type TEXT NOT NULL, item_id INTEGER NOT NULL,
      PRIMARY KEY(bundle_id,item_type,item_id), FOREIGN KEY(bundle_id) REFERENCES campaign_bundles(id) ON DELETE CASCADE
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
    CREATE TABLE IF NOT EXISTS ai_generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_item_id INTEGER,
      model TEXT NOT NULL,
      generated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      confidence REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      latency_ms INTEGER,
      error_message TEXT,
      FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS agent_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      priority TEXT NOT NULL DEFAULT 'normal',
      related_content_id INTEGER,
      related_post_id INTEGER,
      requires_user_action INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      started_at TEXT,
      completed_at TEXT,
      error_message TEXT,
      FOREIGN KEY (related_content_id) REFERENCES content_items(id) ON DELETE SET NULL,
      FOREIGN KEY (related_post_id) REFERENCES studio_posts(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS agent_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      related_task_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (related_task_id) REFERENCES agent_tasks(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS agent_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scent_club_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      plan TEXT NOT NULL,
      monthly_price REAL NOT NULL,
      preference_gender TEXT NOT NULL,
      preference_family TEXT NOT NULL,
      selection_mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      source TEXT NOT NULL DEFAULT 'orivea.nl',
      notes TEXT,
      last_action_at TEXT DEFAULT CURRENT_TIMESTAMP,
      converted_member_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS scent_club_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      plan TEXT NOT NULL,
      monthly_price REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TEXT NOT NULL,
      next_billing_date TEXT,
      preference_gender TEXT NOT NULL,
      preference_family TEXT NOT NULL,
      selection_mode TEXT NOT NULL,
      payment_status TEXT,
      last_payment_at TEXT,
      last_payment_amount REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(request_id) REFERENCES scent_club_requests(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS scent_club_selections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      fragrance_reference TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      deadline TEXT,
      selected_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(member_id, month),
      FOREIGN KEY(member_id) REFERENCES scent_club_members(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS scent_club_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER,
      request_id INTEGER,
      event_type TEXT NOT NULL,
      description TEXT NOT NULL,
      by_user TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(member_id) REFERENCES scent_club_members(id) ON DELETE CASCADE,
      FOREIGN KEY(request_id) REFERENCES scent_club_requests(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_content_status ON content_items(status, category);
    CREATE INDEX IF NOT EXISTS idx_posts_schedule ON studio_posts(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_logs_post ON publication_logs(post_id, platform);
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status, priority, created_at);
    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document ON knowledge_chunks(document_id,chunk_index);
    CREATE INDEX IF NOT EXISTS idx_scent_requests_status ON scent_club_requests(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_scent_members_status ON scent_club_members(status, started_at);
    CREATE INDEX IF NOT EXISTS idx_scent_selections_month ON scent_club_selections(month, status);
  `);

  const addColumn=(table,column,definition)=>{if(!db.prepare(`PRAGMA table_info(${table})`).all().some(row=>row.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);};
  addColumn("media_assets","media_description","TEXT");
  addColumn("media_assets","width","INTEGER");
  addColumn("media_assets","height","INTEGER");
  addColumn("media_assets","aspect_ratio","TEXT");
  addColumn("media_assets","disabled","INTEGER NOT NULL DEFAULT 0");
  addColumn("studio_posts","quality_score","INTEGER NOT NULL DEFAULT 0");
  addColumn("studio_posts","quality_status","TEXT NOT NULL DEFAULT 'draft'");
  addColumn("studio_posts","knowledge_sources_used","TEXT");
  addColumn("studio_posts","content_brief","TEXT");
  addColumn("orders","discounts","TEXT");
  addColumn("orders","discount_amount","REAL NOT NULL DEFAULT 0");
  addColumn("orders","paypal_order_id","TEXT");
  addColumn("orders","newsletter_opt_in","INTEGER NOT NULL DEFAULT 0");
  addColumn("orders","terms_accepted","INTEGER NOT NULL DEFAULT 0");
  addColumn("orders","return_policy_accepted","INTEGER NOT NULL DEFAULT 0");
  addColumn("orders","scent_club_discount","INTEGER NOT NULL DEFAULT 0");
  addColumn("orders","scent_club_member_id","INTEGER");
  addColumn("orders","fulfillment_status","TEXT NOT NULL DEFAULT 'unfulfilled'");
  addColumn("orders","tracking_code","TEXT");
  addColumn("orders","updated_at","TEXT");
  addColumn("scent_club_members","member_code","TEXT");

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
    defaultPlatforms: "instagram,facebook,pinterest",
    agentPaused: "false",
    autoApproveTrustedContent: process.env.AUTO_APPROVE_TRUSTED_CONTENT || "false",
    aiAutoApproveMinConfidence: process.env.AI_AUTO_APPROVE_MIN_CONFIDENCE || "0.90",
    aiBrandTone: "ORIVÈA premium/fris",
    aiSalesIntensity: "medium-low",
    aiEmojiUsage: "minimal",
    aiCaptionLength: "medium"
  };
  const insert = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  Object.entries(defaults).forEach(([key, value]) => insert.run(key, value));
}

module.exports = { db, dbPath, initDb };
