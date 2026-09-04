const { db } = require("./db");

const allowedRights = new Set(["own_content", "approved", "shared_by_glantier"]);
let timer;

function processDuePosts() {
  const due = db.prepare(`SELECT p.id,p.scheduled_at,c.usage_permission FROM studio_posts p JOIN content_items c ON c.id=p.content_item_id WHERE p.status='scheduled' AND p.approved_at IS NOT NULL AND datetime(p.scheduled_at)<=datetime('now') LIMIT 10`).all();
  for (const post of due) {
    if (!allowedRights.has(post.usage_permission)) continue;
    const scheduledTime = Date.parse(post.scheduled_at);
    const missedWindow = Number.isFinite(scheduledTime) && Date.now() - scheduledTime > 2 * 60 * 60 * 1000;
    const locked = db.prepare("UPDATE studio_posts SET status='publishing',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='scheduled'").run(post.id);
    if (!locked.changes) continue;
    const targets = db.prepare("SELECT * FROM post_platforms WHERE post_id=? AND status='scheduled'").all(post.id);
    if (missedWindow) {
      const message = "Publicatiemoment is meer dan twee uur geleden. Kies Nu publiceren of Annuleren.";
      const markMissed = db.transaction(() => {
        for (const target of targets) {
          db.prepare("UPDATE post_platforms SET status='action_required',error_message=? WHERE id=?").run(message, target.id);
          db.prepare(`INSERT INTO publication_logs (post_id,platform,scheduled_at,started_at,status,error_code,error_message,response_summary) VALUES (?,?,?,CURRENT_TIMESTAMP,'action_required','MISSED_PUBLICATION_WINDOW',?,'Niet automatisch gepubliceerd na downtime')`).run(post.id, target.platform, post.scheduled_at, message);
        }
        db.prepare("UPDATE studio_posts SET status='action_required',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(post.id);
      });
      markMissed();
      continue;
    }
    let actionRequired = false;
    for (const target of targets) {
      const account = db.prepare("SELECT status FROM social_accounts WHERE platform=?").get(target.platform);
      const message = !account || account.status === "not_configured" ? `${target.platform} is niet geconfigureerd.` : `${target.platform} publicatieservice is nog niet geactiveerd.`;
      actionRequired = true;
      db.prepare("UPDATE post_platforms SET status='action_required',error_message=? WHERE id=?").run(message,target.id);
      db.prepare(`INSERT INTO publication_logs (post_id,platform,scheduled_at,started_at,status,error_code,error_message,response_summary) VALUES (?,?,?,CURRENT_TIMESTAMP,'action_required','INTEGRATION_UNAVAILABLE',?,'Geen API-aanroep uitgevoerd')`).run(post.id,target.platform,post.scheduled_at,message);
    }
    db.prepare("UPDATE studio_posts SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(actionRequired ? "action_required" : "failed",post.id);
  }
}

function startScheduler() {
  if (timer) return timer;
  processDuePosts();
  timer = setInterval(processDuePosts, 60 * 1000);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { startScheduler, processDuePosts };
