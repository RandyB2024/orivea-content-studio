const hashtagSets = {
  Dames: ["#ORIVEA", "#Glantier", "#Damesparfum", "#ParfumNederland"],
  Heren: ["#ORIVEA", "#Glantier", "#Herenparfum", "#Geurinspiratie"],
  Premium: ["#ORIVEA", "#Glantier", "#PremiumParfum", "#ParfumNederland"],
  default: ["#ORIVEA", "#Glantier", "#Parfum", "#Geurinspiratie"]
};

function generateTemplate(content, instruction = "") {
  const product = content.product_reference ? ` ${content.product_reference}` : "";
  const base = content.caption_orivea || content.caption_original || `${content.title}${product} brengt een verfijnd geurmoment in jouw dag.`;
  const short = instruction === "korter" ? base.split(/[.!?]/)[0] : base;
  const tags = hashtagSets[content.category] || hashtagSets.default;
  return {
    category: content.category || "Algemeen", content_type: content.content_type || "image", product_reference: content.product_reference || "",
    recommended_channels: content.media_type === "video" ? ["instagram", "tiktok"] : ["instagram", "facebook", "pinterest"],
    caption_instagram: `${short}\n\nOntdek jouw geur bij ORIVÈA.`,
    caption_facebook: `${short}\n\nBekijk de collectie en ontdek welk geurprofiel bij je past.`,
    caption_tiktok: `${short}\nWelke geur past bij jouw dag?`,
    caption_pinterest: `${content.title}: ${short}`,
    hashtags_instagram: tags, hashtags_facebook: tags.slice(0, 4), hashtags_tiktok: tags.slice(0, 4), hashtags_pinterest: tags.slice(0, 5),
    cta: "Ontdek de collectie", target_url: "https://orivea.nl/catalogus.html", confidence: 0.55, fallback: true
  };
}
module.exports = { generateTemplate };
