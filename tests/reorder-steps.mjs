import { chromium } from 'playwright';
const fails=[], oks=[]; const ck=(c,m)=>c?oks.push(m):fails.push(m);
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

async function editor(vp={width:390,height:844}, steps=['Heat the oven.','Season the chicken.','Roast for 90 minutes.','Rest before carving.']){
  const b=await chromium.launch({executablePath:CHROME});
  const pg=await b.newPage({viewport:vp});
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
  // Straight into the editor via the add sheet.
  await pg.evaluate(()=>document.querySelector('[data-tab="add"]').click());
  await pg.waitForTimeout(400);
  await pg.evaluate(()=>{const e=[...document.querySelectorAll('button,[role="button"]')].find(x=>/create a recipe/i.test(x.textContent||''));e&&e.click()});
  await pg.waitForTimeout(600);
  // Open the Method section, then fill the steps.
  await pg.evaluate(()=>{const e=[...document.querySelectorAll('button,[role="button"]')].find(x=>/^method$/i.test((x.textContent||'').trim()));e&&e.click()});
  await pg.waitForTimeout(400);
  for(let i=0;i<steps.length;i++){
    if(!await pg.evaluate(i=>!!document.querySelector('[data-fs="'+i+'"]'), i)){
      await pg.evaluate(()=>{const e=document.querySelector('[data-add-step]');e&&e.click()});
      await pg.waitForTimeout(250);
    }
    await pg.fill('[data-fs="'+i+'"]', steps[i]);
    await pg.waitForTimeout(80);
  }
  await pg.waitForTimeout(200);
  return {b,pg,errs};
}
const order = pg => pg.evaluate(()=>[...document.querySelectorAll('[data-fs]')].map(t=>t.value));
const nums  = pg => pg.evaluate(()=>[...document.querySelectorAll('.grip .num')].map(n=>n.textContent.trim()));

// ---- A. the handle exists, is labelled, and the list is intact ----
{
  const {b,pg,errs}=await editor();
  const o=await order(pg);
  ck(o.length===4,                                   `A1 four steps in the editor (${o.length})`);
  ck(await pg.evaluate(()=>!!document.getElementById('stepsList')), 'A2 steps are in a list container');
  ck(await pg.evaluate(()=>document.querySelectorAll('[data-grip]').length)===4, 'A3 every step has a handle');
  const label=await pg.evaluate(()=>document.querySelector('[data-grip="0"]').getAttribute('aria-label'));
  ck(/Step 1 of 4/.test(label) && /arrow keys/i.test(label), 'A4 handle announces position and how to move it');
  ck(/Drag a number to reorder/i.test(await pg.evaluate(()=>document.body.innerText)), 'A5 the affordance is explained in copy');
  ck((await nums(pg)).join()==='01,02,03,04',        'A6 numbers render in order');
  ck(errs.length===0,                                'A7 no page errors');
  await b.close();
}

// ---- B. keyboard reordering ----
{
  const {b,pg}=await editor();
  const before=await order(pg);
  await pg.evaluate(()=>document.querySelector('[data-grip="3"]').focus());
  await pg.keyboard.press('ArrowUp');
  await pg.waitForTimeout(300);
  let o=await order(pg);
  ck(o[2]===before[3] && o[3]===before[2],           'B1 ArrowUp moves a step up one place');
  ck((await nums(pg)).join()==='01,02,03,04',        'B2 numbers renumber after the move');
  ck(await pg.evaluate(()=>document.activeElement.dataset.grip)==='2',
                                                     'B3 focus follows the step, so ↑ can be pressed again');
  await pg.keyboard.press('ArrowUp');
  await pg.waitForTimeout(300);
  o=await order(pg);
  ck(o[1]===before[3],                               'B4 a second press keeps moving the same step');
  await pg.keyboard.press('ArrowDown');
  await pg.waitForTimeout(300);
  o=await order(pg);
  ck(o[2]===before[3],                               'B5 ArrowDown moves it back down');
  ck((await order(pg)).slice().sort().join()===before.slice().sort().join(),
                                                     'B6 no step was lost or duplicated');
  await b.close();
}

