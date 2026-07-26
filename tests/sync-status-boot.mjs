import { chromium } from 'playwright';
const fails=[], oks=[];
const ck=(c,m)=>c?oks.push(m):fails.push(m);
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch({executablePath:CHROME});
const pg = await b.newPage();
// Hang the supabase CDN rather than failing it fast. That is the real-world
// slow-network case, and the only way to hold the boot window open long enough
// to assert on it — a hard abort settles in milliseconds.
await pg.route('**://**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
await pg.route('**esm.sh**', () => {});   // registered last => highest precedence in Playwright

const url = 'file://' + process.cwd() + '/index.html';
// Skip the intro to land in the library, exactly as a returning device would.
await pg.goto(url);
await pg.waitForFunction(() => /take me straight in/.test(document.body.innerText), {timeout:10000});
await pg.evaluate(() => {
  const el=[...document.querySelectorAll('button,a,[role="button"]')].find(e=>/take me straight in/i.test(e.textContent||''));
  el && el.click();
});
await pg.waitForTimeout(300);

await pg.waitForFunction(() => !!document.querySelector('button.tab[data-tab="profile"]'), {timeout:10000});
await pg.evaluate(() => document.querySelector('button.tab[data-tab="profile"]').click());
await pg.waitForTimeout(120);

const early = await pg.evaluate(() => ({ text: document.body.innerText,
  hasBtn: !!document.querySelector('[data-go="signin"]') }));
ck(/Checking your backup/.test(early.text),                     'boot badge reads "Checking your backup"');
ck(/Checking whether it is backed up too/.test(early.text),     'boot card says checking, not a verdict');
ck(!/does not yet survive losing the phone/.test(early.text),   'boot card does NOT assert the phone-loss risk');
ck(early.hasBtn === false,                                      'no "Add an email" CTA while unknown');

// Let it settle. No network, so this is the honest device-only outcome.
let settled = true;
await pg.waitForFunction(() => !/Checking whether it is backed up too/.test(document.body.innerText),
  {timeout:15000}).catch(()=>{settled=false});
ck(settled, 'unknown state always exits (watchdog fires even with no network)');

const late = await pg.evaluate(() => ({ text: document.body.innerText,
  hasBtn: !!document.querySelector('[data-go="signin"]') }));
ck(/does not yet survive losing the phone|Offline/.test(late.text), 'settled card gives the real verdict');
ck(late.hasBtn === true,                                           '"Add an email" CTA appears once settled');
ck(!/Checking your backup/.test(late.text),                        'no lingering checking badge');
ck(!/undefined|NaN|\[object|\$\{/.test(late.text),                 'no template leakage on profile');

// Regression: the screen still renders its substance.
ck(/RECIPES/.test(late.text) && /Export everything/.test(late.text), 'profile screen otherwise intact');

await b.close();
console.log(oks.map(o=>'  PASS  '+o).join('\n'));
if(fails.length) console.log('\n'+fails.map(f=>'  FAIL  '+f).join('\n'));
console.log(`\n${oks.length}/${oks.length+fails.length} passed`);
process.exit(fails.length?1:0);
