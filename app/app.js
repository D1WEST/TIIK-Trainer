/* Local application. No accounts, tracking, or remote calls. */
(() => {
  'use strict';
  const bank = window.TIIK_BANK, E = window.TIIK, $ = s => document.querySelector(s);
  const KEY = 'tiik-progress-v1', taskMap = new Map(bank.tasks.map(t => [t.id, t]));
  if(window.mermaid)mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',themeVariables:{fontFamily:'Segoe UI, Arial, sans-serif',primaryColor:'#edf4ff',primaryTextColor:'#244c81',primaryBorderColor:'#acc9f6',lineColor:'#90add4'},flowchart:{htmlLabels:false,useMaxWidth:true}});
  let storageError = false, corruptStorage = false;
  const fresh = () => ({ version: 1, attempts: [], sessions: [], bookmarks: [], active: null });
  let progress;
  try { const raw = localStorage.getItem(KEY); progress = raw ? JSON.parse(raw) : fresh(); if (!validProgress(progress)) throw Error('invalid'); }
  catch (e) { progress = fresh(); corruptStorage = true; }
  let page = location.hash.slice(1) || 'home', selected = new Set(bank.topics.map(t => t.id)), mode = 'all', count = 20, days = 7, mix = true;
  let topicSearch = '', statsSearch = '', statsFilter = 'all', statsTopic = 'all', theoryTopic = bank.topics[0].id, resultId = null, detailId = null, returnPage = 'stats', showSolution = false, installPrompt = null;
  let quizDraft = [], draftTask = null, retryIds = null, offlineState = location.protocol === 'file:' ? 'Портативный режим' : 'Подготовка офлайн…';
  const palette = ['#ed659d', '#3681f4', '#9567df', '#12ae8a', '#e5a02c', '#3c96d9', '#e87845', '#bc65d1', '#6379e9', '#14a69a'];
  const svg = {
    home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
    topics:'<path d="M8 5h13M8 12h13M8 19h13"/><path d="M3 5h1M3 12h1M3 19h1"/>',
    test:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v4H9zM9 13l2 2 4-5"/>',
    repeat:'<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/>',
    stats:'<path d="M4 20V13M10 20V8M16 20V3M22 20V10"/>',
    book:'<path d="M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2zM12 6v15"/>',
    settings:'<path d="m9 3-1 3-3 1v4l-2 1 2 2v4l3 1 1 3h5l1-3 3-1v-4l2-2-2-1V7l-3-1-1-3z"/><circle cx="11.5" cy="12.5" r="3"/>',
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>', back:'<path d="m14 5-7 7 7 7"/>',
    check:'<path d="m5 12 4 4L19 6"/>', close:'<path d="m6 6 12 12M6 18 18 6"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 9-9"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    star:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
    search:'<circle cx="10" cy="10" r="7"/><path d="m16 16 5 5"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    save:'<path d="M6 3h12v19l-6-4-6 4z"/>',
    bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
    shield:'<path d="m12 3 9 4v6c0 5-9 9-9 9s-9-4-9-9V7z"/><path d="m8 12 3 3 5-6"/>',
    trophy:'<path d="M7 3h10v7a5 5 0 0 1-10 0zM7 5H3v3c0 4 4 4 4 4m10-7h4v3c0 4-4 4-4 4M12 15v6M8 21h8"/>'
  };
  function icon(name) { return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${svg[name] || svg.topics}</svg>`; }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const topic = id => bank.topics.find(t => t.id === id);
  const clean = s => String(s).replace(/\[IMG:[^\]]+\]/g, ' [формула] ');
  const fmtDate = s => new Date(s).toLocaleString('ru-RU', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  function rich(text) { return esc(text).replace(/\[IMG:([^\]]+)\]/g, (_, file) => `<img class="task-image" src="assets/tasks/${encodeURIComponent(file)}" alt="Формула или схема из задания" loading="lazy">`); }
  function markdown(text) {
    const math = [];
    let s = text.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, x => `MATHPLACEHOLDER${math.push(x)-1}END`);
    // Strip arbitrary HTML before parsing source Markdown.
    s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '');
    s = s.replace(/!\[\[([^\]]+)\]\]/g, (_, path) => {
      const file = path.split('/').pop(), folder = path.includes('Иллюстрации') ? 'slides' : 'tasks';
      return `![Иллюстрация из материалов](assets/${folder}/${encodeURIComponent(file)})`;
    });
    s = s.replace(/\[\[([^\]]+)\]\]/g, '$1');
    let html = marked.parse(s, {breaks:false, gfm:true});
    html = html.replace(/MATHPLACEHOLDER(\d+)END/g, (_, i) => esc(math[Number(i)]));
    // Only internal image resources and safe links are allowed in notes.
    const dom = document.createElement('template'); dom.innerHTML = html;
    dom.content.querySelectorAll('a').forEach(a => { const href = a.getAttribute('href') || ''; if (!/^(https?:\/\/|#)/i.test(href)) a.removeAttribute('href'); else { a.target='_blank'; a.rel='noopener noreferrer'; } });
    dom.content.querySelectorAll('img').forEach(img => { if (!/^assets\/(tasks|slides)\//.test(img.getAttribute('src') || '')) img.remove(); else { img.loading='lazy'; img.alt='Иллюстрация из материалов'; } });
    return dom.innerHTML;
  }
  function validProgress(p) {
    if (!p || p.version !== 1 || !Array.isArray(p.attempts) || !Array.isArray(p.sessions) || !Array.isArray(p.bookmarks)) return false;
    if (!p.attempts.every(a => a && taskMap.has(a.taskId) && typeof a.correct === 'boolean' && typeof a.at === 'string' && Number.isFinite(Date.parse(a.at)) && Array.isArray(a.answers) && a.answers.every(v => typeof v === 'string') && typeof a.sessionId === 'string')) return false;
    if (!p.sessions.every(s => s && typeof s.id === 'string' && Array.isArray(s.taskIds) && s.taskIds.every(id => taskMap.has(id)) && typeof s.startedAt === 'string' && Number.isFinite(Date.parse(s.startedAt)) && (s.endedAt == null || (typeof s.endedAt === 'string' && Number.isFinite(Date.parse(s.endedAt)))))) return false;
    if (!p.bookmarks.every(id => taskMap.has(id))) return false;
    if (p.active != null) {
      const a=p.active;
      if (typeof a.sessionId !== 'string' || !p.sessions.some(s => s.id === a.sessionId) || !Array.isArray(a.ids) || !a.ids.length || !a.ids.every(id=>taskMap.has(id)) || !Number.isInteger(a.index) || a.index<0 || a.index>=a.ids.length || !a.orders || typeof a.orders !== 'object') return false;
      for (const id of a.ids) {
        const t=taskMap.get(id); if (t.options && (!Array.isArray(a.orders[id]) || a.orders[id].length!==t.options.length || new Set(a.orders[id]).size!==t.options.length || !a.orders[id].every(v=>t.options.some(o=>o.id===v)))) return false;
      }
    }
    return true;
  }
  function save() {
    if (corruptStorage) { toast('Сначала скачайте повреждённые данные или восстановите резервную копию в настройках.'); return false; }
    try { localStorage.setItem(KEY, JSON.stringify(progress)); return true; }
    catch (e) { storageError=true; toast('Не удалось сохранить прогресс. Скачайте резервную копию в настройках.'); return false; }
  }
  function toast(message) { const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('visible'),4200); }
  function go(next) { page=next;location.hash=next;showSolution=false;render();window.scrollTo(0,0); }
  function button(label, action, cls='') { return `<button class="button ${cls}" data-action="${action}">${label}</button>`; }
  function empty(text, name='book') { return `<div class="empty">${icon(name)}${text}</div>`; }
  function navButton(id, label, name) { return `<button data-page="${id}" class="${page===id || (id==='setup' && ['quiz','result'].includes(page)) ? 'active':''}">${icon(name)}<span>${label}</span></button>`; }
  function shell(content) {
    return `<div class="layout"><aside class="sidebar"><a class="brand" href="#home"><img src="icon.svg" alt=""><span><b>ТИиК Тренажёр</b><small>Практика. Понимание. Результат.</small></span></a><nav class="nav" aria-label="Основная навигация">${navButton('home','Главная','home')}${navButton('topics','Темы','topics')}${navButton('setup','Тесты','test')}${navButton('stats','Статистика','stats')}${navButton('theory','Метода','book')}${navButton('settings','Настройки','settings')}</nav><div class="sidebar-bottom"><span class="online-dot"></span>Личная подготовка<strong>Экзамен становится ближе.<br>А ты — увереннее.</strong><span id="offline-label">${offlineState}</span><br>Банк: ${bank.tasks.length} заданий · часть 2</div></aside><main class="main"><header class="topbar"><span>Подготовка к экзамену / ТИиК · часть 2</span><div class="mobile-title"><img src="icon.svg" alt="">ТИиК Тренажёр</div><span class="pill">${icon('shield')} Прогресс на этом устройстве</span></header>${corruptStorage?'<p class="danger-note">Сохранённые данные не удалось прочитать. Исходная копия сохранена. Откройте настройки для восстановления.</p>':''}${storageError?'<p class="danger-note">Хранилище браузера недоступно или заполнено. Скачайте прогресс в настройках.</p>':''}${content}<footer>Теория информации и кодирования · Твой темп, твой результат</footer></main></div>`;
  }
  function heading(title, subtitle, extra='') { return `<div class="pagehead"><div><div class="eyebrow">Теория информации и кодирования</div><h1>${title}</h1><p>${subtitle}</p></div>${extra}</div>`; }
  function metrics(attempts=progress.attempts) {
    const unique=new Set(attempts.map(a=>a.taskId)).size, right=attempts.filter(a=>a.correct).length, last=E.latest(attempts);
    const accuracy=attempts.length?Math.round(right/attempts.length*100):0, errors=Object.values(last).filter(a=>!a.correct).length;
    return `<div class="metrics">${[[unique,'Заданий пройдено','check'],[accuracy+'%','Верных ответов','target'],[errors,'Ошибок к повторению','repeat'],[progress.sessions.filter(s=>s.endedAt).length,'Тестов завершено','trophy']].map(([v,label,ic])=>`<div class="metric"><div class="metric-top"><strong>${v}</strong><span class="metric-icon">${icon(ic)}</span></div><small>${label}</small></div>`).join('')}</div>`;
  }
  function topicIcon(t) { const i=bank.topics.indexOf(t), color=palette[i];return `<span class="tileicon" style="--accent:${color};--tint:${color}16">${icon(['topics','target','bolt','shield','test','stats','repeat','topics','stats','book'][i])}</span>`; }
  function topicStats(id) { const a=progress.attempts.filter(a=>taskMap.get(a.taskId).topic===id), last=E.latest(a), done=Object.keys(last).length, correct=Object.values(last).filter(a=>a.correct).length;return {done, accuracy:a.length?Math.round(a.filter(v=>v.correct).length/a.length*100):0, mastered:correct}; }
  function sessionRow(s) {
    const a=progress.attempts.filter(a=>a.sessionId===s.id), correct=a.filter(x=>x.correct).length, pct=a.length?Math.round(correct/a.length*100):0;
    return `<div class="list-row"><span class="tileicon">${icon('test')}</span><div class="grow"><b>${s.mode==='wrong'?'Работа над ошибками':s.mode==='old'?'Повторение':esc(s.label || 'Тренировочный тест')}</b><small>${fmtDate(s.startedAt)} · ${s.endedAt?'завершён':'в процессе'}</small></div><b>${correct}/${s.taskIds.length}</b><span class="score ${pct<60?'bad':''}">${pct}%</span><button class="textbutton" data-result="${esc(s.id)}" aria-label="Посмотреть результат">${icon('back').replace('class="icon"','class="icon" style="transform:rotate(180deg)"')}</button></div>`;
  }
  function home() {
    const last=E.latest(progress.attempts), errors=Object.values(last).filter(a=>!a.correct).length;
    const resume=progress.active?`<div class="resume"><div><b>У тебя есть незавершённый тест</b><br><small>Вопрос ${progress.active.index+1} из ${progress.active.ids.length} · ответы сохранены</small></div>${button('Продолжить','resume','small')}</div>`:'';
    return heading('Учиться. Практиковаться. Понимать.','Всё для уверенной подготовки к экзамену.')+resume+
      `<section class="hero"><div><div class="eyebrow">Твой следующий шаг</div><h2>Готовься к экзамену<br>с пониманием</h2><p>529 заданий, разборы и формулы. Выбери темы,<br>проверь себя и разбери каждую ошибку.</p>${button('Начать тренировку '+icon('arrow'),'setup')}</div><div class="hero-art"><div class="orbit"></div><div class="hero-card">∑</div><span class="float-code code1">GF(2³)</span><span class="float-code code2">101 ⊕ 011</span></div></section>`+metrics()+
      `<div class="cols"><div><section class="panel"><div class="panel-title"><h2>Как будем заниматься?</h2></div><div class="quick-grid"><button class="quick" data-page="topics"><span class="tileicon">${icon('topics')}</span><span><b>Выбрать темы</b><small>10 разделов курса</small></span></button><button class="quick" data-mode-start="wrong"><span class="tileicon">${icon('repeat')}</span><span><b>Работа над ошибками</b><small>${errors?errors+' заданий ждут тебя':'Закрепляй знания'}</small></span></button><button class="quick" data-mode-start="old"><span class="tileicon">${icon('clock')}</span><span><b>Давно не решал</b><small>Освежить в памяти</small></span></button><button class="quick" data-page="theory"><span class="tileicon">${icon('book')}</span><span><b>Заглянуть в методу</b><small>Объяснения и примеры</small></span></button></div></section><section class="panel"><div class="panel-title"><h2>Последние тесты</h2><button class="textbutton" data-page="stats">Все результаты →</button></div>${progress.sessions.length?[...progress.sessions].reverse().slice(0,4).map(sessionRow).join(''):empty('Здесь появятся твои результаты.<br>Начни с небольшой тренировки.','test')}</section></div><section class="panel"><div class="panel-title"><h2>Твой прогресс по темам</h2></div>${bank.topics.map(t=>{const st=topicStats(t.id), pct=Math.round(st.mastered/t.count*100);return `<div class="topic-row">${topicIcon(t)}<span class="name">${esc(t.title)}</span><span class="bar"><i style="width:${pct}%;background:${palette[bank.topics.indexOf(t)]}"></i></span><b>${pct}%</b></div>`;}).join('')}<div class="section-footer">Доля заданий, последний ответ на которые верный.</div></section></div>`;
  }
  function topicsPage() {
    const shown=bank.topics.filter(t=>t.title.toLowerCase().includes(topicSearch.toLowerCase()));
    return heading('Выбор тем','Одна тема или несколько разделов — решать тебе.')+
      `<div class="toolbar"><div class="search">${icon('search')}<input id="topic-search" placeholder="Поиск по темам…" value="${esc(topicSearch)}" aria-label="Поиск по темам"></div><button class="textbutton" data-action="select-all">Выбрать все</button><button class="textbutton" data-action="select-none">Снять выбор</button></div><div class="topic-grid">${shown.map(t=>{const st=topicStats(t.id);return `<label class="topic-card ${selected.has(t.id)?'selected':''}">${topicIcon(t)}<span class="grow"><b>${esc(t.title)}</b><small>${t.count} заданий · пройдено ${st.done}<span class="bar"><i style="width:${st.done/t.count*100}%"></i></span></small></span><input type="checkbox" data-topic="${t.id}" ${selected.has(t.id)?'checked':''} aria-label="Выбрать ${esc(t.title)}"></label>`;}).join('') || empty('Такой темы нет. Измени запрос.','search')}</div><div class="sticky-actions"><div><span class="selection-count" id="selection-count">${selectedLabel()}</span><small>Задания будут в случайном порядке</small></div><button class="button" data-page="setup" ${selected.size?'':'disabled'}>Настроить тест ${icon('arrow')}</button></div>`;
  }
  function selectedLabel() { return `Тем выбрано: ${selected.size} · ${bank.tasks.filter(t=>selected.has(t.topic)).length} заданий`; }
  function available() { return retryIds ? bank.tasks.filter(t=>retryIds.includes(t.id) && selected.has(t.topic)) : E.pool(bank.tasks,[...selected],mode,progress.attempts,days,Date.now(),progress.bookmarks); }
  function setup() {
    const pool=available(); count=Math.max(1,Math.min(count,Math.max(1,pool.length)));
    const modes=[['all','Все задания','Случайный набор из выбранных тем'],['wrong','Только ошибки','Последний ответ был неверным'],['old','Давно не решённые','Новые и не решавшиеся '+days+' дней'],['new','Только новые','Ещё ни одной попытки'],['saved','Избранное','Задания с твоей закладкой']];
    return `<div class="setup">${heading('Настрой свою тренировку','Небольшие шаги каждый день дают большой результат.')}<section class="panel"><div class="panel-title"><h2>Выбранные темы (${selected.size})</h2><button class="textbutton" data-page="topics">Изменить</button></div><div class="chips">${bank.topics.filter(t=>selected.has(t.id)).map(t=>`<span class="chip">${esc(t.title)}</span>`).join('')||'<small>Выбери хотя бы одну тему.</small>'}</div></section><section class="panel"><h2>Какие задания включить?</h2><div class="mode-grid">${modes.map(([id,title,desc])=>`<label class="mode-card"><input type="radio" name="mode" value="${id}" ${mode===id?'checked':''}><span><b>${title}</b><small>${desc}</small></span></label>`).join('')}</div>${mode==='old'?`<label class="checkline">Не решались минимум <select id="days" aria-label="Количество дней">${[3,7,14,30].map(d=>`<option value="${d}" ${days===d?'selected':''}>${d} дней</option>`).join('')}</select></label>`:''}</section><section class="panel"><div class="panel-title"><h2>Количество заданий</h2><span class="pill">Доступно: ${pool.length}</span></div><div class="countrow"><input id="count-range" type="range" min="1" max="${Math.max(pool.length,1)}" value="${count}" aria-label="Количество заданий"><input id="count" type="number" min="1" max="${Math.max(pool.length,1)}" value="${count}" aria-label="Количество заданий числом"></div><div class="presets">${[5,10,20,50].filter(n=>n<=pool.length).map(n=>`<button class="preset ${count===n?'on':''}" data-count="${n}">${n}</button>`).join('')}<button class="preset" data-count="${Math.max(pool.length,1)}">Все</button></div><label class="checkline"><input id="mix" type="checkbox" ${mix?'checked':''}>Перемешивать варианты ответов</label><div class="note">${icon('bolt')} Ответ проверяется сразу. После проверки можно открыть разбор, а затем продолжить тест. Числовой допуск берётся из исходного банка.</div></section>${!pool.length?empty('В этом режиме пока нет заданий. Выбери другой режим или темы.','repeat'):''}<button class="button wide" data-action="start" ${pool.length?'':'disabled'}>Начать тест · ${Math.min(count,pool.length)} заданий ${icon('arrow')}</button></div>`;
  }
  function startQuiz() {
    if (!available().length) return;
    if(progress.active) return confirmDialog('Начать новый тест?','Ответы текущего теста останутся в статистике. Продолжить его после начала нового уже не получится.', 'Начать новый',createQuiz);
    createQuiz();
  }
  function createQuiz() {
    if (corruptStorage) return go('settings');
    if(progress.active) {const s=progress.sessions.find(s=>s.id===progress.active.sessionId);if(s){s.endedAt=new Date().toISOString();s.abandoned=true;}}
    const ids=E.shuffle(available()).slice(0,count).map(t=>t.id);if(!ids.length)return;
    const id=crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2);
    const orders={};for(const tid of ids){const t=taskMap.get(tid);if(t.options)orders[tid]=(mix?E.shuffle(t.options):t.options).map(o=>o.id);}
    progress.sessions.push({id,taskIds:ids,startedAt:new Date().toISOString(),endedAt:null,mode,topics:[...selected],label:selected.size===1?topic([...selected][0]).title:'Смешанный тест'});
    progress.active={sessionId:id,ids,index:0,orders};quizDraft=[];draftTask=null;save();go('quiz');
  }
  function currentAttempt() { const a=progress.active;return a?progress.attempts.find(x=>x.sessionId===a.sessionId && x.taskId===a.ids[a.index]):null; }
  function answerMarkup(t, answers=[], checked=false) {
    const disabled=checked?'disabled':'';
    if(t.options){const order=progress.active?.orders[t.id]||t.options.map(o=>o.id);return order.map(id=>{const o=t.options.find(o=>o.id===id);if(!o)return '';const picked=answers.includes(id);return `<label class="option ${checked && t.answer.includes(id)?'correct':checked && picked?'wrong':''}"><input type="${t.type==='multiple'?'checkbox':'radio'}" name="answer-choice" value="${id}" ${picked?'checked':''} ${disabled}><span>${rich(o.text)}</span></label>`;}).join('');}
    if(t.type==='number')return t.fields.map((f,i)=>`<label class="numeric-field"><span>${rich(f.label)}</span><input class="answer" data-answer="${i}" inputmode="decimal" autocomplete="off" value="${esc(answers[i]||'')}" ${disabled} placeholder="Твой ответ" aria-label="${esc(clean(f.label))}"></label>`).join('')+'<p class="focus-info">Десятичную дробь можно вводить через точку или запятую.</p>';
    if(t.type==='matching')return t.pairs.map((p,i)=>`<label class="matchrow"><span>${rich(p.left)}</span><select data-answer="${i}" ${disabled} aria-label="Соответствие для ${esc(p.left)}"><option value="">Номер</option>${t.pairs.map((_,j)=>`<option value="${j+1}" ${answers[i]===String(j+1)?'selected':''}>${j+1}</option>`).join('')}</select></label>`).join('')+`<div class="match-options">${t.pairs.map((p,i)=>`<div><b>${i+1})</b> ${rich(p.right)}</div>`).join('')}</div>`;
    let i=0;return '<div class="blanks-text">'+rich(t.template).replace(/\[(?!IMG:)([^\]]+)\]/g,()=>{const n=i++;return `<input class="${t.answer[n]?.length>10?'long':''}" data-answer="${n}" value="${esc(answers[n]||'')}" ${disabled} autocomplete="off" aria-label="Пропуск ${n+1}" placeholder="${n+1}" spellcheck="false">`;})+'</div><p class="focus-info">Заполни все пропуски. Двоичные разряды вводи в том порядке, который указан в условии.</p>';
  }
  function answerText(t, supplied=t.answer) {
    if(t.options)return supplied.map(id=>rich(t.options.find(o=>o.id===id)?.text||'')).join('; ');
    if(t.type==='number')return t.fields.map((f,i)=>`${esc(f.label)}: <b>${esc(supplied[i]??'—')}</b>${supplied===t.answer && f.tolerance?' <small>(± '+String(f.tolerance).replace('.',',')+')</small>':''}`).join('<br>');
    if(t.type==='matching')return supplied.map((v,i)=>`${esc(t.pairs[i].left)} → ${esc(v)}`).join('; ');
    return `<span class="answer-value">${supplied.map(esc).join(' · ')}</span>`;
  }
  function quiz() {
    const a=progress.active;if(!a)return empty('Нет активного теста. Выбери темы и начни тренировку.','test')+button('Настроить тест','setup');
    const t=taskMap.get(a.ids[a.index]), attempt=currentAttempt();
    if(draftTask!==t.id){draftTask=t.id;quizDraft=Array.isArray(a.draft)?a.draft:[];}
    const answers=attempt?attempt.answers:quizDraft, bookmarked=progress.bookmarks.includes(t.id);
    return `<div class="quiz-layout"><div class="quiz-head"><button class="button secondary small" data-page="home" aria-label="Вернуться на главную">${icon('back')}</button><b>Вопрос ${a.index+1} из ${a.ids.length}</b><button class="button ${bookmarked?'':'outline'} small" data-bookmark="${t.id}" aria-label="${bookmarked?'Убрать из избранного':'В избранное'}" aria-pressed="${bookmarked}">${icon('save')}</button></div><div class="progress"><div style="width:${(a.index+(attempt?1:0))/a.ids.length*100}%"></div></div><section class="panel question"><div class="quiz-meta"><span class="pill">${esc(topic(t.topic).title)}</span><span>Банк · № ${t.id}</span></div><div class="prompt">${t.promptHtml || rich(t.prompt)}</div><p class="instruction">${esc(t.instruction)}</p><div id="answer-area">${answerMarkup(t,answers,!!attempt)}</div>${attempt?`<div class="feedback ${attempt.correct?'':'error'}" role="status"><h3>${icon(attempt.correct?'check':'close')} ${attempt.correct?'Верно!':attempt.skipped?'Вопрос пропущен':'Пока неверно'}</h3><p>${attempt.correct?'Отлично, продолжай в том же духе.':'Разбери решение — так материал запоминается лучше.'}</p></div><div class="details-answer"><b>Правильный ответ</b>${answerText(t)}</div><button class="button outline wide" data-action="solution">${icon('book')} ${showSolution?'Скрыть подробное решение':'Открыть подробное решение'}</button>${showSolution?`<section class="solution"><h2>Разбор задания № ${t.id}</h2><div class="markdown">${markdown(t.solution)}</div><details><summary>Теория по теме</summary><div class="markdown">${markdown(topic(t.topic).theory)}</div></details></section>`:''}<div class="quiz-actions"><span class="muted" style="font-size:12px">Ответ сохранён</span>${button((a.index===a.ids.length-1?'Завершить тест':'Следующий вопрос')+' '+icon('arrow'),'next')}</div>`:`<div class="quiz-actions">${button('Пропустить','skip','secondary')}${button('Проверить ответ','check')}</div>`}</section></div>`;
  }
  function readAnswers(t) { if(t.options)return [...document.querySelectorAll('[name="answer-choice"]:checked')].map(e=>e.value);return [...document.querySelectorAll('[data-answer]')].sort((a,b)=>Number(a.dataset.answer)-Number(b.dataset.answer)).map(e=>e.value.trim()); }
  function checkAnswer(skipped=false) {
    const a=progress.active;if(!a || currentAttempt())return;
    const t=taskMap.get(a.ids[a.index]), answers=readAnswers(t);
    if(!skipped && (!answers.length || answers.some(s=>!s.trim())))return toast('Сначала заполни ответ целиком.');
    progress.attempts.push({taskId:t.id,sessionId:a.sessionId,answers,correct:skipped?false:E.grade(t,answers),skipped,at:new Date().toISOString()});
    delete a.draft;save();showSolution=false;render();
  }
  function nextQuestion() {
    const a=progress.active;if(!a || !currentAttempt())return;
    if(a.index===a.ids.length-1){const s=progress.sessions.find(s=>s.id===a.sessionId);s.endedAt=new Date().toISOString();resultId=s.id;progress.active=null;save();go('result');}
    else {a.index++;delete a.draft;quizDraft=[];draftTask=null;save();showSolution=false;render();window.scrollTo(0,0);}
  }
  function taskRow(t, attempt) {
    const status=!attempt?'new':attempt.correct?'':'wrong';
    return `<div class="list-row"><span class="status-icon ${status}">${icon(!attempt?'clock':attempt.correct?'check':'close')}</span><button class="textbutton grow" data-detail="${t.id}" style="text-align:left;color:inherit;min-width:0"><b>Задание № ${t.id} <span class="pill">${esc(t.sourceTopic)}</span></b><div class="preview">${esc(clean(t.prompt))}</div><small>${attempt?(attempt.skipped?'Пропущено':attempt.correct?'Верно':'Неверно')+' · '+fmtDate(attempt.at):'Ещё не решено'}</small></button><button class="textbutton" data-detail="${t.id}" aria-label="Открыть задание ${t.id}">${icon('arrow')}</button></div>`;
  }
  function resultPage() {
    const s=progress.sessions.find(s=>s.id===resultId)||progress.sessions.filter(s=>s.endedAt).at(-1);
    if(!s)return empty('Здесь появятся результаты завершённых тестов.','trophy');resultId=s.id;
    const attempts=progress.attempts.filter(a=>a.sessionId===s.id), correct=attempts.filter(a=>a.correct).length, incorrect=attempts.filter(a=>!a.correct).length;
    const duration=Math.max(0,Math.round((Date.parse(s.endedAt||new Date().toISOString())-Date.parse(s.startedAt))/60000));
    return `<div class="quiz-layout">${heading('Результаты теста',fmtDate(s.startedAt))}<section class="panel result-hero"><span class="eyebrow">${s.endedAt?'Тренировка завершена':'Промежуточный результат'}</span><div class="result-circle">${Math.round(correct/s.taskIds.length*100)}%</div><h2>${correct} из ${s.taskIds.length} — верно</h2><p class="muted">${incorrect? 'Каждая разобранная ошибка — шаг к уверенному ответу.':'Хорошая работа. Продолжай закреплять знания.'}</p><div class="chips" style="justify-content:center;margin:20px 0"><span class="chip">${correct} верных</span><span class="chip">${incorrect} неверных</span><span class="chip">${s.taskIds.length-attempts.length} без ответа</span><span class="chip">${duration} мин</span></div><div class="result-actions">${button('Повторить неверные','retry-errors','secondary')}${button('Ещё одна тренировка','setup')}</div></section><section class="panel tasklist"><div class="panel-title"><h2>Все вопросы теста</h2><small>Нажми для разбора</small></div>${s.taskIds.map(id=>taskRow(taskMap.get(id),attempts.find(a=>a.taskId===id))).join('')}</section></div>`;
  }
  let statsLimit=40;
  function statsPage() {
    const last=E.latest(progress.attempts);
    if(statsFilter==='sessions') return heading('Статистика','Твои результаты и темы, которым стоит уделить внимание.')+metrics()+statsTabs()+`<section class="panel">${[...progress.sessions].reverse().map(sessionRow).join('')||empty('Пока нет тестов. Начни первую тренировку.','test')}</section>`;
    const tasks=bank.tasks.filter(t=>(statsTopic==='all'||t.topic===statsTopic) && (statsFilter!=='wrong'||(last[t.id]&&!last[t.id].correct)) && (statsFilter!=='correct'||last[t.id]?.correct) && (statsFilter!=='saved'||progress.bookmarks.includes(t.id)) && (statsFilter!=='new'||!last[t.id]) && (`${t.id} ${t.prompt} ${t.sourceTopic}`.toLowerCase().includes(statsSearch.toLowerCase())));
    return heading('Статистика','Твои результаты и темы, которым стоит уделить внимание.',button('Повторить ошибки','wrong-setup','small'))+metrics()+statsTabs()+`<div class="toolbar"><div class="search">${icon('search')}<input id="stats-search" value="${esc(statsSearch)}" placeholder="Номер задания или слова из условия…" aria-label="Поиск задания"></div><select id="stats-topic" aria-label="Фильтр по теме"><option value="all">Все темы</option>${bank.topics.map(t=>`<option value="${t.id}" ${statsTopic===t.id?'selected':''}>${esc(t.title)}</option>`).join('')}</select></div><section class="panel tasklist"><div class="panel-title"><h2>Задания</h2><small>Найдено: ${tasks.length}</small></div>${tasks.slice(0,statsLimit).map(t=>taskRow(t,last[t.id])).join('')||empty('Заданий по этим условиям пока нет.','search')}${tasks.length>statsLimit?button('Показать ещё','more-stats','outline wide'):''}</section>`;
  }
  function statsTabs() {return `<div class="filter-tabs">${[['all','Все'],['wrong','Ошибки'],['correct','Верные'],['new','Новые'],['saved','Избранное'],['sessions','Тесты']].map(([id,label])=>`<button data-filter="${id}" class="${statsFilter===id?'active':''}">${label}</button>`).join('')}</div>`;}
  function detailPage() {
    const t=taskMap.get(detailId);if(!t)return empty('Выбери задание в статистике.');
    const attempts=progress.attempts.filter(a=>a.taskId===t.id).slice().reverse(), last=attempts[0];
    return `<div class="quiz-layout"><div class="quiz-head"><button class="button secondary small" data-page="${returnPage}">${icon('back')} Назад</button><b>Задание № ${t.id}</b><button class="button outline small" data-bookmark="${t.id}" aria-pressed="${progress.bookmarks.includes(t.id)}" aria-label="Избранное">${icon('save')}</button></div><section class="panel question"><div class="quiz-meta"><span class="pill">${esc(topic(t.topic).title)}</span><span>${attempts.length} попыток</span></div><div class="prompt">${t.promptHtml || rich(t.prompt)}</div>${answerMarkup(t,last?.answers||[],true)}<div class="details-answer"><b>Правильный ответ</b>${answerText(t)}</div><div class="solution markdown">${markdown(t.solution)}</div></section><section class="panel"><h2>История ответов</h2>${attempts.map(a=>`<div class="list-row"><span class="status-icon ${a.correct?'':'wrong'}">${icon(a.correct?'check':'close')}</span><div class="grow"><b>${a.skipped?'Пропущено':a.correct?'Верно':'Неверно'}</b><small>${fmtDate(a.at)}</small><div style="font-size:12px">${a.skipped?'—':answerText(t,a.answers)}</div></div></div>`).join('')||empty('Ещё не было попыток.','clock')}</section></div>`;
  }
  function theoryPage() {const t=topic(theoryTopic);return heading('Твоя метода','Понятные объяснения, формулы и иллюстрации из материалов.')+`<div class="theory-pick"><select id="theory-topic" aria-label="Тема методических материалов">${bank.topics.map(t=>`<option value="${t.id}" ${t.id===theoryTopic?'selected':''}>${esc(t.title)}</option>`).join('')}</select>${button('Потренировать тему','practice-topic','small')}</div><article class="panel markdown">${markdown(t.theory)}</article>`;}
  function settingsPage() {
    return heading('Настройки и перенос','Твои данные принадлежат тебе. Сохраняй их там, где удобно.')+`<section class="panel"><h2>Прогресс и резервная копия</h2><div class="settings-row"><div><b>Перенести результаты на другое устройство</b><p>Скачай файл, передай его на телефон или компьютер и выбери «Загрузить». Импорт заменяет текущий прогресс.</p></div><div class="buttons">${button(icon('download')+' Скачать','export','small')}${button('Загрузить','import','outline small')}</div></div><div class="settings-row"><div><b>Банк заданий SQLite</b><p>Все 529 заданий, ответы, разборы, теория и изображения в одном файле. Прогресс хранится отдельно в браузере.</p></div><a class="button outline small" href="bank.sqlite" download>Скачать SQLite</a></div>${corruptStorage?`<div class="settings-row"><div><b>Восстановление хранилища</b><p>Скачай исходные данные перед сбросом или импортируй рабочую копию.</p></div>${button('Скачать исходные данные','raw-export','outline small')}</div>`:''}<div class="settings-row"><div><b>Сбросить прогресс</b><p>Удалить ответы, историю тестов и закладки с этого устройства.</p></div>${button('Сбросить','reset','danger small')}</div></section><section class="panel"><h2>Установить приложение</h2><div class="settings-row"><div><b>Android · Chrome</b><p>Открой приложение по защищённому адресу HTTPS, затем меню браузера → «Добавить на главный экран» → «Установить».</p></div>${button('Установить','install','small')}</div><div class="settings-row"><div><b>iPhone · Safari</b><p>Открой HTTPS-адрес в Safari → «Поделиться» → «На экран Домой». Перед первым запуском без интернета дождись сообщения «Готово к работе офлайн».</p></div></div><div class="settings-row"><div><b>Компьютер · Windows</b><p>Запусти «Запустить.cmd» из папки приложения. Установки Python и Node.js не требуется. В Chrome или Edge приложение можно установить кнопкой в адресной строке.</p></div></div><div class="note">${icon('shield')} ${esc(offlineState)}. ${location.protocol==='file:'?'Сейчас приложение открыто как файл. Для установки и надёжного сохранения прогресса используй запуск через «Запустить.cmd» или HTTPS.':'Для установки на телефон нужен HTTPS. Адрес компьютера в домашней Wi-Fi-сети позволяет открыть приложение, но не даёт полноценную офлайн-установку.'}</div></section><section class="panel"><h2>О материалах</h2><p class="muted">Банк: ${esc(bank.source)}. Пояснения — из папки «Метода». Разборы сохранены в том виде, в котором есть в конспектах: часть содержит вычисления по шагам, часть — общий алгоритм и конкретный ответ.</p><p class="muted">Правильность ответа сверяется с исходным банком. Для чисел используются его допуски; отдельная независимая проверка всех ответов не проводилась.</p><p class="muted">Синхронизация между устройствами — через файл прогресса. Очищая данные браузера, можно удалить результаты, поэтому периодически скачивай резервную копию.</p></section><input class="import-input" type="file" id="import-file" accept=".json,application/json">`;
  }
  function download(text,name,type='application/json') {const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function confirmDialog(title,message,label,callback) {
    const d=document.createElement('dialog');d.innerHTML=`<h2>${esc(title)}</h2><p>${esc(message)}</p><div class="buttons"><button class="button secondary" id="cancel-dialog">Отмена</button><button class="button" id="confirm-dialog">${esc(label)}</button></div>`;document.body.append(d);d.showModal();d.querySelector('#cancel-dialog').onclick=()=>d.close();d.querySelector('#confirm-dialog').onclick=()=>{d.close();callback();};d.onclose=()=>d.remove();
  }
  async function importProgress(file) {
    if(!file)return;
    if(file.size>30*1024*1024)return toast('Файл слишком большой. Максимум — 30 МБ.');
    try{const incoming=JSON.parse(await file.text());if(!validProgress(incoming))throw Error('schema');confirmDialog('Загрузить прогресс?','Текущий прогресс будет заменён. Сначала скачай свою копию, если она нужна.','Загрузить',()=>{progress=incoming;corruptStorage=false;draftTask=null;quizDraft=[];save();render();toast('Прогресс восстановлен.');});}
    catch(e){toast('Не удалось прочитать файл прогресса. Выбери JSON, скачанный из этого приложения.');}
  }
  const actions={
    setup:()=>go('setup'),resume:()=>go('quiz'),start:startQuiz,check:()=>checkAnswer(),skip:()=>checkAnswer(true),next:nextQuestion,
    solution:()=>{showSolution=!showSolution;render();},
    'select-all':()=>{selected=new Set(bank.topics.map(t=>t.id));render();},'select-none':()=>{selected.clear();render();},
    'wrong-setup':()=>{retryIds=null;mode='wrong';selected=new Set(bank.topics.map(t=>t.id));go('setup');},
    'more-stats':()=>{statsLimit+=40;render();},
    'practice-topic':()=>{retryIds=null;selected=new Set([theoryTopic]);mode='all';go('setup');},
    'retry-errors':()=>{const s=progress.sessions.find(s=>s.id===resultId);if(!s)return;const wrong=progress.attempts.filter(a=>a.sessionId===s.id&&!a.correct).map(a=>a.taskId);if(!wrong.length)return toast('В этом тесте нет неверных ответов.');retryIds=wrong;mode='wrong';selected=new Set(wrong.map(id=>taskMap.get(id).topic));count=wrong.length;go('setup');toast('Включены только неверные задания из этого теста. Выбор другого режима снимет ограничение.');},
    export:()=>download(JSON.stringify(progress,null,2),'tiik-progress-'+new Date().toISOString().slice(0,10)+'.json'),
    'raw-export':()=>{let raw;try{raw=localStorage.getItem(KEY);}catch{}download(raw||'{}','tiik-progress-recovery.json');},
    import:()=>$('#import-file').click(),
    reset:()=>confirmDialog('Сбросить прогресс?','История ответов, тестов и избранное будут удалены из этого браузера. Банк заданий останется.','Сбросить',()=>{progress=fresh();corruptStorage=false;draftTask=null;save();render();toast('Прогресс сброшен.');}),
    install:async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;}else toast(location.protocol==='file:'?'Для установки запусти приложение через «Запустить.cmd» или открой HTTPS-адрес.':'Открой меню браузера и выбери «Установить» / «На экран Домой». Для телефона нужен HTTPS.');}
  };
  function render() {
    const views={home,topics:topicsPage,setup,quiz,result:resultPage,stats:statsPage,detail:detailPage,theory:theoryPage,settings:settingsPage};
    if(!views[page])page='home';
    $('#app').innerHTML=shell(views[page]());
    if(window.renderMathInElement)renderMathInElement($('#app'),{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],throwOnError:false,strict:false,trust:false});
    if(window.mermaid){
      const nodes=[];
      document.querySelectorAll('code.language-mermaid').forEach(code=>{
        const diagram=document.createElement('div');diagram.className='mermaid';
        diagram.textContent=code.textContent.replace(/\[([^\]\n]+)\]/g,(_,label)=>'["'+label.replace(/"/g,"'")+'"]')
          .replace(/\{([^}\n]+)\}/g,(_,label)=>'{"'+label.replace(/"/g,"'")+'"}');
        code.parentElement.replaceWith(diagram);nodes.push(diagram);
      });
      if(nodes.length)mermaid.run({nodes,suppressErrors:true}).catch(()=>{});
    }
  }
  document.addEventListener('click',e=>{
    const el=e.target.closest('[data-page],[data-action],[data-mode-start],[data-count],[data-bookmark],[data-filter],[data-detail],[data-result]');
    if(el){if(el.disabled)return;
      if(el.dataset.page)go(el.dataset.page);
      else if(el.dataset.action)actions[el.dataset.action]?.();
      else if(el.dataset.modeStart){retryIds=null;mode=el.dataset.modeStart;selected=new Set(bank.topics.map(t=>t.id));go('setup');}
      else if(el.dataset.count){count=Number(el.dataset.count);render();}
      else if(el.dataset.bookmark){const id=Number(el.dataset.bookmark);progress.bookmarks=progress.bookmarks.includes(id)?progress.bookmarks.filter(v=>v!==id):[...progress.bookmarks,id];save();render();}
      else if(el.dataset.filter){statsFilter=el.dataset.filter;statsLimit=40;render();}
      else if(el.dataset.detail){detailId=Number(el.dataset.detail);returnPage=page==='result'?'result':'stats';go('detail');}
      else if(el.dataset.result){resultId=el.dataset.result;go('result');}
    }
    const img=e.target.closest('.task-image,.markdown img');if(img){const overlay=document.createElement('div');overlay.className='lightbox';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','Увеличенная иллюстрация');const enlarged=document.createElement('img');enlarged.src=img.src;enlarged.alt=img.alt;overlay.append(enlarged);const close=document.createElement('button');close.textContent='Закрыть ×';overlay.append(close);overlay.onclick=()=>overlay.remove();document.body.append(overlay);close.focus();}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')$('.lightbox')?.remove();if(e.key==='Enter'&&page==='quiz'&&!e.target.closest('button,select,details')){e.preventDefault();currentAttempt()?nextQuestion():checkAnswer();}});
  document.addEventListener('input',e=>{
    const t=e.target;
    if(t.id==='topic-search'){topicSearch=t.value;rerenderSearch(t.id);}
    if(t.id==='stats-search'){statsSearch=t.value;statsLimit=40;rerenderSearch(t.id);}
    if(t.id==='count-range'||t.id==='count'){count=Math.max(1,Math.min(Number(t.value)||1,Math.max(available().length,1)));$('#count').value=count;$('#count-range').value=count;document.querySelector('[data-action="start"]').innerHTML=`Начать тест · ${Math.min(count,available().length)} заданий ${icon('arrow')}`;}
    if(page==='quiz' && t.closest('#answer-area') && !currentAttempt()){quizDraft=readAnswers(taskMap.get(progress.active.ids[progress.active.index]));progress.active.draft=quizDraft;save();}
  });
  function rerenderSearch(id){const el=$('#'+id),pos=el.selectionStart;render();const next=$('#'+id);next.focus();next.setSelectionRange(pos,pos);}
  document.addEventListener('change',e=>{
    const t=e.target;
    if(t.dataset.topic){t.checked?selected.add(t.dataset.topic):selected.delete(t.dataset.topic);t.closest('.topic-card').classList.toggle('selected',t.checked);$('#selection-count').textContent=selectedLabel();$('.sticky-actions button').disabled=!selected.size;}
    if(t.name==='mode'){retryIds=null;mode=t.value;render();}
    if(t.id==='days'){days=Number(t.value);render();}
    if(t.id==='mix')mix=t.checked;
    if(t.id==='stats-topic'){statsTopic=t.value;statsLimit=40;render();}
    if(t.id==='theory-topic'){theoryTopic=t.value;render();}
    if(t.id==='import-file')importProgress(t.files[0]);
    if(page==='quiz' && t.closest('#answer-area') && !currentAttempt()){quizDraft=readAnswers(taskMap.get(progress.active.ids[progress.active.index]));progress.active.draft=quizDraft;save();}
  });
  window.addEventListener('hashchange',()=>{const next=location.hash.slice(1)||'home';if(next!==page){page=next;showSolution=false;render();window.scrollTo(0,0);}});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
  function offlineLabel(value){offlineState=value;const el=$('#offline-label');if(el)el.textContent=value;}
  if('serviceWorker' in navigator && location.protocol!=='file:') {
    navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='offline-ready'){offlineLabel('Готово к работе офлайн');toast('Все задания и иллюстрации сохранены. Можно заниматься без интернета.');}if(e.data?.type==='offline-error'){offlineLabel('Офлайн-копия не загружена');toast('Не удалось загрузить офлайн-копию. Перезапусти приложение с интернетом.');}});
    navigator.serviceWorker.register('./sw.js').then(async ()=>{await navigator.serviceWorker.ready;if(await caches.match(new URL('./offline-ready',location.href)))offlineLabel('Готово к работе офлайн');}).catch(()=>offlineLabel('Офлайн-установка недоступна'));
  }
  render();
})();
