const crypto = require("crypto");
const express = require("express");
const { requireAuth } = require("../middleware");
const outlook = require("../outlook-oauth");
const { writeAudit } = require("../audit");

const callbackRouter = express.Router();
const protectedRouter = express.Router();

protectedRouter.use(requireAuth);
protectedRouter.get("/status", (req,res) => res.json(outlook.status()));
protectedRouter.post("/connect", (req,res,next) => {
  try {
    if (!outlook.configured()) return res.status(503).json({error:"Microsoft OAuth is nog niet geconfigureerd."});
    const state = crypto.randomBytes(32).toString("base64url");
    const verifier = crypto.randomBytes(48).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    req.session.outlookOAuth = { state, verifier, createdAt:Date.now() };
    const cfg = outlook.config();
    const params = new URLSearchParams({client_id:cfg.clientId,response_type:"code",redirect_uri:cfg.redirectUri,response_mode:"query",scope:outlook.SCOPES,state,code_challenge:challenge,code_challenge_method:"S256",prompt:"select_account"});
    res.json({url:`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/authorize?${params}`});
  } catch (error) { next(error); }
});
protectedRouter.post("/disconnect", (req,res) => { outlook.disconnect(); writeAudit({entityType:"integration",entityId:"outlook",action:"disconnect",byUser:req.session.user.username}); res.json({ok:true}); });

callbackRouter.get("/auth/outlook/callback", requireAuth, async (req,res) => {
  const pending = req.session.outlookOAuth;
  delete req.session.outlookOAuth;
  if (!pending || pending.state !== req.query.state || Date.now() - pending.createdAt > 10 * 60 * 1000) return res.status(400).send("Ongeldige of verlopen Outlook-koppeling.");
  if (!req.query.code) return res.status(400).send("Microsoft heeft geen autorisatiecode teruggegeven.");
  try { await outlook.exchangeCode(String(req.query.code), pending.verifier); writeAudit({entityType:"integration",entityId:"outlook",action:"connect",byUser:req.session.user.username}); res.redirect("/settings/outlook?connected=1"); }
  catch (error) { console.error("Outlook OAuth callback error:",error); res.redirect("/settings/outlook?error=oauth"); }
});

module.exports = { callbackRouter, protectedRouter };
