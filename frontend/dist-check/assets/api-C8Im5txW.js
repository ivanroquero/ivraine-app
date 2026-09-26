(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=0,t=null,n=[`Nice try! 😜`,`You can't click No! 😉`,`Nope, you're stuck with me! 🥰`,`Button ran away! 🏃‍♀️💨`,`There is only one right answer! 💕`,`Try clicking Yes instead! 💖`,`Error 404: No not found! 🤭`,`Destiny says YES! ✨`,`My heart won't let you! 💘`];async function r(e,t){try{let n=await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e}&lon=${t}&zoom=18&addressdetails=1`,{headers:{"Accept-Language":`en`},signal:AbortSignal.timeout(4e3)});if(n.ok){let e=await n.json(),t=e.address||{},r=t.city||t.town||t.municipality||t.village||t.suburb||t.state||``,i=t.country||``;return{fullAddress:e.display_name||`${r}, ${i}`,city:r,country:i}}}catch{}return{fullAddress:`${e.toFixed(4)}, ${t.toFixed(4)}`,city:``,country:``}}function i(e,t,n=``,r=``,i=0,a){try{let o={section:e,action:t,details:n,user:r,dodgeCount:i,latitude:a?.latitude,longitude:a?.longitude,fullAddress:a?.fullAddress,city:a?.city,country:a?.country};fetch(`/api/track`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(o),keepalive:!0}).catch(()=>{});try{new BroadcastChannel(`ivraine_admin_channel`).postMessage({type:`LOG_ADDED`,entry:{id:String(Date.now()),ip:`Client`,section:e,action:t,details:n,user:r,userAgent:navigator.userAgent,dodgeCount:i,latitude:a?.latitude??null,longitude:a?.longitude??null,fullAddress:a?.fullAddress??``,city:a?.city??``,country:a?.country??``,timestamp:new Date().toISOString()}})}catch{}}catch{}}async function a(e,t=`Visitor`){return navigator.geolocation?new Promise(n=>{navigator.geolocation.getCurrentPosition(async a=>{let{latitude:o,longitude:s}=a.coords,c=await r(o,s),l={latitude:o,longitude:s,fullAddress:c.fullAddress,city:c.city,country:c.country};try{localStorage.setItem(`ivraine_last_location`,JSON.stringify(l))}catch{}i(e,`Shared Location`,`Address: ${l.fullAddress}`,t,0,l);try{await fetch(`/api/date-location`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({latitude:o,longitude:s,user:t,source:e}),keepalive:!0})}catch{}n(l)},()=>n(null),{enableHighAccuracy:!0,timeout:1e4,maximumAge:3e4})}):null}async function o(e,t=`Visitor`){let n=!1,r=!1;try{navigator.permissions&&(n=(await navigator.permissions.query({name:`geolocation`})).state===`granted`)}catch{}try{`Notification`in window&&(r=Notification.permission===`granted`)}catch{}n&&a(e,t);let i=localStorage.getItem(`ivraine_perm_prompt_dismissed`);i&&Date.now()-Number(i)<864e5||(!n||!r&&`Notification`in window)&&setTimeout(()=>{if(document.querySelector(`.ivraine-perm-overlay`))return;let n=document.createElement(`div`);n.className=`ivraine-perm-overlay`,n.innerHTML=`
      <div class="ivraine-perm-card">
        <div class="ivraine-perm-icon">📍✨</div>
        <h3 class="ivraine-perm-title">Welcome to Our Space ♡</h3>
        <p class="ivraine-perm-desc">
          To unlock the interactive visitor map and stay connected with real-time heart notifications, please enable permissions:
        </p>
        <div class="ivraine-perm-features">
          <div class="ivraine-perm-feature-item">
            <span class="icon">🗺</span>
            <span><strong>Live Map Pin</strong> — Pin your spot on our memories journey map</span>
          </div>
          <div class="ivraine-perm-feature-item">
            <span class="icon">🔔</span>
            <span><strong>Heart Notifications</strong> — Instant alerts whenever Ivan or Loraine taps a heart</span>
          </div>
        </div>
        <button class="ivraine-perm-btn-allow" type="button">
          <span>Allow Permissions</span>
          <span>♡</span>
        </button>
        <button class="ivraine-perm-btn-dismiss" type="button">Maybe Later</button>
      </div>
    `,document.body.appendChild(n);let r=n.querySelector(`.ivraine-perm-btn-allow`),i=n.querySelector(`.ivraine-perm-btn-dismiss`);r.addEventListener(`click`,async()=>{r.disabled=!0,r.textContent=`Enabling…`;try{`Notification`in window&&Notification.permission!==`granted`&&await Notification.requestPermission()}catch{}try{await a(e,t)}catch{}n.remove()}),i.addEventListener(`click`,()=>{localStorage.setItem(`ivraine_perm_prompt_dismissed`,String(Date.now())),n.remove()})},1200)}function s(){let e=document.getElementById(`ivraine-confetti-canvas`);e||(e=document.createElement(`canvas`),e.id=`ivraine-confetti-canvas`,document.body.appendChild(e));let t=e.getContext(`2d`);if(!t)return;let n=e.width=window.innerWidth,r=e.height=window.innerHeight,i=()=>{e&&(n=e.width=window.innerWidth,r=e.height=window.innerHeight)};window.addEventListener(`resize`,i);let a=[],o=[`#e83e8c`,`#ff6b81`,`#ff758c`,`#ffd166`,`#a29bfe`,`#ff9ff3`],s=[`❤️`,`💖`,`💕`,`✨`,`🌸`];for(let e=0;e<90;e++)a.push({x:n/2+(Math.random()-.5)*100,y:r/2+(Math.random()-.5)*60,vx:(Math.random()-.5)*16,vy:-Math.random()*14-4,size:Math.random()*16+10,color:o[Math.floor(Math.random()*o.length)],emoji:Math.random()>.4?s[Math.floor(Math.random()*s.length)]:null,rotation:Math.random()*360,rotationSpeed:(Math.random()-.5)*10,gravity:.35,opacity:1});let c,l=Date.now();function u(){if(!t||!e)return;t.clearRect(0,0,n,r);let o=!1;for(let e of a)e.x+=e.vx,e.y+=e.vy,e.vy+=e.gravity,e.rotation+=e.rotationSpeed,e.opacity-=.007,e.opacity>0&&e.y<r+40&&(o=!0,t.save(),t.globalAlpha=Math.max(0,e.opacity),t.translate(e.x,e.y),t.rotate(e.rotation*Math.PI/180),e.emoji?(t.font=`${e.size}px sans-serif`,t.fillText(e.emoji,-e.size/2,e.size/2)):(t.fillStyle=e.color,t.fillRect(-e.size/2,-e.size/2,e.size,e.size*.6)),t.restore());o&&Date.now()-l<6e3?c=requestAnimationFrame(u):(cancelAnimationFrame(c),window.removeEventListener(`resize`,i),e.remove())}c=requestAnimationFrame(u)}var c=[`🏖 Beach Picnic`,`🎬 Movie Night`,`🍦 Ice Cream Date`,`🎢 Amusement Park`,`🌅 Sunset Walk`,`🎭 Theatre Night`,`🍕 Pizza Date`,`🌃 City Lights Stroll`,`🎵 Live Music`,`🎨 Art Museum`,`🎳 Bowling Night`,`☕ Café Hopping`,`🚣 Boat Ride`,`🌿 Nature Trek`,`🎤 Karaoke Night`,`🍱 Food Trip`],l={emoji:`🌹`,name:`Romantic Dinner Date`,description:`A special evening just for the two of us ♡`,time:`Tonight, 7:00 PM`},u=[{name:`Bohol Tropics Resort Restaurant`,type:`🍽 Fine Dining`,vibe:`Romantic garden setting, Filipino-international cuisine`,address:`Graham Ave, Tagbilaran City`,rating:`⭐⭐⭐⭐⭐`},{name:`Buzz Café`,type:`☕ Café & Chill`,vibe:`Cozy coffee shop, great for long sweet conversations`,address:`CPG North Ave, Tagbilaran City`,rating:`⭐⭐⭐⭐`},{name:`Gerarda's Restaurant`,type:`🦐 Seafood & Local`,vibe:`Iconic Bohol seafood, perfect romantic dinner`,address:`Tagbilaran City Wharf area`,rating:`⭐⭐⭐⭐⭐`},{name:`Bohol Bee Farm (City Café)`,type:`🌿 Organic Dining`,vibe:`Organic farm-to-table, serene and romantic ambiance`,address:`Dao District, Tagbilaran City`,rating:`⭐⭐⭐⭐`},{name:`The Tagbilaran Baywalk`,type:`🌅 Sunset Spot`,vibe:`Beautiful sunset views, perfect evening stroll together`,address:`Tagbilaran City Waterfront`,rating:`⭐⭐⭐⭐`},{name:`Bohol Quality Mall — Cinema & Food Court`,type:`🛍 Date & Dine`,vibe:`Movie + dinner combo, casual and fun`,address:`CPG Ave, Tagbilaran City`,rating:`⭐⭐⭐`},{name:`Spice It Up! Restaurant`,type:`🍛 Asian Fusion`,vibe:`Intimate setting, perfect for a special date`,address:`Tagbilaran City`,rating:`⭐⭐⭐⭐`}];function d(e,t,n,r,a){s();try{navigator.vibrate?.([100,50,150,50,200])}catch{}let o=u.slice(0,4),c=a?`<p class="ivraine-reveal-location">📍 Based on your location: <strong>${a.city||a.fullAddress}</strong></p>`:`<p class="ivraine-reveal-location">📍 Best spots in <strong>Tagbilaran City, Bohol</strong> ♡</p>`,d=o.map(e=>`
    <div class="ivraine-spot-card">
      <div class="ivraine-spot-type">${e.type}</div>
      <div class="ivraine-spot-name">${e.name}</div>
      <div class="ivraine-spot-vibe">${e.vibe}</div>
      <div class="ivraine-spot-meta">${e.rating} · ${e.address}</div>
    </div>
  `).join(``);i(r,`Completed Mystery Date Generator 🎰`,`Revealed date: ${l.name}. Location: ${a?.fullAddress||`Not shared`}`,n,0,a||void 0),e.innerHTML=`
    <div class="ivraine-date-reveal" id="ivraine-date-reveal">
      <div class="ivraine-reveal-badge">🎉 Your Date is Revealed!</div>
      <div class="ivraine-reveal-emoji">${l.emoji}</div>
      <h2 class="ivraine-reveal-title">${l.name}</h2>
      <p class="ivraine-reveal-desc">${l.description}</p>
      <div class="ivraine-reveal-time">🕖 ${l.time}</div>

      ${c}

      <div class="ivraine-spots-section">
        <div class="ivraine-spots-label">✨ Perfect spots near you tonight:</div>
        <div class="ivraine-spots-list">
          ${d}
        </div>
      </div>

      <button class="ivraine-btn-continue" id="ivraine-btn-date-close" type="button">
        I can't wait! ♡
      </button>
    </div>
  `,e.querySelector(`#ivraine-btn-date-close`).addEventListener(`click`,()=>{t.remove()})}function f(r=`Private Space`,o=`Loraine`){let u=document.querySelector(`.ivraine-proposal-overlay`);u&&u.remove(),i(r,`Opened 'Would you go out with me?' proposal`,`User opened proposal modal`,o);let f=document.createElement(`div`);f.className=`ivraine-proposal-overlay`,f.innerHTML=`
    <div class="ivraine-proposal-card" role="dialog" aria-modal="true" aria-labelledby="proposal-title">
      <button class="ivraine-close-proposal" type="button" aria-label="Close">×</button>
      <span class="ivraine-proposal-badge">A question from Ivan ♡</span>
      <div class="ivraine-proposal-avatar-wrap">
        <img class="ivraine-proposal-avatar" src="/icons/couple-192.png" alt="Ivan and Loraine">
        <span class="ivraine-avatar-heart">💖</span>
      </div>
      <h2 class="ivraine-proposal-title" id="proposal-title">Would you <em>go out with me?</em></h2>
      <p class="ivraine-proposal-desc">Every moment with you is my favorite memory, ${o}.<br>Will you be my date, today and forever? ♡</p>
      
      <div class="ivraine-button-arena" id="ivraine-btn-arena">
        <button class="ivraine-btn-yes" id="ivraine-btn-yes" type="button">
          <span>Yes! 🥰💖</span>
        </button>
        
        <button class="ivraine-btn-no" id="ivraine-btn-no" type="button">
          <span>No 🙈</span>
          <div class="ivraine-tease-bubble" id="ivraine-tease">Nice try! 😜</div>
        </button>
      </div>
    </div>
  `,document.body.appendChild(f);let p=f.querySelector(`.ivraine-close-proposal`),m=f.querySelector(`#ivraine-btn-arena`),h=f.querySelector(`#ivraine-btn-yes`),g=f.querySelector(`#ivraine-btn-no`),_=f.querySelector(`#ivraine-tease`),v=f.querySelector(`.ivraine-proposal-card`);p.addEventListener(`click`,()=>f.remove());let y=0,b=0;function x(a=!1){e++;let s=m.getBoundingClientRect(),c=h.getBoundingClientRect(),l=g.getBoundingClientRect(),u=n[e%n.length];_.textContent=u,_.classList.add(`visible`),t&&clearTimeout(t),t=setTimeout(()=>_.classList.remove(`visible`),1500);try{navigator.vibrate?.([30])}catch{}let d=s.width/2-l.width/2-15,f=s.height/2-l.height/2-15,p=0,v=0,x=0;for(;x<15;){x++;let e=(Math.random()*2-1)*d,t=(Math.random()*2-1)*f;if(Math.hypot(e-y,t-b)<60)continue;let n=s.left+s.width/2,r=s.top+s.height/2,i=n+e,a=r+t,o=c.left+c.width/2,l=c.top+c.height/2;if(Math.hypot(i-o,a-l)>90){p=e,v=t;break}}y=p,b=v,g.style.transform=`translate3d(${p}px, ${v}px, 0)`,e%3==0&&i(r,`Tried to click NO (button avoided cursor)`,`Dodged ${e} times`,o,1)}m.addEventListener(`mousemove`,e=>{let t=g.getBoundingClientRect(),n=t.left+t.width/2,r=t.top+t.height/2;Math.hypot(e.clientX-n,e.clientY-r)<75&&x(!1)}),g.addEventListener(`mouseenter`,()=>x(!1)),g.addEventListener(`mouseover`,()=>x(!1)),g.addEventListener(`pointerenter`,()=>x(!1)),g.addEventListener(`pointerdown`,e=>{e.preventDefault(),e.stopPropagation(),x(e.pointerType===`touch`)},{capture:!0}),g.addEventListener(`mousedown`,e=>{e.preventDefault(),e.stopPropagation(),x(!1)},{capture:!0}),g.addEventListener(`click`,e=>{e.preventDefault(),e.stopPropagation(),x(!1)},{capture:!0}),g.addEventListener(`touchstart`,e=>{e.preventDefault(),e.stopPropagation(),x(!0)},{passive:!1,capture:!0}),m.addEventListener(`touchmove`,e=>{if(e.touches&&e.touches[0]){let t=e.touches[0],n=g.getBoundingClientRect(),r=n.left+n.width/2,i=n.top+n.height/2;Math.hypot(t.clientX-r,t.clientY-i)<70&&x(!0)}},{passive:!0}),h.addEventListener(`click`,()=>{try{localStorage.setItem(`ivraine_proposal_status`,`accepted`),localStorage.setItem(`ivraine_proposal_date`,new Date().toISOString()),localStorage.setItem(`ivraine_proposal_dodges`,String(e))}catch{}try{navigator.vibrate?.([100,50,150,50,200])}catch{}i(r,`Said YES to 'Would you go out with me?' 💖`,`Dodged NO button ${e} times before saying YES! \uD83C\uDF89`,o,e),s(),v.innerHTML=`
      <div class="ivraine-mystery-wrap" id="ivraine-mystery-wrap">
        <div class="ivraine-mystery-badge">She said YES! 🎉 Here's the plan...</div>
        <h2 class="ivraine-mystery-title">Spinning our<br><em>perfect date tonight!</em></h2>

        <div class="ivraine-slot-machine">
          <div class="ivraine-slot-reel" id="ivraine-slot-reel">
            <div class="ivraine-slot-item">🌀 Spinning…</div>
          </div>
          <div class="ivraine-slot-shine"></div>
        </div>

        <div class="ivraine-loc-status" id="ivraine-loc-status">
          <span class="ivraine-loc-dot"></span>
          <span id="ivraine-loc-msg">📍 Getting your location to find the best spots near you…</span>
        </div>
      </div>
    `;let t=v.querySelector(`#ivraine-slot-reel`),n=v.querySelector(`#ivraine-loc-msg`),u=0,p=60,m=0,h=!1,g=!1,_=null;function y(){h&&g&&setTimeout(()=>d(v,f,o,r,_),300)}function b(){u=(u+1)%c.length,t.innerHTML=`<div class="ivraine-slot-item spinning">${c[u]}</div>`,m++,m<42?(m>30&&(p=Math.min(p+22,350)),setTimeout(b,p)):(t.innerHTML=`<div class="ivraine-slot-item landed">${l.emoji} ${l.name}</div>`,h=!0,y())}b(),a(r,o).then(e=>{_=e,g=!0,n&&(n.textContent=_?`\uD83D\uDCCD Location found: ${_.city||_.fullAddress}`:`📍 Showing best spots in Tagbilaran City, Bohol`),y()})})}var p=class extends Error{status;retryAfter;constructor(e,t,n=0){super(e),this.status=t,this.retryAfter=n}};async function m(e,t=`GET`,n){throw Error(`The app is not connected yet. Follow README.md to configure it.`)}export{i as a,f as i,m as n,o as r,p as t};