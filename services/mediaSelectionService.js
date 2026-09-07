const {db}=require("../src/workspace/db");
function platformFit(media,platform){const ratio=media.aspect_ratio||"";if(platform==="tiktok")return media.media_type==="video"&&ratio==="9:16"?30:media.media_type==="video"?10:-100;if(platform==="instagram")return ["4:5","1:1","9:16"].includes(ratio)?25:10;if(platform==="pinterest")return ["2:3","9:16"].includes(ratio)?25:8;return 15;}
function chooseMedia(content,platform="instagram"){
  const rows=db.prepare(`SELECT m.*,c.product_reference,c.campaign_id,c.category,c.usage_permission,c.last_used,c.times_used
    FROM media_assets m JOIN content_items c ON c.id=m.content_item_id WHERE m.disabled=0
    AND c.usage_permission IN ('own_content','approved','shared_by_glantier')
    AND (c.valid_from IS NULL OR date(c.valid_from)<=date('now')) AND (c.valid_until IS NULL OR date(c.valid_until)>=date('now'))`).all();
  return rows.map(media=>{const relevance=content.product_reference&&media.product_reference===content.product_reference?40:media.category===content.category?12:0;const campaignMatch=content.campaign_id&&media.campaign_id===content.campaign_id?35:0;const freshness=media.last_used?Math.min(20,(Date.now()-new Date(media.last_used).getTime())/86400000):20;const reusePenalty=(media.times_used||0)*6;return{...media,score:relevance+campaignMatch+freshness+platformFit(media,platform)-reusePenalty,score_parts:{relevance,freshness,platform_fit:platformFit(media,platform),campaign_match:campaignMatch,reuse_penalty:reusePenalty}};}).sort((a,b)=>b.score-a.score)[0]||null;
}
module.exports={chooseMedia,platformFit};
