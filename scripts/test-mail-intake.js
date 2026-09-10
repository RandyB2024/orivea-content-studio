const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

process.env.DATABASE_PATH = "data/test-mail-intake.sqlite";
process.env.MAIL_TENANT_ID = "tenant";
process.env.MAIL_CLIENT_ID = "client";
process.env.MAIL_CLIENT_SECRET = "secret";
process.env.MAILBOX_ADDRESS = "shop@orivea.nl";
const dbFile = path.resolve(__dirname, "..", process.env.DATABASE_PATH);
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dbFile + suffix, { force:true });

const { db, initDb } = require("../src/workspace/db");
const { parseDataBlock, processMessage, syncMailbox } = require("../src/workspace/mail-intake");
initDb();
assert.ok(db.prepare("PRAGMA table_info(scent_club_members)").all().some((column)=>column.name === "discount_percent"));

const block = (data) => `--- ORIVEA-DATA ---\n${JSON.stringify(data)}\n--- END ORIVEA-DATA ---`;
const message = (id, data) => ({ id, internetMessageId:`<${id}@orivea.nl>`, subject:`ORIVÈA ${data.type}`, sender:{emailAddress:{address:"shop@orivea.nl"}}, receivedDateTime:new Date().toISOString(), body:{content:block(data)} });

assert.equal(parseDataBlock(block({type:"contact",request_id:"R-1"})).request_id, "R-1");
assert.equal(processMessage(message("scent",{type:"scent_club_request",request_id:"SC-1",first_name:"Test",last_name:"Klant",email:"test@example.com",plan:"signature",preference_gender:"Dames",preference_family:"Floraal",selection_mode:"self_select"})).status,"processed");
assert.equal(db.prepare("SELECT source FROM scent_club_requests WHERE external_id='SC-1'").get().source,"emailjs_email");
assert.equal(processMessage(message("scent-copy",{type:"scent_club_request",request_id:"SC-1",first_name:"Test",last_name:"Klant",email:"test@example.com",plan:"signature",preference_gender:"Dames",preference_family:"Floraal",selection_mode:"self_select"})).status,"duplicate");
assert.equal(processMessage(message("order",{type:"order",request_id:"ORV-1",order_number:"ORV-1",customer_name:"Test Klant",customer_email:"test@example.com",items:"1x parfum",subtotal:"€ 12,95",shipping:"€ 4,95",total:"€ 17,90",payment_status:"COMPLETED",capture_id:"CAPTURE-1"})).status,"processed");
assert.equal(db.prepare("SELECT payment_status FROM orders WHERE order_number='ORV-1'").get().payment_status,"verification_required");
assert.equal(processMessage(message("pay-later",{type:"pay_later_order",request_id:"ORV-LATER-1",order_number:"ORV-LATER-1",customer_name:"Test Klant",customer_email:"later@example.com",customer_phone:"0612345678",customer_address:"Teststraat 1\\n1234 AB Teststad",items:"1x parfum",subtotal:"€ 12,95",discount:0,shipping:"€ 4,95",total:"€ 17,90",payment_method:"pay_later",payment_status:"unpaid",order_status:"review_required",terms_accepted:true,return_policy_accepted:true,age_confirmed:true,newsletter_opt_in:false})).status,"processed");
const payLaterOrder = db.prepare("SELECT payment_method,payment_status,status,pay_later_status,age_confirmed FROM orders WHERE order_number='ORV-LATER-1'").get();
assert.deepEqual(payLaterOrder,{payment_method:"pay_later",payment_status:"unpaid",status:"review_required",pay_later_status:"review_required",age_confirmed:1});
assert.equal(processMessage(message("news",{type:"newsletter",request_id:"NEWS-1",email:"test@example.com",name:"Test",action:"subscribe"})).status,"processed");
assert.equal(processMessage(message("contact",{type:"contact",request_id:"CONTACT-1",email:"test@example.com",name:"Test",message:"Vraag"})).status,"processed");
assert.equal(processMessage(message("b2b",{type:"b2b_request",request_id:"B2B-1",email:"bedrijf@example.com",company:"Voorbeeld BV"})).status,"processed");
assert.equal(processMessage({id:"broken",internetMessageId:"<broken@orivea.nl>",subject:"Onbekend",body:{content:"Geen datablok"}}).status,"review_required");

const graphMail = message("graph",{type:"contact",request_id:"CONTACT-2",email:"graph@example.com",message:"Graph test"});
const mockFetch = async (url) => url.includes("login.microsoftonline.com")
  ? new Response(JSON.stringify({access_token:"token"}),{status:200,headers:{"Content-Type":"application/json"}})
  : new Response(JSON.stringify({value:[graphMail]}),{status:200,headers:{"Content-Type":"application/json"}});

syncMailbox({fetchImpl:mockFetch}).then((report) => {
  assert.equal(report.processed,1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM mail_intake_events").get().count,9);
  console.log("Mail Intake tests geslaagd: parsing, vijf mailtypes, deduplicatie, review en Graph catch-up.");
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dbFile + suffix, { force:true });
}).catch((error)=>{ console.error(error); db.close(); process.exitCode=1; });
