#!/usr/bin/env node
// ========================================================
// verify.js — three-layer verification of the calculator.
//
// Built after a run of bugs that each slipped past the previous
// check, because every check tested the FORMULAS and every bug was
// somewhere else. The three layers now are:
//
//   1. FORMULAS   a clean-room re-implementation of the spec,
//                 sharing no code with the page, compared component
//                 by component.
//   2. DISPLAY    the real render() driven against a capturing DOM
//                 across ~900 input combinations, asserting that
//                 what a human SEES is sane: no NaN/Infinity, every
//                 percentage in range, cost-bar widths summing to
//                 100, share claims about the right denominator.
//   3. BEHAVIOUR  properties that must hold everywhere: cost is
//                 monotonic in seats, totals equal their parts, zero
//                 usage means zero AI, peak sizes hardware but not
//                 tokens, nothing negative or non-finite anywhere.
//
// What this CANNOT establish: whether the assumptions match reality.
// Tokens per scan, egress per job and the unpublished Cloud Run idle
// rate are estimates, flagged as such on the page. Verification
// proves the model computes what it claims — not that the claims are
// the world.
//
// Run:  node verify.js
// ========================================================

console.log("\n=== LAYER 1: FORMULAS (clean-room) ===");
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

console.log("\n=== LAYER 2: DISPLAY (rendered output) ===");
(function(){
const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
let js=html.split('<script>')[1].split('</script>')[0];

const vals={};
const captured={};
function mkEl(id){
  return {
    get value(){return vals[id]}, set value(v){vals[id]=String(v)},
    set innerHTML(v){captured[id]=String(v)}, get innerHTML(){return captured[id]||''},
    set textContent(v){captured[id+'#text']=String(v)},
    addEventListener(){}, dataset:{}, classList:{toggle(){}}, style:{},
  };
}
global.document={
  getElementById:id=>mkEl(id),
  querySelectorAll:()=>[],
};

const cases=[];
const seatPts=[0,1,50,120,240,360,425,500,620,750,880,1000];       // log positions
const usage=[['0','0','0','0'],['5','3','4','2'],['1','1','1','0'],
             ['60','60','40','40'],['0','60','0','0'],['30','0','20','5']];
const misc=[['30','1','1','1.17'],['10','13','0','0.9'],['80','5','3','1.5'],['15','1','0','1.0']];
for(const sp of seatPts) for(const u of usage) for(const m of misc)
  cases.push({sp,u,m});

let fails=[], checked=0;
const BAD=/NaN|Infinity|undefined|null%|\$NaN|<b><\/b>/;
for(const arch of ['render','srv','vps']){
  for(const c of cases){
    Object.assign(vals,{seats:String(c.sp),comp:c.u[0],insp:c.u[1],est:c.u[2],tend:c.u[3],
      peak:c.m[0],reg:c.m[1],warm:c.m[2],fx:c.m[3],
      fIn:'0.75',fOut:'3.75',pIn:'2.00',pOut:'12.00',sam:'0.004'});
    for(const k in captured) delete captured[k];
    let M;
    try{
      M=eval(js.replace(/^render\(\);$/m,'')+'\n;({render,calc,calcServerless,calcVps,setArch:a=>{arch=a}})');
    }catch(e){ fails.push(['EVAL',JSON.stringify(c),e.message]); continue; }
    // drive the arch the same way the tab click does
    try{
      const src=js.replace(/^render\(\);$/m,'').replace("let arch = 'render';","let arch = '"+arch+"';");
      const R=eval(src+'\n;({render})');
      R.render();
    }catch(e){ fails.push([arch,JSON.stringify(c),'THREW: '+e.message]); continue; }
    checked++;
    const tag=arch+' seats@'+c.sp+' u='+c.u.join('/')+' m='+c.m.join('/');
    for(const [k,v] of Object.entries(captured)){
      if(BAD.test(v)) fails.push([tag,k,'BAD TOKEN: '+(v.match(BAD)||[''])[0]+' in '+v.slice(0,90)]);
    }
    // percentages must be sane
    for(const m of (captured['costlegend']||'').matchAll(/·\s*(-?\d+)%/g)){
      const pct=+m[1];
      if(pct<0||pct>100) fails.push([tag,'costlegend','pct out of range: '+pct+'%']);
    }
    // cost bar widths must sum to ~100
    const widths=[...(captured['costbar']||'').matchAll(/width:(-?[\d.]+)%/g)].map(x=>+x[1]);
    if(widths.length){
      const sum=widths.reduce((a,b)=>a+b,0);
      if(sum<99.0||sum>101.0) fails.push([tag,'costbar','widths sum '+sum.toFixed(2)+'%']);
      if(widths.some(w=>w<0)) fails.push([tag,'costbar','negative width']);
    }
    // the compare strip share claim
    for(const m of (captured['compare']||'').matchAll(/is (-?\d+)% of this/g)){
      const p=+m[1];
      if(p<0||p>100) fails.push([tag,'compare','share '+p+'%']);
    }
  }
}
console.log('rendered cases:', checked);
if(!fails.length){console.log('NO PRESENTATION-LAYER DEFECTS FOUND');}
else{
  const seen=new Set(); let shown=0;
  console.log('DEFECTS:', fails.length);
  for(const f of fails){
    const key=f[1]+'|'+String(f[2]).slice(0,45);
    if(seen.has(key))continue; seen.add(key);
    console.log('  ['+f[0]+'] '+f[1]+' -> '+f[2]);
    if(++shown>14){console.log('  ...');break;}
  }
}

})();

