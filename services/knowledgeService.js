const fs=require("fs");
const path=require("path");
const mammoth=require("mammoth");
const ExcelJS=require("exceljs");
const {PDFParse}=require("pdf-parse");
const {db}=require("../src/workspace/db");

function normalize(text){return String(text||"").replace(/\0/g,"").replace(/\r/g,"").replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim();}
function chunks(text,size=1200,overlap=160){const clean=normalize(text);const result=[];let start=0;while(start<clean.length){let end=Math.min(clean.length,start+size);if(end<clean.length){const boundary=clean.lastIndexOf(" ",end);if(boundary>start+size/2)end=boundary;}result.push(clean.slice(start,end).trim());if(end===clean.length)break;start=Math.max(start+1,end-overlap);}return result.filter(Boolean);}
async function extract(file,mime){
  const ext=path.extname(file).toLowerCase();
  if([".txt",".csv"].includes(ext))return normalize(fs.readFileSync(file,"utf8"));
  if(ext===".docx"){const output=await mammoth.extractRawText({path:file});return normalize(output.value);}
  if(ext===".xlsx"){const book=new ExcelJS.Workbook();await book.xlsx.readFile(file);const output=[];book.eachSheet(sheet=>{output.push(`# ${sheet.name}`);sheet.eachRow(row=>output.push(row.values.slice(1).map(value=>typeof value==="object"?JSON.stringify(value):String(value??"")).join(",")));});return normalize(output.join("\n"));}
  if(ext===".pdf"||mime==="application/pdf"){const parser=new PDFParse({data:fs.readFileSync(file)});try{return normalize((await parser.getText()).text);}finally{await parser.destroy();}}
  return "";
}
async function processDocument(id){
  const doc=db.prepare("SELECT * FROM knowledge_documents WHERE id=?").get(id);if(!doc)throw new Error("Document niet gevonden.");
  try{const text=await extract(doc.file_path,doc.mime_type);const meaningful=text.replace(/-- \d+ of \d+ --/g,"").trim();if(!meaningful||(doc.document_type==="pdf"&&meaningful.length<80)){db.prepare("UPDATE knowledge_documents SET status='ocr_required',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);return{status:"ocr_required",chunks:0};}
    const parts=chunks(text);db.transaction(()=>{db.prepare("DELETE FROM knowledge_chunks WHERE document_id=?").run(id);const insert=db.prepare("INSERT INTO knowledge_chunks(document_id,chunk_index,content) VALUES(?,?,?)");parts.forEach((part,index)=>insert.run(id,index,part));db.prepare("UPDATE knowledge_documents SET extracted_text=?,status='ready',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(text,id);})();return{status:"ready",chunks:parts.length};
  }catch(error){db.prepare("UPDATE knowledge_documents SET status='failed',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);throw error;}
}
function terms(value){return [...new Set(String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").match(/[a-z0-9]{2,}/g)||[])];}
function retrieve(query,{limit=6,campaignId=null,validAt=new Date()}={}){
  const needle=terms(query);if(!needle.length)return[];
  const rows=db.prepare(`SELECT k.*,d.title document_title,d.source_type,d.valid_from,d.valid_until,d.campaign_id
    FROM knowledge_chunks k JOIN knowledge_documents d ON d.id=k.document_id WHERE d.status='ready'
    AND (d.valid_from IS NULL OR date(d.valid_from)<=date(?)) AND (d.valid_until IS NULL OR date(d.valid_until)>=date(?))`).all(validAt.toISOString(),validAt.toISOString());
  return rows.map(row=>{const hay=terms(row.content);const exact=needle.reduce((sum,t)=>sum+(row.content.toLowerCase().includes(t)?1:0),0);const overlap=needle.filter(t=>hay.includes(t)).length/needle.length;const campaign=campaignId&&Number(row.campaign_id)===Number(campaignId)?2:0;const priority={orivea:3,glantier:2.5,whatsapp:1,other:.5}[row.source_type]||0;return{...row,score:exact+overlap*3+campaign+priority};}).filter(row=>row.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
}
module.exports={extract,processDocument,retrieve,chunks,terms};
