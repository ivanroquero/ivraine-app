import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import webpush from 'web-push';
import {createECDH,randomBytes} from 'node:crypto';
test('service worker always displays generic push and opens only the scrapbook origin',async()=>{
 const handlers=new Map<string,(event:any)=>void>();const shown:any[]=[],opened:string[]=[],focused:string[]=[],messages:any[]=[];
 const client={url:'https://ivraine.example/',navigate:async(url:string)=>{opened.push(url);},focus:async()=>{focused.push('focused');},postMessage:(value:any)=>messages.push(value)};
 vm.runInNewContext(await readFile(new URL('../frontend/public/sw.js',import.meta.url),'utf8'),{URL,self:{location:{origin:'https://ivraine.example'},addEventListener:(name:string,handler:any)=>handlers.set(name,handler),registration:{showNotification:async(title:string,options:any)=>shown.push({title,...options})},clients:{matchAll:async()=>[client],openWindow:async(url:string)=>opened.push(url)}}});
 let waiting:Promise<any>=Promise.resolve();handlers.get('push')!({data:{json:()=>({eventId:'heart-1',url:'https://evil.example/',body:'private message'})},waitUntil:(p:Promise<any>)=>{waiting=p;}});await waiting;
 assert.equal(shown.length,1);assert.equal(shown[0].tag,'ivraine-heart-heart-1');assert(!shown[0].body.includes('private message'));assert.equal(messages[0].type,'ivraine-heart');
 assert.equal(shown[0].badge,'/icons/couple-32.png');assert.equal(shown[0].icon,'/icons/couple-192.png');assert.equal(shown[0].renotify,true);assert.equal(typeof shown[0].timestamp,'number');assert.equal(shown[0].vibrate.join(','),'120,60,120');
 assert.equal(shown[0].actions.map((action:any)=>action.action).join(','),'open,heart-back');assert.equal(shown[0].data.url,'/#story');
 handlers.get('push')!({data:{json:()=>({type:'test',eventId:'device-test'})},waitUntil:(p:Promise<any>)=>{waiting=p;}});await waiting;
 assert.match(shown[1].body,/Notifications are connected/);assert.equal(shown[1].tag,'ivraine-heart-device-test');assert.equal(shown[1].actions.map((action:any)=>action.action).join(','),'open');
 let closed=false;handlers.get('notificationclick')!({notification:{data:{url:'https://evil.example/'},close:()=>{closed=true;}},waitUntil:(p:Promise<any>)=>{waiting=p;}});await waiting;assert(closed);assert.deepEqual(opened,['https://ivraine.example/#story']);assert.equal(focused.length,1);
});
test('web-push encrypts a standards-based payload with a real generated VAPID pair',()=>{
 const vapid=webpush.generateVAPIDKeys(),curve=createECDH('prime256v1');curve.generateKeys();
 const request=webpush.generateRequestDetails({endpoint:'https://web.push.apple.com/test',keys:{p256dh:curve.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}},'test encrypted message',{vapidDetails:{subject:'mailto:test@example.com',publicKey:vapid.publicKey,privateKey:vapid.privateKey},TTL:3600});
 assert(request.body instanceof Buffer);assert(!request.body.toString().includes('test encrypted message'));assert.equal(request.headers['Content-Encoding'],'aes128gcm');assert(request.headers.Authorization);
});
test('service worker keeps the push key and re-subscribes when the push service rotates the endpoint',async()=>{
 const handlers=new Map<string,(event:any)=>void>();const stored=new Map<string,string>(),messages:any[]=[];
 const cache={put:async(key:string,response:any)=>{stored.set(String(key),await response.text());},match:async(key:string)=>{const value=stored.get(String(key));return value===undefined?undefined:{text:async()=>value};}};
 const subscription={options:{},toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/rotated',expirationTime:null,keys:{p256dh:'a',auth:'b'}})};
 const self={location:{origin:'https://ivraine.example'},navigator:{setAppBadge:async()=>undefined},addEventListener:(name:string,handler:any)=>handlers.set(name,handler),registration:{pushManager:{subscribe:async(options:any)=>({...subscription,options})}},clients:{matchAll:async()=>[{url:'https://ivraine.example/',postMessage:(value:any)=>messages.push(value)}]}};
 vm.runInNewContext(await readFile(new URL('../frontend/public/sw.js',import.meta.url),'utf8'),{URL,atob,Response:class{constructor(private readonly value:string){}async text(){return this.value;}},caches:{open:async()=>cache},self});
 let waiting:Promise<any>=Promise.resolve();
 handlers.get('message')!({data:{type:'ivraine-push-key',publicKey:'BPk1'},waitUntil:(p:Promise<any>)=>{waiting=p;}});await waiting;
 assert.equal(stored.get('/ivraine-push-key'),'BPk1');
 handlers.get('pushsubscriptionchange')!({waitUntil:(p:Promise<any>)=>{waiting=p;}});await waiting;
 assert.equal(messages.at(-1).type,'ivraine-resubscribed');assert.equal(messages.at(-1).subscription.endpoint,'https://fcm.googleapis.com/fcm/send/rotated');
});
