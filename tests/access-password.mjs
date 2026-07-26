import { chromium } from 'playwright';
const fails=[], oks=[]; const ck=(c,m)=>c?oks.push(m):fails.push(m);
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const mkRecipe=(id,title)=>({id,title,description:'',image:'',gallery:[],
  groups:[{id:id+'-g',name:'',items:[]}],steps:[{id:id+'-s',text:'',time:0}],
  prep:'',cook:'',serves:'',difficulty:'',cuisine:'',mealTypes:[],methods:[],diets:[],
  source:'',author:'',url:'',platform:'',notes:'',subs:'',storage:'',reheat:'',freezer:'',
  nutrition:{cal:'',protein:'',carbs:'',fat:'',fibre:''},nutritionMode:'computed',
  tags:[],collections:[],rating:0,favourite:false,archived:false,
  added:'2026-07-26',lastCooked:'',cookCount:0,viewed:'',accent:'',
  origQty:null,incomplete:[],offline:false});

async function boot({emailTaken=false, rightPw='hunter2hunter2', remoteState=null}={}){
  const b=await chromium.launch({executablePath:CHROME});
  const pg=await b.newPage();
  await pg.route('**://**', r=>r.request().url().startsWith('file:')?r.continue():r.abort());
  await pg.addInitScript(({emailTaken,rightPw,remoteState})=>{
    window.__calls=[];
    const anon={id:'anon-1',email:'',is_anonymous:true};
    const real={id:'real-2',email:'mel@example.com',is_anonymous:false};
    window.__createClient=()=>{
      const ls=[]; let cur=null;
      return {
        auth:{
          onAuthStateChange:cb=>{ls.push(cb);return{data:{subscription:{unsubscribe(){}}}}},
          getSession:async()=>({data:{session:cur}}),
          signInAnonymously:async()=>{cur={user:anon,access_token:'a'};
            ls.forEach(cb=>cb('SIGNED_IN',cur));return{data:{session:cur},error:null}},
          updateUser:async(a)=>{ window.__calls.push(['updateUser',a]);
            if(emailTaken) return {data:{},error:{message:'A user with this email address has already been registered'}};
            cur={user:{...anon,email:a.email,is_anonymous:false},access_token:'a'};
            ls.forEach(cb=>cb('USER_UPDATED',cur));
            return {data:{user:cur.user},error:null}; },
          signInWithPassword:async(a)=>{ window.__calls.push(['signInWithPassword',a]);
            if(a.password!==rightPw) return {data:{},error:{message:'Invalid login credentials'}};
            cur={user:real,access_token:'r'}; ls.forEach(cb=>cb('SIGNED_IN',cur));
            return {data:{session:cur},error:null}; },
          signInWithOtp:async(a)=>{ window.__calls.push(['signInWithOtp',a]); return {data:{},error:null}; },
          verifyOtp:async(a)=>{ window.__calls.push(['verifyOtp',a]); return {data:{},error:null}; },
          signOut:async()=>({error:null}),
        },
        from:()=>({select:function(){return{maybeSingle:async()=>({data:remoteState?{state:remoteState,revision:3}:null,error:null})}},
                   upsert:async()=>({error:null})}),
        storage:{from:()=>({createSignedUrl:async()=>({data:null,error:{}}),upload:async()=>({error:null})})},
      };
    };
  },{emailTaken,rightPw,remoteState});
  await pg.goto('file://'+process.cwd()+'/index.html');
  await enter(pg);
  return {b,pg};
}
// Getting past the intro is fiddly for two reasons. `onboarded` is not part of
// the restored state slice, so the intro may or may not reappear after a reload.
// And since the desktop rail change, the tab elements exist in the DOM on EVERY
// route — so "a profile tab exists" no longer means "we are in the app", and any
// check written that way silently skips the intro and then fails downstream.
// Poll for the intro copy instead, and only give up after it has had time to show.
async function enter(pg){
  for(let i=0;i<20;i++){
    if(await pg.evaluate(()=>/take me straight in/.test(document.body.innerText))){
      await pg.evaluate(()=>{const e=[...document.querySelectorAll('button,a,[role="button"]')].find(x=>/take me straight in/i.test(x.textContent||''));e&&e.click()});
      await pg.waitForTimeout(450);
      return;
    }
    if(await pg.evaluate(()=>/YOUR LIBRARY|Your recipes|recipes\./i.test(document.body.innerText))) return;
    await pg.waitForTimeout(200);
  }
}

