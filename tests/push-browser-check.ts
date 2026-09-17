/** Browser verification with actual API/PostgreSQL. Push enrollment/transport are test doubles. */
import {chromium,expect} from '@playwright/test';
import {createServer} from 'vite';
import {createECDH,randomBytes,createHash,randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import webpush from 'web-push';
import {createApp} from '../backend/src/app';
import {PushStore} from '../backend/src/push/store';
import {deliverNext} from '../backend/src/push/worker';
import {startFixture,fixtureKey,USER1,USER2,BOOK} from './fixture';
import {installPushSchema,pushPool} from './push-fixture';
const fixture=await startFixture(54329);await installPushSchema(fixture.db);const store=new PushStore(pushPool(fixture.db));
const keys=webpush.generateVAPIDKeys(),keyId=createHash('sha256').update(keys.publicKey).digest('hex');
const curve=createECDH('prime256v1');curve.generateKeys();const subscriptionKeys={p256dh:curve.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')};
await store.subscribe(USER2,BOOK,{endpoint:'https://fcm.googleapis.com/fcm/send/partner-device',keys:subscriptionKeys},keyId);
const apiServer=await new Promise<any>(done=>{const server=createApp({supabaseUrl:fixture.url,supabaseKey:fixtureKey,origins:['http://127.0.0.1:5173/'],trustProxy:0,push:{store,publicKey:keys.publicKey,keyId}}).listen(3001,'127.0.0.1',()=>done(server));});
process.env.VITE_SUPABASE_URL=fixture.url;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=fixtureKey;process.env.VITE_API_URL='http://127.0.0.1:3001/api/';
const vite=await createServer({root:resolve('frontend'),server:{host:'127.0.0.1',port:5173,strictPort:true}});await vite.listen();
const browser=await chromium.launch({...(process.env.TEST_CHROMIUM_PATH?{executablePath:process.env.TEST_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.grantPermissions(['notifications']);
// Raw browser source avoids tsx's function-name helpers leaking into the page.
await context.addInitScript({content:`
 const subscriptionKeys=${JSON.stringify(subscriptionKeys)};
 let current=null,serial=0;
 window.__pushGesture=false;
 window.__pushPermission='default';
 Object.defineProperty(Notification,'permission',{get:()=>window.__pushPermission});
 Object.defineProperty(Notification,'requestPermission',{value:()=>{window.__pushGesture=navigator.userActivation.isActive;window.__pushPermission='granted';return Promise.resolve('granted');}});
 PushManager.prototype.getSubscription=async()=>current;
 PushManager.prototype.subscribe=async function(options){
  const endpoint='https://fcm.googleapis.com/fcm/send/browser-device-'+(++serial);
  current={endpoint,options:{applicationServerKey:options?.applicationServerKey},expirationTime:null,getKey:()=>null,unsubscribe:async()=>{current=null;return true;},toJSON:()=>({endpoint,expirationTime:null,keys:subscriptionKeys})};return current;
 };
`});
const page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
const check=(message:string)=>console.log('PASS:',message);
try{
 await page.goto('http://127.0.0.1:5173');await page.getByLabel('Your email').fill('ivan@test.local');await page.getByLabel('Password',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Open our scrapbook'}).click();
 const heart=page.getByRole('button',{name:'Send I miss you to my partner'});await expect(heart).toBeEnabled({timeout:20000});expect(errors).toEqual([]);check('Login works with normalized /api URL and trailing-slash origin');
 await page.getByRole('button',{name:'Enable notifications',exact:true}).click();await expect(page.getByText('Notifications enabled on this device.',{exact:true})).toBeVisible({timeout:20000});expect(await page.evaluate(()=>(window as any).__pushGesture)).toBe(true);check('Permission requested from user gesture; subscription persisted to authenticated backend');
 expect((await store.state(USER1,BOOK)).deviceCount).toBe(1);
 await heart.click();await expect(heart).toBeDisabled();await expect(page.locator('#heart-status')).toContainText('queued');check('3D button saves and queues a heart; cooldown disables repeated taps');
 await deliverNext(store,async()=>({statusCode:201}),keyId);
 await store.sendHeart(USER2,BOOK,randomUUID(),keyId);
 await page.evaluate(()=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'ivraine-heart'}})));
 await expect(page.locator('#heart-received')).toContainText('Loraine sent you a heart');await expect(page.locator('#heart-status')).toContainText('accepted');check('Incoming heart appears in-app; provider acceptance is labeled accurately');
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/push-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/push-mobile.png',fullPage:true});check('Mobile 3D card has no horizontal overflow');
 await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.heart-gem').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');check('Reduced-motion preference disables heart animation');
 await page.getByRole('button',{name:'Turn off on this device'}).click();await expect(page.getByRole('button',{name:'Enable notifications',exact:true})).toBeVisible();expect((await store.state(USER1,BOOK)).deviceCount).toBe(0);check('Unsubscribe removes own server record and local subscription');
 await page.getByRole('button',{name:'Lock',exact:true}).click();await page.getByLabel('Your email').fill('loraine@test.local');await page.getByLabel('Password',{exact:true}).fill('test-password-123');await page.getByRole('button',{name:'Open our scrapbook'}).click();await expect(page.locator('#heart-received')).toContainText('Ivan sent you a heart',{timeout:20000});check('Second account can read the heart addressed to it');
 expect(errors).toEqual([]);check('No browser runtime errors');
}catch(error){console.error(await page.locator('body').innerText());await page.screenshot({path:'test-results/push-failure.png',fullPage:true});throw error;}
finally{await browser.close();await vite.close();await new Promise<void>(done=>apiServer.close(()=>done()));await fixture.close();}
