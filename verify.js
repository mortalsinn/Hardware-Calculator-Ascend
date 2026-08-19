#!/usr/bin/env node
// ========================================================
// verify.js — clean-room verification of the calculator.
//
// Re-implements the model's documented spec FROM SCRATCH (shares no
// code with the page) and compares every cost component at 10 and
// 10,000 seats. If any formula in index.html is miscoded, the two
// implementations disagree and this prints FAIL.
//
// What this proves: the arithmetic matches the spec.
// What it cannot prove: that the spec's assumptions match reality —
// those are listed on the page itself, with the softest flagged.
//
// Run:  node verify.js
// ========================================================
// CLEAN-ROOM VERIFIER. Re-implements the model's SPEC from scratch —
// shares no code with the page — then compares every component.
// Catches coding slips; deliberately cannot catch bad assumptions,
// because it uses the same spec on purpose.
const fs=require('fs');
// Extracts the model from index.html so it always verifies the DEPLOYED
// page, not a copy that could drift.
const html=fs.readFileSync(require('path').join(__dirname,'index.html'),'utf8');
let js=html.split('<script>')[1].split('</script>')[0];
const vals={seats:'0',comp:'5',insp:'3',est:'4',tend:'2',peak:'30',reg:'1',warm:'1',fx:'1.17',
  fIn:'0.75',fOut:'3.75',pIn:'2.00',pOut:'12.00',sam:'0.004'};
global.document={getElementById:id=>({get value(){return vals[id]},set value(v){vals[id]=String(v)},
  set innerHTML(v){},set textContent(v){},addEventListener(){},dataset:{},classList:{toggle(){}}}),
  querySelectorAll:()=>[]};
js=js.replace(/^render\(\);$/m,'');
const M=eval(js+'\n;({calc,calcServerless,calcVps,posFromSeats})');