async function toAccess(pg){
  await pg.evaluate(()=>document.querySelector('button.tab[data-tab="profile"]').click());
  await pg.waitForTimeout(250);
  await pg.evaluate(()=>{const e=document.querySelector('[data-go="signin"]');e&&e.click()});
  await pg.waitForTimeout(300);
}
const txt = pg => pg.evaluate(()=>document.body.innerText);

// ---- A. screen shape and the honesty of it ----
{
  const {b,pg}=await boot(); await toAccess(pg);
  const t=await txt(pg);
  ck(/Save access/i.test(t),                     'A1 CTA reads "Save access"');
  ck(/Email again/i.test(t),                     'A2 asks for the email twice (it is unverified)');
  ck(/no reset email yet/i.test(t),              'A3 states plainly that there is no password reset');
  ck(!/link/i.test(t),                           'A4 no mention of a link');
  ck(!/six digits|code/i.test(t),                'A5 no leftover code copy');
  ck(await pg.evaluate(()=>document.querySelector('[data-auth="pw"]').type)==='password',
                                                 'A6 password field is masked by default');
  ck(await pg.evaluate(()=>document.querySelector('[data-auth="pw"]').autocomplete)==='new-password',
                                                 'A7 autocomplete=new-password so the keychain offers to generate one');
  await pg.evaluate(()=>document.querySelector('[data-reveal]').click());
  await pg.waitForTimeout(150);
  ck(await pg.evaluate(()=>document.querySelector('[data-auth="pw"]').type)==='text',
                                                 'A8 "Show password" reveals it (no reset = must be able to check it)');
  await b.close();
}

// ---- B. validation refuses the silent-failure cases ----
{
  const {b,pg}=await boot(); await toAccess(pg);
  const submit=async(e,e2,pw)=>{
    await pg.fill('[data-auth="email"]',e); await pg.fill('[data-auth="email2"]',e2); await pg.fill('[data-auth="pw"]',pw);
    await pg.evaluate(()=>document.querySelector('[data-signin]').click()); await pg.waitForTimeout(250);
    return pg.evaluate(()=>window.__calls.length);
  };
  ck(await submit('notanemail','notanemail','hunter2hunter2')===0,  'B1 malformed email never reaches the server');
  ck(/doesn’t look right/i.test(await txt(pg)),                     'B2 and says why');
  ck(await submit('mel@example.com','mel@exampel.com','hunter2hunter2')===0,
                                                                   'B3 mismatched emails blocked (the typo that breaks recovery)');
  ck(/don’t match/i.test(await txt(pg)),                            'B4 and says why');
  ck(await submit('mel@example.com','mel@example.com','short')===0, 'B5 short password blocked');
  ck(/8 characters/i.test(await txt(pg)),                           'B6 and says the minimum');
  await b.close();
}

// ---- C. happy path: attaches to the SAME account, sends nothing ----
{
  const {b,pg}=await boot(); await toAccess(pg);
  await pg.fill('[data-auth="email"]','mel@example.com');
  await pg.fill('[data-auth="email2"]','mel@example.com');
  await pg.fill('[data-auth="pw"]','hunter2hunter2');
  await pg.evaluate(()=>document.querySelector('[data-signin]').click());
  await pg.waitForTimeout(800);
  const calls=await pg.evaluate(()=>window.__calls);
  const up=calls.find(c=>c[0]==='updateUser');
  ck(!!up,                                                  'C1 updateUser called (same account, library does not move)');
  ck(up && up[1].email==='mel@example.com' && up[1].password==='hunter2hunter2',
                                                            'C2 both email and password sent together');
  ck(!calls.some(c=>c[0]==='signInWithOtp'||c[0]==='verifyOtp'),
                                                            'C3 no OTP / no email send path touched');
  ck(!calls.some(c=>c[0]==='signInWithPassword'),            'C4 no needless sign-in when the claim succeeded');
  ck(!JSON.stringify(calls).includes('emailRedirectTo'),     'C5 nothing invites a browser hand-off');
  const t=await txt(pg);
  ck(/YOUR LIBRARY|Your recipes/i.test(t),                   'C6 lands back in the cookbook');
  await pg.evaluate(()=>document.querySelector('button.tab[data-tab="profile"]').click());
  await pg.waitForTimeout(300);
  const pt=await txt(pg);
  ck(/mel@example\.com/i.test(pt),                           'C7 Profile now shows the email');
  ck(/sign out/i.test(pt),                                   'C8 Sign out appears only now that an account is reachable');
  await b.close();
}

