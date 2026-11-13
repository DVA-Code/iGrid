import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
export const DATA_DIR=path.resolve(process.env.DATA_DIR||fileURLToPath(new URL('./data',import.meta.url)))
const fields=['va','vb','vc','ia','ib','ic','pfa','pfb','pfc','pKw','freq']
export function createStore(filename=path.join(DATA_DIR,'gml.sqlite')) {
  if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true})
  const db=new DatabaseSync(filename)
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
    CREATE TABLE IF NOT EXISTS readings(sn TEXT NOT NULL,t INTEGER NOT NULL,received INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(sn,t));
    CREATE INDEX IF NOT EXISTS readings_time ON readings(t);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,sn TEXT,t INTEGER NOT NULL,kind TEXT NOT NULL,detail TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS events_time ON events(t); PRAGMA user_version=1;`)
  db.exec(`CREATE TABLE IF NOT EXISTS bridge_state(key TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS predictions(sn TEXT NOT NULL,t INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(sn,t));`)
  const insert=db.prepare('INSERT OR IGNORE INTO readings VALUES(?,?,?,?)')
  const eventInsert=db.prepare('INSERT INTO events(sn,t,kind,detail) VALUES(?,?,?,?)')
  return {db,
    bridge(snapshot){db.prepare("INSERT OR REPLACE INTO bridge_state VALUES('snapshot',?)").run(JSON.stringify(snapshot))},
    prediction(sn,result){if(result.points.length)db.prepare('INSERT OR REPLACE INTO predictions VALUES(?,?,?)').run(sn,Math.floor(result.generatedAt/600000)*600000,JSON.stringify(result));return{...result,savedForecasts:Number(db.prepare('SELECT COUNT(*) AS n FROM predictions WHERE sn=?').get(sn).n)}},
    record(r){return Number(insert.run(r.sn,r.t,r.receivedAt,JSON.stringify(r)).changes)>0},
    event(sn,kind,detail,t=Date.now()){const id=Number(eventInsert.run(sn,t,kind,detail).lastInsertRowid);return{id,sn,t,kind,detail}},
    events(from=0,to=Date.now(),sn=null,limit=200){return db.prepare('SELECT * FROM events WHERE t>=? AND t<=? AND (? IS NULL OR sn=?) ORDER BY t DESC,id DESC LIMIT ?').all(from,to,sn,sn,Math.min(1000,limit))},
    latest(sn){const r=db.prepare('SELECT data FROM readings WHERE sn=? ORDER BY t DESC LIMIT 1').get(sn);return r?JSON.parse(r.data):null},
    query(sn,from,to,step=60000){
      if(![from,to,step].every(Number.isFinite)||to<=from||step<1000)throw new Error('Invalid history interval')
      const sql=`SELECT CAST((t+20700000)/? AS INTEGER)*?-20700000 AS t,COUNT(*) AS n,MIN(t) AS first,MAX(t) AS last,MAX(received) AS receivedAt,
        ${fields.map(f=>`AVG(json_extract(data,'$.${f}')) AS ${f}`).join(',')},
        MAX(json_extract(data,'$.energyInKwh')) AS energyInKwh,MAX(json_extract(data,'$.energyOutKwh')) AS energyOutKwh
        FROM readings WHERE sn=? AND t>=? AND t<=? GROUP BY 1 ORDER BY 1 LIMIT 10000`
      return db.prepare(sql).all(step,step,sn,from,to).map(r=>({...r,sn,origin:'MEASURED',timeBasis:'aggregate',quality:['AGGREGATED']}))
    },
    coverage(sn){return {...db.prepare('SELECT MIN(t) AS first,MAX(t) AS last,COUNT(*) AS count,COUNT(DISTINCT CAST((t+20700000)/86400000 AS INTEGER)) AS days FROM readings WHERE sn=?').get(sn)}},
    analytics(sn,from,to,maxGapMs=120000){
      const rows=db.prepare('SELECT data FROM readings WHERE sn=? AND t>=? AND t<=? ORDER BY t').iterate(sn,from,to)
      const days=new Map();let prev=null,resetCount=0
      for(const row of rows){const r=JSON.parse(row.data),day=new Date(r.t+20700000).toISOString().slice(0,10)
        if(!days.has(day))days.set(day,{day,kwh:0,coveredHours:0,peakKw:r.pKw,samples:0})
        days.get(day).samples++;days.get(day).peakKw=Math.max(days.get(day).peakKw,r.pKw)
        if(prev){
          if(r.energyInKwh<prev.energyInKwh||r.energyOutKwh<prev.energyOutKwh)resetCount++
          const dt=r.t-prev.t
          if(dt>0&&dt<=maxGapMs){let start=prev.t
            while(start<r.t){const stop=Math.min(r.t,(Math.floor((start+20700000)/86400000)+1)*86400000-20700000),d=new Date(start+20700000).toISOString().slice(0,10)
              if(!days.has(d))days.set(d,{day:d,kwh:0,coveredHours:0,peakKw:prev.pKw,samples:0})
              const pa=prev.pKw+(r.pKw-prev.pKw)*(start-prev.t)/dt,pb=prev.pKw+(r.pKw-prev.pKw)*(stop-prev.t)/dt
              days.get(d).kwh+=(pa+pb)/2*(stop-start)/3600000;days.get(d).coveredHours+=(stop-start)/3600000;start=stop}
          }
        }prev=r
      }
      const daily=[...days.values()].sort((a,b)=>a.day.localeCompare(b.day))
      return{sn,from,to,daily,kwh:daily.reduce((s,d)=>s+d.kwh,0),coveredHours:daily.reduce((s,d)=>s+d.coveredHours,0),resetCount,method:'Trapezoidal net active power; gaps excluded; Asia/Kathmandu'}
    },close(){db.close()}}
}
