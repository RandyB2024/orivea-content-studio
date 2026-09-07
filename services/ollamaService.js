const { generateTemplate } = require("./templateCaptionService");

const baseUrl = () => (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const model = () => process.env.OLLAMA_MODEL || "qwen2.5:7b";
const timeout = () => Math.max(1000, Number(process.env.OLLAMA_TIMEOUT_MS) || 120000);
const categories = new Set(["Dames","Heren","Premium","Scent Club","Geurwijzer","Catalogus","Cadeau","Partner Program","Algemeen","Actie","Seizoen","Interieur","Body Mist","Verzorging","Overig"]);
const types = new Set(["product","promo","image","video","reel","carousel","story_asset","scent_tip","scent_profile","scent_club","catalog","partner_program","seasonal","lifestyle","engagement","other"]);
const channels = new Set(["instagram","facebook","tiktok","pinterest"]);
let lastSuccess = null;

function extractJson(text) {
  const cleaned = String(text || "").replace(/^```(?:json)?|```$/g, "").trim();
  const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Ollama gaf geen JSON-object terug.");
  return JSON.parse(cleaned.slice(start, end + 1));
}
function validateOutput(raw, content) {
  const output = { ...raw };
  output.category = categories.has(output.category) ? output.category : content.category || "Algemeen";
  output.content_type = types.has(output.content_type) ? output.content_type : content.content_type || "other";
  output.product_reference = String(output.product_reference || content.product_reference || "").slice(0, 100);
  output.recommended_channels = [...new Set((Array.isArray(output.recommended_channels) ? output.recommended_channels : []).filter((value) => channels.has(value)))];
  const suitable = content.media_type === "video" ? new Set(["instagram","tiktok"]) : content.media_type === "image" ? new Set(["instagram","facebook","pinterest"]) : channels;
  output.recommended_channels = output.recommended_channels.filter(channel => suitable.has(channel));
  if (!output.recommended_channels.length) output.recommended_channels = content.media_type === "video" ? ["instagram","tiktok"] : ["instagram","facebook"];
  for (const platform of channels) {
    output[`caption_${platform}`] = String(output[`caption_${platform}`] || "").trim().slice(0, 2200);
    output[`hashtags_${platform}`] = (Array.isArray(output[`hashtags_${platform}`]) ? output[`hashtags_${platform}`] : []).map(String).filter((tag) => /^#[\p{L}\p{N}_]+$/u.test(tag)).slice(0, 10);
  }
  output.cta = String(output.cta || "Ontdek de collectie").slice(0, 120);
  output.target_url = /^https:\/\/(www\.)?orivea\.nl(?:\/|$)/i.test(output.target_url || "") ? output.target_url : "https://orivea.nl/catalogus.html";
  output.confidence = Math.min(1, Math.max(0, Number(output.confidence) || 0));
  return output;
}
async function callOllama(content, instruction = "") {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout()); const started = Date.now();
  const prompt = `Je bent de Nederlandse ORIVÈA contentredacteur. Retourneer uitsluitend één JSON-object. Verzin nooit prijzen, korting, voorraad, geurnoten, producteigenschappen, gezondheidsclaims of officiële merkstatus. Maximaal 10 relevante hashtags per platform. Maak aparte natuurlijke captions voor Instagram, Facebook, TikTok en Pinterest. Instructie: ${instruction || "premium, fris, modern, medium-kort, minimaal emoji"}. Content: ${JSON.stringify({ title:content.title, source_type:content.source_type, category:content.category, content_type:content.content_type, caption_original:content.caption_original, caption_orivea:content.caption_orivea, product_reference:content.product_reference, campaign_name:content.campaign_name, notes:content.notes })}. Vereiste sleutels: category, content_type, product_reference, recommended_channels, caption_instagram, caption_facebook, caption_tiktok, caption_pinterest, hashtags_instagram, hashtags_facebook, hashtags_tiktok, hashtags_pinterest, cta, target_url, confidence.`;
  try {
    const response = await fetch(`${baseUrl()}/api/generate`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({model:model(),prompt,stream:false,format:"json",options:{temperature:0.35}}), signal:controller.signal });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const payload = await response.json(); const output = validateOutput(extractJson(payload.response), content);
    lastSuccess = new Date().toISOString(); return { output, model:model(), latencyMs:Date.now()-started, fallback:false };
  } finally { clearTimeout(timer); }
}
async function generateSocialCopy(content, instruction="") {
  let lastError;
  for (let attempt=0; attempt<2; attempt+=1) { try { return await callOllama(content, attempt ? `${instruction}. Herstel: geef strikt geldige JSON.` : instruction); } catch(error){ lastError=error; } }
  return { output:generateTemplate(content,instruction), model:model(), latencyMs:0, fallback:true, error:lastError?.message || "Ollama niet beschikbaar" };
}
async function health() {
  const started=Date.now(); const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),4000);
  try { const response=await fetch(`${baseUrl()}/api/tags`,{signal:controller.signal}); if(!response.ok)throw new Error(); const data=await response.json(); return {online:true,model:model(),modelAvailable:data.models?.some(item=>item.name===model()),latencyMs:Date.now()-started,lastSuccess}; } catch { return {online:false,model:model(),modelAvailable:false,latencyMs:null,lastSuccess}; } finally {clearTimeout(timer);}
}
async function interpretCommand(message) {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),Math.min(timeout(),30000));
  try{const prompt=`Zet dit Nederlandse verzoek om naar JSON zonder uitleg: ${JSON.stringify(message)}. Toegestane actions: show_summary, suggest_week, regenerate_post, reschedule_post, create_task, none. Sleutels: action, post_id, target_datetime, instruction, title. Publiceren is nooit toegestaan.`;const response=await fetch(`${baseUrl()}/api/generate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:model(),prompt,stream:false,format:"json",options:{temperature:0.1}}),signal:controller.signal});if(!response.ok)throw new Error();const parsed=extractJson((await response.json()).response);const allowed=new Set(["show_summary","suggest_week","regenerate_post","reschedule_post","create_task","none"]);return{action:allowed.has(parsed.action)?parsed.action:"none",post_id:Number(parsed.post_id)||null,target_datetime:String(parsed.target_datetime||""),instruction:String(parsed.instruction||"").slice(0,80),title:String(parsed.title||"").slice(0,180)};}catch{return{action:"none"};}finally{clearTimeout(timer);}
}
module.exports = { analyzeContent:generateSocialCopy, generateSocialCopy, classifyContent:generateSocialCopy, suggestSchedule:generateSocialCopy, rewriteCaption:generateSocialCopy, generateHashtags:generateSocialCopy, interpretCommand, health, validateOutput, extractJson };