// ---- D. second device: address already taken -> sign in instead ----
{
  const {b,pg}=await boot({emailTaken:true}); await toAccess(pg);
  await pg.fill('[data-auth="email"]','mel@example.com');
  await pg.fill('[data-auth="email2"]','mel@example.com');
  await pg.fill('[data-auth="pw"]','wrongwrongwrong');
  await pg.evaluate(()=>document.querySelector('[data-signin]').click());
  await pg.waitForTimeout(700);
  ck(/password does not match/i.test(await txt(pg)),          'D1 taken email + wrong password: says exactly that');
  ck(await pg.evaluate(()=>!!document.querySelector('[data-auth="email"]')),
                                                             'D2 stays on the screen so she can retry');
  await pg.fill('[data-auth="pw"]','hunter2hunter2');
  await pg.evaluate(()=>document.querySelector('[data-signin]').click());
  await pg.waitForTimeout(800);
  const calls=await pg.evaluate(()=>window.__calls);
  ck(calls.some(c=>c[0]==='signInWithPassword'),              'D3 falls back to sign-in automatically');
  ck(/YOUR LIBRARY|Your recipes/i.test(await txt(pg)),        'D4 signed in and back in the cookbook');
  await b.close();
}

// ---- E. the merge guard still holds on a device with its own recipes ----
{
  const {b,pg}=await boot({emailTaken:true, remoteState:{recipes:[mkRecipe('r-remote','Remote dish')],drafts:[],collections:[]}});
  await pg.evaluate(async rec=>{
    const db=await new Promise(r=>{const q=indexedDB.open('mise-local');q.onsuccess=()=>r(q.result)});
    const cur=await new Promise(r=>{const q=db.transaction('state','readonly').objectStore('state').get('state');q.onsuccess=()=>r(q.result||{})});
    cur.recipes=[rec];
    await new Promise(r=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(cur,'state');tx.oncomplete=r});
  }, mkRecipe('r-local','Local dish'));
  await pg.reload(); await pg.waitForTimeout(600); await enter(pg);
  ck(/Local dish/.test(await txt(pg)),                        'E1 device recipe restored');
  await toAccess(pg);
  await pg.fill('[data-auth="email"]','mel@example.com');
  const has2=await pg.evaluate(()=>!!document.querySelector('[data-auth="email2"]'));
  if(has2) await pg.fill('[data-auth="email2"]','mel@example.com');
  await pg.fill('[data-auth="pw"]','hunter2hunter2');
  await pg.evaluate(()=>document.querySelector('[data-signin]').click());
  await pg.waitForTimeout(1100);
  ck(/recipes here and in your account|Keep both/i.test(await txt(pg)),
     'E2 asks before merging — never silently discards either side');
  await pg.evaluate(()=>{const e=[...document.querySelectorAll('button')].find(x=>/keep both/i.test(x.textContent||''));e&&e.click()});
  await pg.waitForTimeout(800);
  const m=await txt(pg);
  ck(/Local dish/.test(m)&&/Remote dish/.test(m),             'E3 "Keep both" keeps both');
  await b.close();
}

console.log(oks.map(o=>'  PASS  '+o).join('\n'));
if(fails.length) console.log('\n'+fails.map(f=>'  FAIL  '+f).join('\n'));
console.log(`\n${oks.length}/${oks.length+fails.length} passed`);
process.exit(fails.length?1:0);
