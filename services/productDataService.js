const fs=require("fs");const path=require("path");const vm=require("vm");
let cache={mtime:0,products:[]};
function sourcePath(){return path.resolve(__dirname,"..",process.env.ORIVEA_PRODUCTS_PATH||"../Orivea/products.js");}
function all(){const file=sourcePath();if(!fs.existsSync(file))return[];const stat=fs.statSync(file);if(stat.mtimeMs===cache.mtime)return cache.products;const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(file,"utf8"),sandbox,{timeout:1000,filename:"products.js"});cache={mtime:stat.mtimeMs,products:Array.isArray(sandbox.window.ORIVEA_PRODUCTS)?sandbox.window.ORIVEA_PRODUCTS:[]};return cache.products;}
function find(reference){const value=String(reference||"").trim().toLowerCase();if(!value)return null;return all().find(product=>[product.id,product.number,product.productNumber,product.reference,product.name].some(field=>String(field||"").toLowerCase()===value))||null;}
function factualContext(product){if(!product)return null;const allowed=["id","number","productNumber","reference","name","title","price","size","volume","category","family","notes","scentNotes","premium","url","link"];return Object.fromEntries(allowed.filter(key=>product[key]!==undefined).map(key=>[key,product[key]]));}
module.exports={all,find,factualContext,sourcePath};
