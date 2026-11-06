(() => {
'use strict';
const config = window.KUSYA_CONFIG;
const $ = id => document.getElementById(id);
const preview = document.body.dataset.preview === 'true';
const key = config.storageKey + (preview ? '-preview' : '');
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let manualMotion = null, state = { used: [], revealed: [] }, pendingId = null, entered = false;
let ritual = null;
const validIds = new Set(config.coupons.map(c => c.id));
let storage;
try { storage = window.localStorage; storage.setItem(key + '-check', '1'); storage.removeItem(key + '-check'); }
catch { $('storage-warning').hidden = false; }
function parseState(raw) {
  try { const value = JSON.parse(raw); return { used: [...new Set((Array.isArray(value?.used) ? value.used : []).filter(id => validIds.has(id)))], revealed: [...new Set((Array.isArray(value?.revealed) ? value.revealed : []).filter(id => validIds.has(id)))] }; }
  catch { return { used: [], revealed: [] }; }
}
function read() { if (storage) { try { state = parseState(storage.getItem(key)); } catch { $('storage-warning').hidden = false; } } }
function save() { if (storage) { try { storage.setItem(key, JSON.stringify(state)); } catch { $('storage-warning').hidden = false; } } }
read();
// Translate the chosen local date to an instant using the IANA zone (not the visitor's zone).
function zonedInstant(parts, timeZone) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0);
  const format = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  let guess = target;
  for (let i = 0; i < 5; i++) {
    const local = Object.fromEntries(format.formatToParts(new Date(guess)).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
    const delta = target - Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    if (delta === 0) return guess;
    guess += delta;
  }
  throw new Error('Дата открытия не существует в выбранном часовом поясе.');
}
let deadline;
try { deadline = zonedInstant(config.opening, config.timeZone); }
catch (error) { $('date-label').textContent = 'Проверь дату и часовой пояс в config.js'; $('countdown').hidden = true; console.error(error); return; }
const openNow = () => preview || Date.now() >= deadline;
const label = new Intl.DateTimeFormat('ru-RU', {timeZone: config.timeZone, day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(deadline);
$('date-label').textContent = label.replace(' г.', '').replace(' в ', ' · ') + ' · ' + config.timeZone;
function announce(text) { $('status').textContent = text; }
function tick() {
  const ready = openNow();
  $('countdown').hidden = ready; $('ready').hidden = !ready;
  $('cat-guardian').hidden = ready;
  if (ready) $('cat-guardian').classList.remove('speaking');
  if (ready) {
    if (!$('gate').dataset.ready) { $('gate').dataset.ready = 'true'; announce('Время пришло! Теперь можно открыть подарок.'); }
    return;
  }
  if (entered) { entered = false; $('collection').hidden = true; $('gate').hidden = false; }
  const total = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const values = [Math.floor(total / 86400), Math.floor(total / 3600) % 24, Math.floor(total / 60) % 60, total % 60];
  ['days','hours','minutes','seconds'].forEach((id,i) => $(id).textContent = String(values[i]).padStart(2,'0'));
}
function updateCount() {
  const left = config.coupons.length - state.used.length;
  $('remaining').textContent = left + ' / ' + config.coupons.length + ' ОСТАЛОСЬ';
  $('empty').hidden = left !== 0;
}
function render() {
  $('tickets').replaceChildren();
  config.coupons.forEach((coupon, i) => {
    if (state.used.includes(coupon.id)) return;
    const card = document.createElement('article'); card.className = 'ticket'; card.dataset.id = coupon.id;
    const top = document.createElement('div'); top.className = 'ticket-top';
    const num = document.createElement('span'); num.textContent = 'КУПОН № ' + String(i+1).padStart(2,'0');
    const icon = document.createElement('img'); icon.src = 'assets/moth.svg'; icon.width = 25; icon.height = 20; icon.alt = '';
    top.append(num,icon);
    const body = document.createElement('div'); body.className = 'ticket-body';
    if (state.revealed.includes(coupon.id)) {
      body.classList.add('revealed');
      const title = document.createElement('h2'); title.textContent = coupon.title;
      const text = document.createElement('p'); text.textContent = coupon.text;
      const use = document.createElement('button'); use.type = 'button'; use.className = 'use'; use.innerHTML = 'Использовать <span aria-hidden="true">→</span>'; use.setAttribute('aria-label', 'Использовать купон ' + (i+1) + ': ' + coupon.title);
      use.addEventListener('click', () => { if (!openNow()) return; pendingId = coupon.id; $('confirm-title').textContent = coupon.title; $('confirm').returnValue = ''; $('confirm').showModal(); });
      body.append(title); if(coupon.text) body.append(text); body.append(use);
    } else {
      const reveal = document.createElement('button'); reveal.className = 'spoiler'; reveal.type = 'button'; reveal.setAttribute('aria-label','Подсмотреть купон ' + (i+1));
      reveal.innerHTML = '<img class="secret-moth" src="assets/moth.svg" alt=""><span>Подсмотреть</span>';
      reveal.addEventListener('click', () => {
        if (!openNow()) return;
        read(); if (!state.used.includes(coupon.id) && !state.revealed.includes(coupon.id)) state.revealed.push(coupon.id); save(); render();
        findCard(coupon.id)?.querySelector('.use')?.focus({preventScroll:true});
        announce('Купон ' + (i+1) + ': ' + coupon.title + '. ' + coupon.text);
      }); body.append(reveal);
    }
    const stub = document.createElement('div'); stub.className = 'ticket-stub'; stub.setAttribute('aria-hidden','true');
    const stubNumber = document.createElement('span'); stubNumber.textContent = String(i+1).padStart(2,'0');
    const stamp = document.createElement('img'); stamp.src = 'assets/moth.svg'; stamp.alt = ''; stamp.width = 32; stamp.height = 24;
    const barcode = document.createElement('span'); barcode.className = 'pixel-barcode';
    stub.append(stubNumber,stamp,barcode);
    card.append(top,body,stub); $('tickets').append(card);
  }); updateCount();
}
function findCard(id) { return [...$('tickets').children].find(el => el.dataset.id === id); }
function reduced() { return manualMotion === null ? motionQuery.matches : !manualMotion; }
function applyMotion() { document.body.classList.toggle('no-motion', reduced()); $('motion').textContent = reduced() ? '▶' : 'Ⅱ'; $('motion').setAttribute('aria-label', reduced() ? 'Включить анимацию' : 'Отключить анимацию'); $('motion').title = reduced() ? 'Включить анимацию' : 'Отключить анимацию'; if(reduced()) $('cat-guardian').classList.remove('speaking'); $('motion').setAttribute('aria-pressed', String(reduced())); }
$('motion').addEventListener('click', () => { manualMotion = reduced(); applyMotion(); });
motionQuery.addEventListener('change', applyMotion); applyMotion();
function burst(x,y,count=18) {
  if (reduced()) return;
  for (let i=0;i<count;i++) {
    const el = document.createElement('span'); el.className='burst-moth'; el.setAttribute('aria-hidden','true');
    el.innerHTML='<img src="assets/moth.svg" alt="">';
    el.style.cssText = `left:${x + (Math.random()-.5)*130}px;top:${y + (Math.random()-.5)*60}px;--size:${13+Math.random()*20}px;--x:${(Math.random()-.5)*550}px;--y:${-100-Math.random()*300}px;--r:${(Math.random()-.5)*100}deg;animation-delay:${Math.random()*.22}s`;
    document.body.append(el); setTimeout(()=>el.remove(),1800);
  }
}
// A ticket is consumed only after a successful tear, never at confirmation.
function startCeremony(id) {
  read();
  if (!openNow() || state.used.includes(id)) { render(); return; }
  const coupon = config.coupons.find(c => c.id === id);
  const number = String(config.coupons.indexOf(coupon)+1).padStart(2,'0');
  ritual = { id, committed: false, pointerId: null, timers: [] };
  $('ceremony').classList.remove('torn');
  $('hero-title').textContent = coupon.title;
  $('hero-number').textContent = 'КУПОН № ' + number;
  $('stub-number').textContent = number;
  $('achievement-wish').textContent = coupon.title;
  $('tear-scene').hidden = false; $('achievement').hidden = true;
  $('ceremony-cancel').hidden = false;
  $('tear-stub').disabled = false; $('tear-button').disabled = false;
  $('tear-stub').style.removeProperty('--pull-x');
  $('tear-stub').style.removeProperty('--pull-y');
  $('tear-stub').style.removeProperty('--pull-r');
  $('ceremony-particles').replaceChildren();
  document.body.classList.add('ceremony-open');
  $('ceremony').showModal();
  $('tear-stub').focus({preventScroll:true});
  announce('Потяни боковую часть вправо или нажми кнопку «Оторвать корешок».');
}
const mothTypes = ['moth.svg','moth-luna.svg','moth-speckled.svg','moth-hawk.svg'];
function ceremonyMoths(rect) {
  if (reduced()) return;
  const area = $('ceremony').getBoundingClientRect();
  for(let i=0;i<38;i++) {
    const el = document.createElement('span'); el.className = 'ritual-moth';
    const img = document.createElement('img'); img.src = 'assets/' + mothTypes[i % mothTypes.length]; img.alt = ''; el.append(img);
    const angle = Math.random()*Math.PI*2;
    const distance = 130+Math.random()*Math.min(innerWidth,650);
    el.style.cssText = `left:${rect.left-area.left+rect.width*(.1+Math.random()*.8)}px;top:${rect.top-area.top+rect.height*(.15+Math.random()*.7)}px;--size:${18+Math.random()*54}px;--fly-x:${Math.cos(angle)*distance}px;--fly-y:${Math.sin(angle)*distance-110}px;--fly-r:${(Math.random()-.5)*90}deg;--life:${1.8+Math.random()*1.1}s;animation-delay:${Math.random()*.35}s`;
    $('ceremony-particles').append(el);
  }
}
function tearTicket() {
  if (!ritual || ritual.committed) return;
  if (!openNow()) { $('ceremony').close(); return; }
  read();
  if(state.used.includes(ritual.id)) { $('ceremony').close(); render(); announce('Этот купон уже использован.'); return; }
  ritual.committed = true;
  // Persist before playing the animation, so reloads cannot restore a torn ticket.
  state.used.push(ritual.id); save(); updateCount();
  const rect = $('hero-ticket').getBoundingClientRect();
  $('tear-stub').disabled = true; $('tear-button').disabled = true;
  $('ceremony-cancel').hidden = true;
  $('ceremony').classList.add('torn');
  ritual.timers.push(setTimeout(() => ceremonyMoths(rect), reduced()?0:240));
  ritual.timers.push(setTimeout(() => {
    if(!ritual) return;
    $('tear-scene').hidden = true; $('achievement').hidden = false;
    $('achievement-title').focus({preventScroll:true});
    announce('Ачивка получена. Купон использован: ' + $('achievement-wish').textContent);
    render();
  },reduced()?0:1550));
}
$('confirm').addEventListener('close', () => {
  const id = pendingId; pendingId = null;
  if ($('confirm').returnValue === 'use' && id) startCeremony(id);
});
$('tear-button').addEventListener('click', tearTicket);
// Native button activation from keyboard / assistive technology also tears the stub.
$('tear-stub').addEventListener('click', e => { if(e.detail === 0) tearTicket(); });
$('tear-stub').addEventListener('pointerdown', e => {
  if(!ritual || ritual.committed || !e.isPrimary || e.button !== 0) return;
  ritual.pointerId = e.pointerId; ritual.startX = e.clientX; ritual.startY = e.clientY;
  $('tear-stub').setPointerCapture(e.pointerId);
  $('tear-stub').classList.add('dragging');
});
$('tear-stub').addEventListener('pointermove', e => {
  if(!ritual || ritual.committed || ritual.pointerId !== e.pointerId) return;
  const x = Math.max(0,e.clientX-ritual.startX), y = e.clientY-ritual.startY;
  $('tear-stub').style.setProperty('--pull-x',Math.min(x,150)+'px');
  $('tear-stub').style.setProperty('--pull-y',Math.max(-60,Math.min(y,60))+'px');
  $('tear-stub').style.setProperty('--pull-r',Math.min(x/8,16)+'deg');
  if(x >= Math.min(85,$('hero-ticket').clientWidth*.22)) tearTicket();
});
function releaseStub(e) {
  if(!ritual || ritual.pointerId !== e.pointerId) return;
  ritual.pointerId = null; $('tear-stub').classList.remove('dragging');
  if(!ritual.committed) ['--pull-x','--pull-y','--pull-r'].forEach(p => $('tear-stub').style.removeProperty(p));
}
['pointerup','pointercancel','lostpointercapture'].forEach(type => $('tear-stub').addEventListener(type,releaseStub));
$('ceremony-cancel').addEventListener('click', () => $('ceremony').close());
$('ceremony-done').addEventListener('click', () => $('ceremony').close());
$('ceremony').addEventListener('cancel', e => {
  if(ritual?.committed && $('achievement').hidden) e.preventDefault();
});
$('ceremony').addEventListener('close', () => {
  const id = ritual?.id;
  ritual?.timers.forEach(clearTimeout); ritual = null;
  $('tear-stub').classList.remove('dragging');
  $('ceremony-particles').replaceChildren();
  document.body.classList.remove('ceremony-open');
  read(); render();
  const target = findCard(id)?.querySelector('button') || $('tickets').querySelector('button') || $('collection-title');
  target.focus({preventScroll:true});
});
// Opening film: independent from coupon persistence and replayed on each opening.
let introRun = null;
const loveMessage = 'Это, наверное, максимум, который я могу тебе подарить сейчас. Но я хочу, чтобы ты знала. Угне, с днём рождения! Я тебя очень сильно люблю.';
const ringMessage = 'Однажды одену его тебе на палец.';
function showCollection() {
  if (!openNow()) { tick(); return; }
  entered = true; render(); $('gate').hidden = true; $('collection').hidden = false;
  requestAnimationFrame(() => $('collection-title').focus({preventScroll:true}));
  window.scrollTo({top:0,behavior:'auto'});
}
// Count visible viewing time, so switching apps doesn't skip the confession.
async function filmWait(ms, run) {
  let elapsed = 0, last = performance.now();
  while(elapsed < ms) {
    if(run.cancelled) throw new Error('intro-cancelled');
    await new Promise(resolve => setTimeout(resolve,40));
    const now = performance.now();
    if(!document.hidden) elapsed += Math.min(now-last,80);
    last = now;
  }
}
async function filmType(el,text,run,speed) {
  if(reduced()) { el.textContent = text; return; }
  for(const letter of text) { if(run.cancelled) throw new Error('intro-cancelled'); el.textContent += letter; await filmWait(speed,run); }
}
async function filmFade(run, change) {
  $('intro').classList.add('scene-fading');
  await filmWait(reduced()?100:900,run);
  change();
  $('intro').classList.remove('scene-fading');
  await filmWait(reduced()?100:900,run);
}
function finishIntro() {
  if(!introRun) return;
  introRun.cancelled = true; introRun = null;
  $('intro').close(); $('intro-swarm').replaceChildren();
  $('intro').classList.remove('hearts-visible','scene-fading');
  document.body.classList.remove('intro-playing');
  showCollection();
}
async function playIntro() {
  if(!openNow() || introRun) return;
  const run = {cancelled:false}; introRun=run;
  $('love-typed').textContent=''; $('ring-typed').textContent=''; $('ring-heart').hidden=true;
  $('intro-flight').hidden=false; $('intro-couple').hidden=true; $('intro-ring').hidden=true;
  $('intro').classList.remove('hearts-visible','scene-fading');
  $('intro-swarm').replaceChildren();
  document.body.classList.add('intro-playing');
  $('intro').showModal();
  $('intro-skip').focus({preventScroll:true});
  try {
    await filmWait(reduced()?800:6500,run);
    await filmFade(run,()=>{ $('intro-flight').hidden=true; $('intro-couple').hidden=false; });
    await filmType($('love-typed'),loveMessage,run,42);
    announce(loveMessage);
    $('intro').classList.add('hearts-visible');
    await filmWait(4500,run);
    if(!reduced()) {
      for(let i=0;i<48;i++) {
        const moth=document.createElement('img');moth.src='assets/moth.svg';moth.alt='';moth.className='intro-rising-moth';
        moth.style.cssText=`left:${Math.random()*100}%;--moth-size:${9+Math.random()*21}px;--moth-time:${3+Math.random()*2}s;--moth-drift:${(Math.random()-.5)*160}px;animation-delay:${Math.random()*1.8}s`;
        $('intro-swarm').append(moth);
      }
    }
    await filmWait(reduced()?600:4700,run);
    await filmFade(run,()=>{ $('intro-couple').hidden=true; $('intro-swarm').replaceChildren(); $('intro-ring').hidden=false; });
    await filmWait(900,run);
    await filmType($('ring-typed'),ringMessage,run,85);
    $('ring-heart').hidden=false;
    announce(ringMessage);
    // Ten full seconds start only after the last letter and red heart appear.
    await filmWait(10000,run);
    $('intro').classList.add('scene-fading');
    await filmWait(reduced()?100:1200,run);
    finishIntro();
  } catch(error) { if(!run.cancelled) { console.error(error); finishIntro(); } }
}
$('intro-skip').addEventListener('click',finishIntro);
$('intro').addEventListener('cancel',e=>{e.preventDefault();finishIntro();});
$('open').addEventListener('click',playIntro);
window.addEventListener('storage', e => { if (e.key===key || e.key===null) { read(); if(ritual && !ritual.committed && state.used.includes(ritual.id)) $('ceremony').close(); if(entered)render(); } });
document.addEventListener('visibilitychange', () => { document.body.classList.toggle('film-paused',document.hidden); if(!document.hidden){tick();read();if(entered)render();} });
for(let i=0;i<28;i++){const el=document.createElement('span');el.className='star';el.style.cssText=`left:${Math.random()*100}%;top:${Math.random()*100}%;--duration:${3+Math.random()*6}s;--delay:-${Math.random()*10}s`;$('stars').append(el);}
[[8,28,27],[86,23,22],[12,73,19],[91,66,30],[68,87,17]].forEach(([x,y,size],i)=>{
  const el=document.createElement('button');el.type='button';el.className='moth';el.setAttribute('aria-label','Поиграть с мотыльком '+(i+1));el.style.cssText=`left:${x}%;top:${y}%;--size:${size}px;--duration:${9+i*3}s`;el.innerHTML='<img src="assets/moth.svg" alt="">';
  el.addEventListener('click',()=>{const rect=el.getBoundingClientRect();burst(rect.left+rect.width/2,rect.top+rect.height/2,5);el.style.left=(5+Math.random()*83)+'%';el.style.top=(15+Math.random()*65)+'%';});$('moths').append(el);
});
if(preview){const banner=document.createElement('p');banner.className='preview-banner';banner.textContent='ПРЕДПРОСМОТР · дата открытия отключена · купоны сохраняются отдельно';document.querySelector('header').after(banner);}
// Start each little speech seven seconds apart; never repeat announcements to screen readers.
function catSpeak() {
  if (document.hidden || $('gate').hidden || openNow() || reduced()) return;
  const cat = $('cat-guardian');
  cat.classList.add('speaking');
  setTimeout(() => cat.classList.remove('speaking'), 1800);
}
setInterval(catSpeak, 7000);
tick(); setInterval(tick,250);
})();
