const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const { db } = require("../db");
const { writeAudit } = require("../audit");
const { queueTask, emitEvent } = require("../agent");
const sharp = require("sharp");

const router = express.Router();
const appRoot = path.resolve(__dirname, "..", "..", "..");
const uploadRoot = path.resolve(appRoot, process.env.UPLOAD_PATH || "data/uploads");
const sources = new Set(["orivea", "glantier", "whatsapp", "other"]);
const permissions = new Set(["own_content", "approved", "shared_by_glantier", "unknown"]);
const platforms = new Set(["instagram", "facebook", "tiktok", "pinterest"]);
const allowedMime = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"]);

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, done) {
      const source = sources.has(req.body.source_type) ? req.body.source_type : "other";
      const target = path.join(uploadRoot, source);
      fs.mkdirSync(target, { recursive: true });
      done(null, target);
    },
    filename(req, file, done) {
      const ext = path.extname(file.originalname).toLowerCase();
      done(null, `${Date.now()}-${crypto.randomBytes(12).toString("hex")}${ext}`);
    }
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
  fileFilter(req, file, done) { done(allowedMime.has(file.mimetype) ? null : new Error("Bestandstype niet toegestaan."), allowedMime.has(file.mimetype)); }
});

function clean(value, max = 5000) { return String(value || "").trim().slice(0, max); }
function parsePlatforms(value) { return [...new Set((Array.isArray(value) ? value : String(value || "").split(",")).filter((item) => platforms.has(item)))]; }
function getContent(id) {
  return db.prepare(`SELECT c.*, cp.name campaign_name, m.id media_id, m.media_type, m.original_name
    FROM content_items c LEFT JOIN campaigns cp ON cp.id=c.campaign_id LEFT JOIN media_assets m ON m.content_item_id=c.id
    WHERE c.id=?`).get(id);
}
function queueContent(contentId, title, permission, description="") {
  if (permission === "unknown") {
    queueTask({ taskType:"analyze_content", title:`Gebruiksrechten controleren: ${title}`, description, contentId, priority:"high", userAction:true });
    emitEvent("rights_required",`Ik heb ${title} opgeslagen, maar wacht op bevestiging van de gebruiksrechten.`,"warning");
  } else queueTask({ taskType:"analyze_content", title:`Content analyseren: ${title}`, description, contentId });
}

router.get("/csrf", (req, res) => res.json({ csrfToken: req.session.csrfToken }));
router.get("/summary", (req, res) => {
  const count = (sql, ...args) => db.prepare(sql).get(...args).count;
  res.json({
    content: count("SELECT COUNT(*) count FROM content_items"),
    unused: count("SELECT COUNT(*) count FROM content_items WHERE times_used=0"),
    unknownRights: count("SELECT COUNT(*) count FROM content_items WHERE usage_permission='unknown'"),
    scheduled: count("SELECT COUNT(*) count FROM studio_posts WHERE status='scheduled'"),
    failed: count("SELECT COUNT(*) count FROM post_platforms WHERE status IN ('failed','action_required')"),
    today: db.prepare(`SELECT p.*, c.title content_title, m.id media_id FROM studio_posts p JOIN content_items c ON c.id=p.content_item_id LEFT JOIN media_assets m ON m.content_item_id=c.id WHERE date(p.scheduled_at)=date('now','localtime') ORDER BY p.scheduled_at LIMIT 1`).get() || null
  });
});
router.get("/suggestions/week", (req, res) => {
  res.json(db.prepare(`SELECT c.*,m.id media_id,m.media_type,
    (CASE WHEN favorite=1 THEN 20 ELSE 0 END + CASE WHEN times_used=0 THEN 15 ELSE 0 END - times_used*4) score
    FROM content_items c LEFT JOIN media_assets m ON m.content_item_id=c.id
    WHERE usage_permission IN ('own_content','approved','shared_by_glantier')
      AND (valid_from IS NULL OR date(valid_from)<=date('now','+7 days'))
      AND (valid_until IS NULL OR date(valid_until)>=date('now'))
    ORDER BY score DESC,last_used ASC,created_at DESC LIMIT 7`).all());
});