console.log("\n=== LAYER 3: BEHAVIOUR (invariants) ===");
(function(){
const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
let js=html.split('<script>')[1].split('</script>')[0].replace(/^render\(\);$/m,'');
const vals={};
global.document={getElementById:id=>({get value(){return vals[id]},set value(v){vals[id]=String(v)},
  set innerHTML(v){},set textContent(v){},addEventListener(){},dataset:{},classList:{toggle(){}},style:{}}),
  querySelectorAll:()=>[]};
const M=eval(js+'\n;({calc,calcServerless,calcVps,posFromSeats,seatsFromPos})');
const set=(o)=>Object.assign(vals,{seats:'425',comp:'5',insp:'3',est:'4',tend:'2',peak:'30',reg:'1',
  warm:'1',fx:'1.17',fIn:'0.75',fOut:'3.75',pIn:'2.00',pOut:'12.00',sam:'0.004'},o);
const all=()=>{const d=M.calc();return {d,sv:M.calcServerless(d),vp:M.calcVps(d)};};
let bad=[];
const chk=(name,cond,detail)=>{ if(!cond) bad.push(name+(detail?' :: '+detail:'')); };

// 1. MONOTONIC IN SEATS - cost must never fall as seats rise
let prev=null;
for(const sp of [0,60,120,240,360,425,500,620,750,880,1000]){
  set({seats:String(sp)}); const {d,sv,vp}=all();
  if(prev){
    chk('render monotonic', d.total>=prev.r-0.01, `${prev.r.toFixed(2)} -> ${d.total.toFixed(2)}`);
    chk('srv monotonic',    sv.total>=prev.s-0.01, `${prev.s.toFixed(2)} -> ${sv.total.toFixed(2)}`);
    chk('vps monotonic',    vp.total>=prev.v-0.01, `${prev.v.toFixed(2)} -> ${vp.total.toFixed(2)}`);
  }
  prev={r:d.total,s:sv.total,v:vp.total};
}
// 2. ZERO USAGE => ZERO AI, and infra still positive (you still host it)
set({comp:'0',insp:'0',est:'0',tend:'0'});
{ const {d,sv,vp}=all();
  chk('zero usage -> AI 0', Math.abs(d.aiCost)<1e-9, d.aiCost);
  chk('zero usage -> infra > 0 (render)', d.infraCost>0);
  chk('zero usage -> vps infra > 0', vp.infra>0);
  chk('zero usage -> srv infra >= 0', sv.infra>=0); }
// 3. MORE USAGE => MORE AI
set({}); const a=all().d.aiCost; set({insp:'6'}); const b=all().d.aiCost;
chk('more inspector -> more AI', b>a, `${a.toFixed(2)} -> ${b.toFixed(2)}`);
// 4. PEAK affects hardware but NOT AI  (the claim printed on the page)
set({peak:'10'}); const lo=all(); set({peak:'80'}); const hi=all();
chk('peak does not change AI', Math.abs(lo.d.aiCost-hi.d.aiCost)<1e-9);
chk('peak does not lower infra', hi.d.infraCost>=lo.d.infraCost-1e-9);
// 5. REGIONS grow the index, never shrink it
set({reg:'1'}); const r1=all().d.qGb; set({reg:'13'}); const r13=all().d.qGb;
chk('more regions -> bigger index', r13>r1, `${r1.toFixed(2)} -> ${r13.toFixed(2)}`);
// 6. TOTAL == COMPONENTS, everywhere
for(const sp of [0,240,500,750,1000]){
  set({seats:String(sp)}); const {d,sv,vp}=all();
  chk('render total=parts', Math.abs(d.total-(d.aiCost+d.fsCost+d.infraCost))<0.01);
  chk('srv total=parts',    Math.abs(sv.total-(d.aiCost+d.fsCost+sv.infra))<0.01);
  chk('vps total=parts',    Math.abs(vp.total-(d.aiCost+d.fsCost+vp.infra))<0.01);
  chk('srv infra=parts',    Math.abs(sv.infra-(sv.cmpCost+sv.reqCost+sv.pcCost+sv.egress))<0.01);
}
// 7. NOTHING NEGATIVE, NOTHING NON-FINITE
for(const sp of [0,300,700,1000]) for(const u of [['0','0','0','0'],['60','60','40','40']]){
  set({seats:String(sp),comp:u[0],insp:u[1],est:u[2],tend:u[3]});
  const {d,sv,vp}=all();
  for(const [k,v] of Object.entries({...d,...{srvInfra:sv.infra,vpsInfra:vp.infra}})){
    if(typeof v==='number') chk('finite & non-negative: '+k, Number.isFinite(v)&&v>=-1e-9, `${k}=${v}`);
  }
}
// 8. WARM INSTANCES cost money but never reduce total
set({warm:'0'}); const w0=all().sv.total; set({warm:'3'}); const w3=all().sv.total;
chk('warm instances add cost', w3>=w0-1e-9, `${w0.toFixed(2)} -> ${w3.toFixed(2)}`);
// 9. SEAT SCALE round-trips
for(const n of [1,10,250,5000,1000000]){
  const back=M.seatsFromPos(M.posFromSeats(n));
  chk('seat round-trip '+n, Math.abs(back-n)/n<0.15, `${n} -> ${back}`);
}
// 10. COLOCATION must eventually stop (index cannot ride along forever)
set({seats:'1000',reg:'13'}); chk('huge scale splits qdrant', all().d.colocated===false);

console.log(bad.length? 'VIOLATIONS ('+bad.length+'):\n  '+[...new Set(bad)].join('\n  ')
                      : 'ALL BEHAVIOURAL INVARIANTS HOLD');

})();