// ---- C. the ends don't wrap or crash ----
{
  const {b,pg,errs}=await editor();
  const before=await order(pg);
  await pg.evaluate(()=>document.querySelector('[data-grip="0"]').focus());
  await pg.keyboard.press('ArrowUp');
  await pg.waitForTimeout(250);
  ck((await order(pg)).join()===before.join(),       'C1 first step cannot move up (no wrap to the end)');
  await pg.evaluate(()=>document.querySelector('[data-grip="3"]').focus());
  await pg.keyboard.press('ArrowDown');
  await pg.waitForTimeout(250);
  ck((await order(pg)).join()===before.join(),       'C2 last step cannot move down');
  ck(errs.length===0,                                'C3 still no errors at the boundaries');
  await b.close();
}

// ---- D. pointer drag, which is the same primitive ----
{
  const {b,pg,errs}=await editor({width:1440,height:900});
  const before=await order(pg);
  const grip=await pg.evaluate(()=>{const r=document.querySelector('[data-grip="0"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}});
  const target=await pg.evaluate(()=>{const r=document.querySelector('[data-steprow="2"]').getBoundingClientRect();return {y:r.y+r.height*0.8}});
  await pg.mouse.move(grip.x, grip.y);
  await pg.mouse.down();
  await pg.mouse.move(grip.x, grip.y+20, {steps:4});
  const lifted=await pg.evaluate(()=>!!document.querySelector('.steprow.dragging'));
  ck(lifted,                                         'D1 the row lifts while dragging');
  await pg.mouse.move(grip.x, target.y, {steps:12});
  const marked=await pg.evaluate(()=>!!document.querySelector('.dropbefore,.droplast'));
  ck(marked,                                         'D2 an insertion point is shown before dropping');
  await pg.mouse.up();
  await pg.waitForTimeout(400);
  const after=await order(pg);
  ck(after[0]!==before[0],                           'D3 dragging the first step moved it');
  ck(after.indexOf(before[0])>=1,                    `D4 it landed further down (index ${after.indexOf(before[0])})`);
  ck(after.slice().sort().join()===before.slice().sort().join(), 'D5 drag lost nothing');
  ck(await pg.evaluate(()=>!document.querySelector('.steprow.dragging, .dropbefore, .droplast')),
                                                     'D6 drag styling cleaned up after drop');
  ck(errs.length===0,                                'D7 no errors during drag');
  await b.close();
}

// ---- E. a drag that goes nowhere must not reorder ----
{
  const {b,pg}=await editor({width:1440,height:900});
  const before=await order(pg);
  const grip=await pg.evaluate(()=>{const r=document.querySelector('[data-grip="1"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}});
  await pg.mouse.move(grip.x, grip.y);
  await pg.mouse.down();
  await pg.mouse.move(grip.x, grip.y+3, {steps:2});
  await pg.mouse.up();
  await pg.waitForTimeout(350);
  ck((await order(pg)).join()===before.join(),       'E1 a tap or 3px twitch on the handle leaves the order alone');
  await b.close();
}

// ---- F. reordering does not eat unsaved text ----
{
  const {b,pg}=await editor();
  await pg.fill('[data-fs="0"]','FIRST edited just now');
  await pg.evaluate(()=>document.querySelector('[data-grip="0"]').focus());
  await pg.keyboard.press('ArrowDown');
  await pg.waitForTimeout(350);
  const o=await order(pg);
  ck(o.includes('FIRST edited just now'),            'F1 text typed but never blurred survives a reorder');
  ck(o[1]==='FIRST edited just now',                 'F2 and it is in the new position');
  await b.close();
}

console.log(oks.map(o=>'  PASS  '+o).join('\n'));
if(fails.length) console.log('\n'+fails.map(f=>'  FAIL  '+f).join('\n'));
console.log(`\n${oks.length}/${oks.length+fails.length} passed`);
process.exit(fails.length?1:0);
