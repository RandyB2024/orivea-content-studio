process.env.DATABASE_PATH=process.env.DATABASE_PATH||"data/knowledge-integration-test.sqlite";
const {db,initDb}=require("../src/workspace/db");
const knowledge=require("../services/knowledgeService");
const products=require("../services/productDataService");
async function run(){initDb();const file=process.argv[2];if(!file)throw new Error("Geef een TXT-testbestand op.");const result=db.prepare("INSERT INTO knowledge_documents(title,source_type,file_name,file_path,mime_type,document_type,status) VALUES(?,?,?,?,?,?,?)").run("Test Glantier","glantier","test.txt",file,"text/plain","txt","processing");const processed=await knowledge.processDocument(result.lastInsertRowid);const hits=knowledge.retrieve("401 campagne Premium");console.log(JSON.stringify({processed,hits:hits.length,products:products.all().length,product401:Boolean(products.find("401"))},null,2));if(processed.status!=="ready"||!hits.length||!products.all().length)throw new Error("Kennisbank-integratietest mislukt.");}
run().then(()=>db.close()).catch(error=>{console.error(error);db.close();process.exit(1);});
