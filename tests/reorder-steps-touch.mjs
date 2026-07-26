import { chromium } from 'playwright';
const fails=[], oks=[]; const ck=(c,m)=>c?oks.push(m):fails.push(m);
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const b=await chromium.launch({executablePath:CHROME});
// A real touch device: no mouse, no hover. This is the iPhone case.
const ctx=await b.newContext({viewport:{width:390,height:844}, hasTouch:true, isMobile:true,
  deviceScaleFactor:3, userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'});
const pg=await ctx.newPage();
await pg.route('**://**', r=>r.request().url().startsWith('file:')?r.continue():r.abort());
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('file://'+process.cwd()+'/index.html');
for(let i=0;i<20;i++){
  if(await pg.evaluate(()=>/take me straight in/.test(document.body.innerText))){
    await pg.evaluate(()=>{const e=[...document.querySelectorAll('button,a,[role="button"]')].find(x=>/take me straight in/i.test(x.textContent||''));e&&e.click()});
    await pg.waitForTimeout(400); break;
  }
  await pg.waitForTimeout(150);
}
await pg.evaluate(()=>document.querySelector('[data-tab="add"]').click());
await pg.waitForTimeout(400);
await pg.evaluate(()=>{const e=[...document.querySelectorAll('button,[role="button"]')].find(x=>/create a recipe/i.test(x.textContent||''));e&&e.click()});
await pg.waitForTimeout(600);
await pg.evaluate(()=>{const e=[...document.querySelectorAll('button,[role="button"]')].find(x=>/^method$/i.test((x.textContent||'').trim()));e&&e.click()});
await pg.waitForTimeout(400);
const steps=['Heat the oven.','Season the chicken.','Roast for 90 minutes.','Rest before carving.'];
for(let i=0;i<steps.length;i++){
  if(!await pg.evaluate(i=>!!document.querySelector('[data-fs="'+i+'"]'), i)){
    await pg.evaluate(()=>{const e=document.querySelector('[data-add-step]');e&&e.click()});
    await pg.waitForTimeout(250);
  }
  await pg.fill('[data-fs="'+i+'"]', steps[i]);
}
await pg.waitForTimeout(250);
const order = () => pg.evaluate(()=>[...document.querySelectorAll('[data-fs]')].map(t=>t.value));

// touch-action:none must be on the handle ONLY, or the page stops scrolling.
const ta = await pg.evaluate(()=>({
  grip: getComputedStyle(document.querySelector('[data-grip="0"]')).touchAction,
  row:  getComputedStyle(document.querySelector('[data-steprow="0"]')).touchAction,
  view: getComputedStyle(document.getElementById('view')).touchAction,
}));
ck(ta.grip==='none',                  `G1 handle opts out of touch scrolling (${ta.grip})`);
ck(ta.row!=='none',                   `G2 the rest of the row still scrolls (${ta.row})`);
ck(ta.view!=='none',                  `G3 the page still scrolls (${ta.view})`);
ck(await pg.evaluate(()=>getComputedStyle(document.querySelector('.grip-dots')).opacity!=='0'),
                                      'G4 grip dots are visible without hover (there is no hover on a phone)');

const cdp=await ctx.newCDPSession(pg);
const before=await order();
const p = await pg.evaluate(()=>{
  const g=document.querySelector('[data-grip="0"]').getBoundingClientRect();
  const t=document.querySelector('[data-steprow="2"]').getBoundingClientRect();
  return {x:g.x+g.width/2, y:g.y+g.height/2, ty:t.y+t.height*0.8};
});
const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,
  touchPoints: type==='touchEnd'?[]:[{x,y,radiusX:12,radiusY:12,force:1,id:1}]});
await touch('touchStart',p.x,p.y);
await pg.waitForTimeout(80);
await touch('touchMove',p.x,p.y+24);
await pg.waitForTimeout(80);
ck(await pg.evaluate(()=>!!document.querySelector('.steprow.dragging')), 'G5 a finger drag lifts the row');
await touch('touchMove',p.x,p.ty);
await pg.waitForTimeout(80);
ck(await pg.evaluate(()=>!!document.querySelector('.dropbefore,.droplast')), 'G6 insertion point shown under the finger');
await touch('touchEnd',p.x,p.ty);
await pg.waitForTimeout(450);
const after=await order();
ck(after[0]!==before[0],              'G7 the finger drag reordered the steps');
ck(after.slice().sort().join()===before.slice().sort().join(), 'G8 nothing lost');
ck(errs.length===0,                   'G9 no errors on a touch device');

await pg.screenshot({path:'shot-phone-steps.png'});
await b.close();
console.log(oks.map(o=>'  PASS  '+o).join('\n'));
if(fails.length) console.log('\n'+fails.map(f=>'  FAIL  '+f).join('\n'));
console.log(`\n${oks.length}/${oks.length+fails.length} passed`);
process.exit(fails.length?1:0);