router.get("/content", (req, res) => {
  const q = `%${clean(req.query.q, 100)}%`;
  res.json(db.prepare(`SELECT c.*, cp.name campaign_name, m.id media_id, m.media_type, m.original_name FROM content_items c LEFT JOIN campaigns cp ON cp.id=c.campaign_id LEFT JOIN media_assets m ON m.content_item_id=c.id WHERE c.title LIKE ? OR c.category LIKE ? OR c.product_reference LIKE ? ORDER BY c.favorite DESC,c.created_at DESC LIMIT 100 OFFSET ?`).all(q, q, q, Math.max(0, Number(req.query.offset) || 0)));
});
router.get("/content/:id", (req, res) => { const row = getContent(req.params.id); return row ? res.json(row) : res.status(404).json({ error: "Content niet gevonden." }); });
router.get("/media/:id", (req, res) => {
  const media = db.prepare("SELECT * FROM media_assets WHERE id=?").get(req.params.id);
  if (!media) return res.status(404).end();
  const file = path.resolve(appRoot, media.media_path);
  if (!file.startsWith(path.resolve(uploadRoot)) || !fs.existsSync(file)) return res.status(404).end();
  res.type(media.mime_type).sendFile(file);
});
router.get("/media/:id/detail",(req,res)=>{const row=db.prepare(`SELECT m.*,c.title,c.source_type,c.category,c.product_reference,c.campaign_id,c.usage_permission,c.last_used,c.times_used,cp.name campaign_name FROM media_assets m JOIN content_items c ON c.id=m.content_item_id LEFT JOIN campaigns cp ON cp.id=c.campaign_id WHERE m.id=?`).get(req.params.id);if(!row)return res.status(404).json({error:"Media niet gevonden."});row.posts=db.prepare("SELECT p.id,p.title,p.status,p.scheduled_at FROM post_media pm JOIN studio_posts p ON p.id=pm.post_id WHERE pm.media_asset_id=? ORDER BY p.created_at DESC").all(req.params.id);res.json(row);});
router.post("/media/:id/disable",(req,res)=>{db.prepare("UPDATE media_assets SET disabled=1 WHERE id=?").run(req.params.id);res.json({ok:true});});
router.post("/content", upload.array("media", 10), async (req, res, next) => {
  const source = sources.has(req.body.source_type) ? req.body.source_type : "other";
  const permission = permissions.has(req.body.usage_permission) ? req.body.usage_permission : "unknown";
  if (!clean(req.body.title, 180) || !clean(req.body.category, 80) || !clean(req.body.content_type, 80)) return res.status(400).json({ error: "Titel, categorie en contenttype zijn verplicht." });
  const files=req.files||[]; const inputs=files.length?files:[null];const dimensions=new Map();
  try{for(const file of files)if(file.mimetype.startsWith("image/"))dimensions.set(file.path,await sharp(file.path).metadata());}catch(error){return next(error);}
  const ids=db.transaction(()=>inputs.map((file,index)=>{
    const base=clean(req.body.title,180); const title=files.length>1?`${base} ${index+1}`:base;
    const type=file?(file.mimetype.startsWith("video/")?"video":"image"):clean(req.body.content_type,80);
    const inferredReference=clean(req.body.product_reference,100)||(file?.originalname.match(/\b\d{3}\b/)?.[0]||"");
    const result=db.prepare(`INSERT INTO content_items (title,source_type,source_name,content_type,category,caption_original,caption_orivea,product_reference,campaign_id,valid_from,valid_until,usage_permission,notes,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(title,source,clean(req.body.source_name,120),type,clean(req.body.category,80),clean(req.body.caption_original),clean(req.body.caption_orivea),inferredReference,req.body.campaign_id||null,req.body.valid_from||null,req.body.valid_until||null,permission,clean(req.body.notes),"new");
    if(file){let width=null,height=null,ratio=null;if(type==="image"){try{const metadata=dimensions.get(file.path)||{};width=metadata.width;height=metadata.height;const value=width/height;ratio=Math.abs(value-1)<.08?"1:1":Math.abs(value-.8)<.08?"4:5":Math.abs(value-.667)<.08?"2:3":Math.abs(value-.5625)<.08?"9:16":value>1.15?"landscape":"portrait";}catch{}}
      db.prepare(`INSERT INTO media_assets (content_item_id,media_type,media_path,thumbnail_path,original_name,mime_type,size,media_description,width,height,aspect_ratio) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(result.lastInsertRowid,type,path.relative(appRoot,file.path),type==="image"?path.relative(appRoot,file.path):null,file.originalname,file.mimetype,file.size,clean(req.body.media_description,500),width,height,ratio);}
    return {id:Number(result.lastInsertRowid),title};
  }))();
  for(const item of ids){writeAudit({entityType:"content",entityId:item.id,action:"create",byUser:req.session.user.username});queueContent(item.id,item.title,permission);}
  res.status(201).json({items:ids.map(item=>getContent(item.id))});
});
router.post("/content/:id/action",(req,res)=>{const content=getContent(req.params.id);if(!content)return res.status(404).json({error:"Content niet gevonden."});const actions={make_post:"social post maken",today:"vandaag gebruiken",week:"deze week plannen",process:"verwerken"};if(!actions[req.body.action])return res.status(400).json({error:"Onbekende actie."});const description=req.body.action==="today"?"schedule:today":req.body.action==="week"?"schedule:week":"";const existing=description?db.prepare("SELECT id FROM studio_posts WHERE content_item_id=? AND status='draft' ORDER BY created_at DESC LIMIT 1").get(content.id):null;const id=queueTask({taskType:"analyze_content",title:`${content.title}: ${actions[req.body.action]}`,description,contentId:content.id,postId:existing?.id||null,priority:req.body.action==="today"?"high":"normal"});res.status(202).json({taskId:id});});
router.post("/carousel",(req,res)=>{const ids=[...new Set((req.body.content_ids||[]).map(Number).filter(Boolean))];if(ids.length<2||ids.length>10)return res.status(400).json({error:"Selecteer 2 tot 10 afbeeldingen."});const placeholders=ids.map(()=>"?").join(",");const rows=db.prepare(`SELECT c.*,m.id media_id,m.media_type FROM content_items c JOIN media_assets m ON m.content_item_id=c.id WHERE c.id IN (${placeholders})`).all(...ids);if(rows.length!==ids.length||rows.some(row=>row.media_type!=="image"))return res.status(400).json({error:"Een carousel kan alleen uit afbeeldingen bestaan."});if(rows.some(row=>row.usage_permission==="unknown"))return res.status(409).json({error:"Controleer eerst de gebruiksrechten van alle afbeeldingen."});const postId=db.transaction(()=>{const post=db.prepare("INSERT INTO studio_posts(content_item_id,title,status) VALUES(?,?, 'draft')").run(rows[0].id,clean(req.body.title,180)||`Carousel: ${rows[0].title}`);rows.forEach((row,index)=>db.prepare("INSERT INTO post_media(post_id,media_asset_id,position) VALUES(?,?,?)").run(post.lastInsertRowid,row.media_id,index));return Number(post.lastInsertRowid);})();queueTask({taskType:"analyze_content",title:`Carousel voorbereiden: ${rows[0].title}`,description:"Maak één carousel-caption voor de geselecteerde afbeeldingen.",contentId:rows[0].id,postId});res.status(201).json({id:postId,status:"draft"});});
router.put("/content/:id", (req, res) => {
  const existing = getContent(req.params.id); if (!existing) return res.status(404).json({ error:"Content niet gevonden." });
  const permission = permissions.has(req.body.usage_permission) ? req.body.usage_permission : existing.usage_permission;
  db.prepare(`UPDATE content_items SET title=?,category=?,content_type=?,caption_original=?,caption_orivea=?,product_reference=?,campaign_id=?,valid_from=?,valid_until=?,usage_permission=?,notes=?,favorite=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(clean(req.body.title||existing.title,180),clean(req.body.category||existing.category,80),clean(req.body.content_type||existing.content_type,80),clean(req.body.caption_original),clean(req.body.caption_orivea),clean(req.body.product_reference,100),req.body.campaign_id||null,req.body.valid_from||null,req.body.valid_until||null,permission,clean(req.body.notes),req.body.favorite?1:0,req.params.id);
  res.json(getContent(req.params.id));
});

router.get("/campaigns", (req,res) => res.json(db.prepare("SELECT * FROM campaigns ORDER BY start_date DESC,created_at DESC").all()));
router.post("/campaigns", (req,res) => { const result=db.prepare("INSERT INTO campaigns (name,description,start_date,end_date,status,target_url,notes) VALUES (?,?,?,?,?,?,?)").run(clean(req.body.name,160),clean(req.body.description),req.body.start_date||null,req.body.end_date||null,clean(req.body.status,30)||"draft",clean(req.body.target_url,500),clean(req.body.notes)); res.status(201).json(db.prepare("SELECT * FROM campaigns WHERE id=?").get(result.lastInsertRowid)); });

router.get("/posts", (req,res) => res.json(db.prepare(`SELECT p.*,c.title content_title,c.category,c.source_type,c.usage_permission,m.id media_id,GROUP_CONCAT(pp.platform) platforms FROM studio_posts p JOIN content_items c ON c.id=p.content_item_id LEFT JOIN media_assets m ON m.content_item_id=c.id LEFT JOIN post_platforms pp ON pp.post_id=p.id GROUP BY p.id ORDER BY COALESCE(p.scheduled_at,p.created_at) DESC`).all()));
router.post("/posts", (req,res) => {
  const content=getContent(req.body.content_item_id); if (!content) return res.status(400).json({error:"Kies geldige content."});
  const selected=parsePlatforms(req.body.platforms); if (!selected.length) return res.status(400).json({error:"Kies minimaal één platform."});
  const result=db.transaction(() => { const target=clean(req.body.target_url,500); const post=db.prepare("INSERT INTO studio_posts (content_item_id,title,cta,target_url,status) VALUES (?,?,?,?, 'draft')").run(content.id,clean(req.body.title||content.title,180),clean(req.body.cta,120),target); if(target){ const url=new URL(target); url.searchParams.set("utm_source",selected[0]); url.searchParams.set("utm_medium","organic_social"); url.searchParams.set("utm_campaign",content.campaign_name?content.campaign_name.toLowerCase().replace(/[^a-z0-9]+/g,"-"):"orivea"); url.searchParams.set("utm_content",`post-${post.lastInsertRowid}`); db.prepare("UPDATE studio_posts SET generated_url=? WHERE id=?").run(url.toString(),post.lastInsertRowid); } for(const platform of selected) db.prepare("INSERT INTO post_platforms (post_id,platform,caption,hashtags) VALUES (?,?,?,?)").run(post.lastInsertRowid,platform,clean(req.body[`caption_${platform}`]||content.caption_orivea||content.caption_original),clean(req.body[`hashtags_${platform}`],500)); return post.lastInsertRowid; })();
  res.status(201).json({id:result,status:"draft"});
});
router.post("/posts/:id/schedule", (req,res) => {
  const post=db.prepare(`SELECT p.*,c.usage_permission FROM studio_posts p JOIN content_items c ON c.id=p.content_item_id WHERE p.id=?`).get(req.params.id);
  if(!post) return res.status(404).json({error:"Post niet gevonden."});
  if(!["own_content","approved","shared_by_glantier"].includes(post.usage_permission)) return res.status(409).json({error:"Controleer gebruiksrechten vóór publicatie."});
  if(!req.body.scheduled_at || Number.isNaN(Date.parse(req.body.scheduled_at))) return res.status(400).json({error:"Kies een geldig publicatiemoment."});
  db.transaction(() => { db.prepare("UPDATE studio_posts SET status='scheduled',scheduled_at=?,approved_at=CURRENT_TIMESTAMP,approved_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.body.scheduled_at,req.session.user.username,req.params.id); db.prepare("UPDATE post_platforms SET status='scheduled' WHERE post_id=?").run(req.params.id); })();
  res.json({id:Number(req.params.id),status:"scheduled"});
});
router.post("/posts/:id/cancel", (req,res) => { db.prepare("UPDATE studio_posts SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id); db.prepare("UPDATE post_platforms SET status='cancelled' WHERE post_id=?").run(req.params.id); res.json({ok:true}); });
router.get("/history", (req,res) => res.json(db.prepare(`SELECT l.*,p.title,c.category,c.source_type,m.id media_id FROM publication_logs l JOIN studio_posts p ON p.id=l.post_id JOIN content_items c ON c.id=p.content_item_id LEFT JOIN media_assets m ON m.content_item_id=c.id ORDER BY l.created_at DESC LIMIT 250`).all()));
router.get("/integrations", (req,res) => { const rows=db.prepare("SELECT platform,account_name,token_expires_at,connected_at,status FROM social_accounts").all(); const map=Object.fromEntries(rows.map(row=>[row.platform,row])); res.json([...platforms].map(platform=>map[platform]||{platform,status:"not_configured"})); });

module.exports = router;
