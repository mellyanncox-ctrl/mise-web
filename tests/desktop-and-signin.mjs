import { chromium } from 'playwright';
const fails=[], oks=[]; const ck=(c,m)=>c?oks.push(m):fails.push(m);
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const DESK={width:1440,height:900}, PHONE={width:390,height:844};

async function open(vp){
  const b=await chromium.launch({executablePath:CHROME});
  const pg=await b.newPage({viewport:vp});
  await pg.route('**://**', r=>r.request().url().startsWith('file:')?r.continue():r.abort());
  await pg.goto('file://'+process.cwd()+'/index.html');
  await pg.waitForFunction(()=>/take me straight in/.test(document.body.innerText),{timeout:10000});
  return {b,pg};
}
const box = (pg,sel)=>pg.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}},sel);

// ---- A. sign-in is reachable from a browser that has never run the app ----
{
  const {b,pg}=await open(DESK);
  const t=await pg.evaluate(()=>document.body.innerText);
  ck(/Already have a cookbook\? Sign in/i.test(t), 'A1 intro offers a sign-in route');
  await pg.evaluate(()=>document.querySelector('[data-go="signin"]').click());
  await pg.waitForTimeout(400);
  const s=await pg.evaluate(()=>document.body.innerText);
  ck(/Welcome back/i.test(s),                      'A2 it opens in SIGN IN mode, not setup');
  ck(/Sign in/i.test(s) && !/Save access/i.test(s),'A3 button says Sign in');
  ck(!/Email again/i.test(s),                      'A4 no confirm-email field when signing in');
  ck(!/no reset email yet/i.test(s),               'A5 no setup-only warning');
  ck(await pg.evaluate(()=>document.querySelector('[data-auth="pw"]').autocomplete)==='current-password',
                                                   'A6 autocomplete=current-password so the keychain fills it');
  // and the switch back works
  await pg.evaluate(()=>{const e=[...document.querySelectorAll('button')].find(x=>/haven’t set this up yet/i.test(x.textContent||''));e&&e.click()});
  await pg.waitForTimeout(350);
  const u=await pg.evaluate(()=>document.body.innerText);
  ck(/Save access/i.test(u) && /Email again/i.test(u), 'A7 one tap switches to setup mode');
  await b.close();
}

// ---- B. desktop uses the window ----
{
  const {b,pg}=await open(DESK);
  await pg.evaluate(()=>{const e=[...document.querySelectorAll('button,a')].find(x=>/take me straight in/i.test(x.textContent||''));e&&e.click()});
  await pg.waitForTimeout(500);
  const dev=await box(pg,'#device'), bar=await box(pg,'#tabbar'), view=await box(pg,'#view');
  ck(dev.w>=1400,                                  `B1 app fills the window (${dev.w}px, was capped at 402)`);
  ck(bar.h>400 && bar.w<300,                       `B2 tab bar became a left rail (${bar.w}x${bar.h})`);
  ck(bar.x<40,                                     'B3 the rail is on the left');
  ck(view.x>bar.x,                                 'B4 content sits beside the rail, not under it');
  ck(await pg.evaluate(()=>getComputedStyle(document.querySelector('#statusbar')).display)==='none',
                                                   'B5 the fake phone clock is gone');
  const screen=await box(pg,'.screen');
  ck(screen.w<=1100,                               `B6 reading column still capped (${screen.w}px, not 1400)`);
  ck(await pg.evaluate(()=>{const t=document.querySelector('.tab-space');return !t||getComputedStyle(t).display==='none'}),
                                                   'B7 no dead space reserved for a bottom bar');
  await b.close();
}