// ---------- independent implementation, from the written spec ----------
function spec(seats){
  const WD=21, WH=8, peak=3.0;
  const W={ compass:{calls:3,secs:12,fi:9000,fo:2000,pi:0,po:0,sam:0,vq:3},
            inspect:{calls:4,secs:55,fi:6000,fo:1000,pi:24000,po:3000,sam:14,vq:3},
            estim:  {calls:3,secs:20,fi:12000,fo:2000,pi:0,po:0,sam:0,vq:1},
            tender: {calls:13,secs:95,fi:70000,fo:9000,pi:0,po:0,sam:0,vq:8} };
  const per={compass:5*WD, inspect:3*WD, estim:4*WD, tender:2};
  let jobs=0,conc=0,sec=0,vq=0,fi=0,fo=0,pi=0,po=0,sam=0;
  for(const k in W){const n=seats*per[k],w=W[k];
    jobs+=n; sec+=n*w.secs; vq+=n*w.vq; sam+=n*w.sam;
    fi+=n*w.fi; fo+=n*w.fo; pi+=n*w.pi; po+=n*w.po;
    conc+=(n/WD/WH)*peak*w.secs/3600;}
  const ai = fi/1e6*0.75+fo/1e6*3.75+pi/1e6*2+po/1e6*12+sam*0.004;
  const orgs=Math.ceil(seats/8);
  const vectors=1*45000+orgs*5000, VB=768*4+2200;
  const qGb=Math.max(0.4, vectors*VB*1.4/1e9);
  const fsOps=jobs*55+seats*900, fsC=fsOps/1e5*0.06+orgs*0.35;
  const egress=jobs*0.008+seats*0.4;
  const needCpu=conc*0.3+0.35, needRam=conc*0.35+1.2, webN=Math.max(1,Math.ceil(conc/45));
  // Render
  const RL=[{n:'Starter',c:.5,r:.5,p:7},{n:'Standard',c:1,r:2,p:25},{n:'Pro',c:2,r:4,p:85},
            {n:'Pro Plus',c:4,r:8,p:175},{n:'Pro Max',c:4,r:16,p:225},{n:'Pro Ultra',c:8,r:32,p:450}];
  const fit=(cpu,ram,minR,maxN,minN)=>{let b=null;
    for(const pl of RL){ if(pl.r<minR)continue;
      const ct=Math.max(minN,Math.ceil(Math.max(cpu/pl.c,ram/pl.r)));
      if(ct>maxN)continue; if(!b||pl.p*ct<b.cost)b={pl,ct,cost:pl.p*ct};}
    const t=RL[5]; const tc=Math.max(1,Math.ceil(Math.max(cpu/t.c,ram/t.r))); return b||{pl:t,ct:tc,cost:t.p*tc};};
  const colo=(needRam+qGb)<=14 && conc<12 && webN===1;
  const web=fit(needCpu,needRam+(colo?qGb:0),2,64,webN);
  const qdr=colo?null:fit(2,qGb,qGb,1,1);
  const disk=Math.max(1,Math.ceil(qGb*1.3))*0.25;
  const ws=egress>1000?{p:499,i:1000}:egress>5?{p:25,i:25}:{p:0,i:5};
  const bw=ws.p+Math.max(0,egress-ws.i)*0.15;
  const rInfra=web.cost+(qdr?qdr.cost:0)+disk+bw;
  // Serverless
  const cmp=Math.max(0,sec*0.3-180000)*0.000024+Math.max(0,(sec/45)*2-360000)*0.0000025
           +1*730*3600*(0.0000025+2*0.0000025);
  const req=Math.max(0,(jobs*8+seats*300)-2e6)/1e6*0.40;
  const storeGB=vectors*VB/1e9, nsGB=45000*VB/1e9, ru=vq*Math.max(0.25,nsGB);
  const pc=(storeGB<=2&&ru<=1e6)?0:Math.max(50,storeGB*0.33+ru/1e6*18);
  const sInfra=cmp+req+pc+egress*0.12;
  // VPS
  const HZ=[{n:'CX23',c:2,r:4,e:5.49},{n:'CX33',c:4,r:8,e:8.99},{n:'CX43',c:8,r:16,e:15.99},{n:'CX53',c:16,r:32,e:29.99}];
  const fitH=(cpu,ram,minR,minN,maxOne)=>{let b=null;
    for(const pl of HZ){ if(pl.r<minR)continue;
      const ct=Math.max(minN,Math.ceil(Math.max(cpu/pl.c,ram/pl.r)));
      if(maxOne&&ct>1)continue; if(!b||pl.e*ct<b.cost)b={pl,ct,cost:pl.e*ct};}
    return b;};
  const vColo=(needRam+qGb)<=28 && conc<12 && webN===1;
  const vWeb=fitH(needCpu,needRam+(vColo?qGb:0),4,webN,false);
  let vQ=vColo?null:fitH(2,qGb,qGb,1,true);
  if(!vColo&&!vQ){const t=HZ[3];vQ={pl:t,ct:Math.ceil(qGb/t.r),cost:t.e*Math.ceil(qGb/t.r)};}
  const sEur=vWeb.cost+(vQ?vQ.cost:0), srvN=vWeb.ct+(vQ?vQ.ct:0);
  const vInfra=(sEur+srvN*0.5+sEur*0.20+(srvN>1?6.5:0))*1.17;
  return {jobs,conc,ai,fsC,egress,rInfra,rTotal:ai+fsC+rInfra,sInfra,sTotal:ai+fsC+sInfra,vInfra,vTotal:ai+fsC+vInfra};
}

let fails=0;
const cmp=(name,a,b)=>{const ok=Math.abs(a-b)<=Math.max(0.01,Math.abs(b)*1e-9);
  if(!ok)fails++;
  console.log((ok?'  PASS ':'  FAIL ')+name.padEnd(22)+String(a.toFixed(2)).padStart(14)+' vs '+b.toFixed(2));};
for(const n of [10,10000]){
  vals.seats=String(M.posFromSeats(n));
  const d=M.calc(), sv=M.calcServerless(d), vp=M.calcVps(d), e=spec(n);
  console.log('=== '+n+' seats ===');
  cmp('jobs/month',      e.jobs,   d.jobsMo);
  cmp('peak concurrent', e.conc,   d.peakConc);
  cmp('AI cost',         e.ai,     d.aiCost);
  cmp('Firestore',       e.fsC,    d.fsCost);
  cmp('egress GB',       e.egress, d.egressGb);
  cmp('Render infra',    e.rInfra, d.infraCost);
  cmp('Render TOTAL',    e.rTotal, d.total);
  cmp('Serverless infra',e.sInfra, sv.infra);
  cmp('Serverless TOTAL',e.sTotal, sv.total);
  cmp('VPS infra',       e.vInfra, vp.infra);
  cmp('VPS TOTAL',       e.vTotal, vp.total);
}
console.log(fails===0?'\nALL COMPONENTS AGREE — two independent implementations.':'\n'+fails+' DISAGREEMENTS — investigate.');
