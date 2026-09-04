const session = require("express-session");
const { db } = require("./db");

class SqliteSessionStore extends session.Store {
  get(sid, callback) {
    try {
      const row = db.prepare("SELECT data FROM sessions WHERE sid=? AND expires_at>?").get(sid, Date.now());
      callback(null, row ? JSON.parse(row.data) : null);
    } catch (error) { callback(error); }
  }
  set(sid, value, callback=()=>{}) {
    try {
      const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now()+8*60*60*1000;
      db.prepare("INSERT INTO sessions (sid,data,expires_at) VALUES (?,?,?) ON CONFLICT(sid) DO UPDATE SET data=excluded.data,expires_at=excluded.expires_at").run(sid,JSON.stringify(value),expires);
      callback();
    } catch (error) { callback(error); }
  }
  destroy(sid, callback=()=>{}) { try { db.prepare("DELETE FROM sessions WHERE sid=?").run(sid); callback(); } catch(error){callback(error);} }
  touch(sid, value, callback=()=>{}) { this.set(sid,value,callback); }
}
module.exports = SqliteSessionStore;