// ---- C. the phone is untouched ----
{
  const {b,pg}=await open(PHONE);
  await pg.evaluate(()=>{const e=[...document.querySelectorAll('button,a')].find(x=>/take me straight in/i.test(x.textContent||''));e&&e.click()});
  await pg.waitForTimeout(500);
  const dev=await box(pg,'#device'), bar=await box(pg,'#tabbar');
  ck(dev.w<=400,                                   `C1 phone still full-bleed at its own width (${dev.w}px)`);
  ck(bar.h<110 && bar.w>=380,                      `C2 tab bar is still a bottom bar (${bar.w}x${bar.h})`);
  ck(bar.y>600,                                    'C3 and still at the bottom');
  const tabs=await pg.evaluate(()=>[...document.querySelectorAll('.tab')].map(t=>Math.round(t.getBoundingClientRect().y)));
  ck(new Set(tabs).size===1,                       'C4 tabs still sit on one row');
  await b.close();
}

// ---- D. a recipe reads as two columns on desktop, one on a phone ----
{
  const rec=id=>({id,title:'Roast chicken',description:'',image:'',gallery:[],
    groups:[{id:'g',name:'',items:[{id:'i1',qty:'1',unit:'',name:'chicken',note:'',have:false,sub:'',nut:null},
                                   {id:'i2',qty:'2',unit:'tbsp',name:'olive oil',note:'',have:false,sub:'',nut:null}]}],
    steps:[{id:'s1',text:'Heat the oven to 200C.',time:0},{id:'s2',text:'Roast for 90 minutes.',time:90}],
    prep:'10',cook:'90',serves:'4',difficulty:'',cuisine:'',mealTypes:[],methods:[],diets:[],
    source:'',author:'',url:'',platform:'',notes:'',subs:'',storage:'',reheat:'',freezer:'',
    nutrition:{cal:'',protein:'',carbs:'',fat:'',fibre:''},nutritionMode:'computed',
    tags:[],collections:[],rating:0,favourite:false,archived:false,
    added:'2026-07-26',lastCooked:'',cookCount:0,viewed:'',accent:'',origQty:null,incomplete:[],offline:false});

  for(const [vp,label,expectPair] of [[DESK,'desktop',true],[PHONE,'phone',false]]){
    const {b,pg}=await open(vp);
    await pg.evaluate(()=>{const e=[...document.querySelectorAll('button,a')].find(x=>/take me straight in/i.test(x.textContent||''));e&&e.click()});
    await pg.waitForTimeout(400);
    await pg.evaluate(async r=>{
      const db=await new Promise(res=>{const q=indexedDB.open('mise-local');q.onsuccess=()=>res(q.result)});
      const cur=await new Promise(res=>{const q=db.transaction('state','readonly').objectStore('state').get('state');q.onsuccess=()=>res(q.result||{})});
      cur.recipes=[r];
      await new Promise(res=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(cur,'state');tx.oncomplete=res});
    }, rec('r1'));
    await pg.reload();
    await pg.waitForTimeout(700);
    if(await pg.evaluate(()=>/take me straight in/.test(document.body.innerText))){
      await pg.evaluate(()=>{const e=[...document.querySelectorAll('button,a')].find(x=>/take me straight in/i.test(x.textContent||''));e&&e.click()});
      await pg.waitForTimeout(500);
    }
    await pg.evaluate(()=>{const e=document.querySelector('[data-recipe]');e&&e.click()});
    await pg.waitForTimeout(600);
    const ing=await box(pg,'#ings'), meth=await pg.evaluate(()=>{
      const e=document.querySelector('#ings')&&document.querySelector('#ings').nextElementSibling;
      if(!e) return null; const r=e.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y)};
    });
    const sideBySide = ing && meth && meth.x > ing.x + 100 && Math.abs(meth.y-ing.y) < 60;
    ck(!!ing,                                      `D-${label} recipe screen opened`);
    ck(sideBySide === expectPair,
       expectPair ? 'D-desktop ingredients and method sit side by side'
                  : 'D-phone they still stack, unchanged');
    await b.close();
  }
}

console.log(oks.map(o=>'  PASS  '+o).join('\n'));
if(fails.length) console.log('\n'+fails.map(f=>'  FAIL  '+f).join('\n'));
console.log(`\n${oks.length}/${oks.length+fails.length} passed`);
process.exit(fails.length?1:0);
