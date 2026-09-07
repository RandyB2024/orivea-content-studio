const forbidden = [
  /\b\d+(?:[,.]\d{1,2})?\s*(?:euro|eur|€)\b/i,
  /\b\d+\s*%\s*(?:korting|voordeel)\b/i,
  /\b(geneest|medisch bewezen|gezondheidsvoordeel)\b/i,
  /\b(exclusief|uitsluitend verkrijgbaar|offici[eë]le glantier webshop)\b/i,
  /\b(gegarandeerd|altijd op voorraad|vandaag besteld)\b/i
];

function validateClaims(output, groundedFacts = {}) {
  const text = Object.entries(output || {}).filter(([key]) => key.startsWith("caption_") || key === "cta").map(([, value]) => String(value || "")).join(" ");
  const violations = forbidden.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
  if (/\b\d+(?:[,.]\d{1,2})?\s*(?:euro|eur|€)\b/i.test(text) && groundedFacts.priceVerified) violations.shift();
  return { valid: violations.length === 0, violations };
}

module.exports = { validateClaims };
