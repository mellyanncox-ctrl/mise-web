import { chromium } from 'playwright';
const fails=[], oks=[]; const ck=(c,m)=>c?oks.push(m):fails.push(m);
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const pg = await b.newPage();
await pg.route('**://**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
await pg.route('**esm.sh**', () => {});   // hang the CDN so the boot window stays open

// A fake Supabase that signs in anonymously only when released, so we control
// exactly when the state settles and can watch the card flip live.
await pg.addInitScript(() => {
  window.__release = null;
  const gate = new Promise(res => { window.__release = res; });
  window.__createClient = () => {
    const listeners = [];
    const user = { id: 'anon-test-user', email: '', is_anonymous: true };
    return {
      auth: {
        onAuthStateChange: (cb) => { listeners.push(cb); return { data:{ subscription:{ unsubscribe(){} } } }; },
        getSession: async () => ({ data: { session: null } }),
        signInAnonymously: async () => {
          await gate;
          const session = { user, access_token: 'fake' };
          listeners.forEach(cb => cb('SIGNED_IN', session));
          return { data: { session }, error: null };
        },
        updateUser: async () => ({ error: null }),
      },
      from: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }),
                                      eq(){ return this }, }),
                     upsert: async () => ({ error: null }) }),
      storage: { from: () => ({ createSignedUrl: async () => ({ data:null, error:{} }),
                                upload: async () => ({ error:null }) }) },
    };
  };
});

const url = 'file://' + process.cwd() + '/index.html';
await pg.goto(url);
await pg.waitForFunction(()=>/take me straight in/.test(document.body.innerText),{timeout:10000});
await pg.evaluate(()=>{const el=[...document.querySelectorAll('button,a,[role="button"]')].find(e=>/take me straight in/i.test(e.textContent||''));el&&el.click()});
await pg.waitForTimeout(250);
await pg.evaluate(()=>document.querySelector('button.tab[data-tab="profile"]').click());
await pg.waitForTimeout(150);

const before = await pg.evaluate(()=>document.body.innerText);
ck(/Checking your backup/.test(before),                    'sitting on Profile: shows checking');
ck(!/does not yet survive losing the phone/.test(before),  'sitting on Profile: no false verdict');

// Release the anonymous sign-in WITHOUT touching the page. The card must update
// itself — this is the regression that made the old bug invisible to tests.
await pg.evaluate(()=>window.__release());
await pg.waitForFunction(()=>/backed up quietly/.test(document.body.innerText),{timeout:8000})
  .then(()=>oks.push('card flips to "backed up quietly" with no interaction'))
  .catch(()=>fails.push('card flips to "backed up quietly" with no interaction'));

await pg.waitForTimeout(400);
const after = await pg.evaluate(()=>({t:document.body.innerText, dot:document.getElementById('syncdot')?.innerText}));
console.log('   [badge now: '+JSON.stringify(after.dot)+']');
ck(!/Saved on this device/.test(after.t),          'no contradictory device-only line once backed up');
ck(!/Checking/.test(after.t),                      'checking copy cleared');
/* The stubbed client returns immediately, so the badge can legitimately be
   caught mid-'Saving'. What matters is that it no longer claims device-only. */
ck(/^(Saving|Saved)$/.test((after.dot||'').trim()),'badge reports saving/saved, not device-only');
ck(/add an email and it follows you/i.test(after.t),'still invites the email upgrade');

await b.close();
console.log(oks.map(o=>'  PASS  '+o).join('\n'));
if(fails.length) console.log('\n'+fails.map(f=>'  FAIL  '+f).join('\n'));
console.log(`\n${oks.length}/${oks.length+fails.length} passed`);
process.exit(fails.length?1:0);
