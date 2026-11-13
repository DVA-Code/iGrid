export function predict(rows,latest,now=Date.now()){
 const clean=rows.filter(r=>Number.isFinite(r.pKw)&&r.t<now-3600000).sort((a,b)=>a.t-b.t)
 const hours=clean.length?(now-clean[0].t)/3600000:0,buckets=Array.from({length:24},()=>[])
 for(const r of clean)buckets[new Date(r.t+20700000).getUTCHours()].push(r.pKw)
 if(!latest||now-latest.t>360000||hours<24||buckets.some(x=>!x.length))return{generatedAt:now,points:[],basis:'Insufficient fresh history: collect at least 24 hours with observations in every local hour.',coverageHours:hours,model:'local-hour-profile-v1'}
 const mean=buckets.map(a=>a.reduce((s,v)=>s+v,0)/a.length),h=new Date(now+20700000).getUTCHours(),ratio=mean[h]>0?Math.min(2,Math.max(.5,latest.pKw/mean[h])):1
 return{generatedAt:now,points:Array.from({length:12},(_,i)=>{const t=now+(i+1)*900000;return{t,p:mean[new Date(t+20700000).getUTCHours()]*ratio}}),basis:'Experimental local-hour profile, adjusted to latest demand. Compare with later measurements.',coverageHours:hours,model:'local-hour-profile-v1'}
}
