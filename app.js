'use strict';
const ROOMS = COPY.rooms;
document.title = COPY.meta.title;
const app = document.getElementById('app');
let game = null, timer = null, phase = 'setup', index = 0, queue = [], draft = null, deadline = 0, paused = false, pauseLeft = 0, task = null, count = 6;
const $ = id => document.getElementById(id), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ui = (template, values) => esc(copy(template, values));
const rulesFor = (g = game) => g?.rules || preferences;
const turnSeconds = () => rulesFor().turnSeconds;

/* ---------- game rules and task generation ---------- */
function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const b = new Uint32Array(1); crypto.getRandomValues(b); const j = Math.floor(b[0] / 4294967296 * (i + 1));[a[i], a[j]] = [a[j], a[i]] } return a }
function createGame(names) { const rules = newGameRules(names.length), n = rules.impostorCount, ids = new Set(shuffle(names.map((_, i) => i)).slice(0, n)); return { players: names.map((name, id) => ({ id, name, role: ids.has(id) ? 'imp' : 'crew', alive: true, cooldown: 0 })), rules, round: 0, progress: 0, goal: (names.length - n) * rules.tasksPerCrew, actions: {}, votes: {}, events: [], winner: null } }
function winner(g) { const alive = g.players.filter(p => p.alive), i = alive.filter(p => p.role === 'imp').length, c = alive.length - i; if (!i) return 'crew'; if (i >= c) return 'imp'; if (g.progress >= g.goal) return 'crew'; return null }
function resolve(g) {
  const alive = g.players.filter(p => p.alive), events = [], victims = new Set(); let earned = 0, sabotages = 0;
  g.roundLog = { round: g.round, rooms: ROOMS.map((name, room) => ({ room, name, visitors: alive.filter(p => g.actions[p.id]?.room === room).map(p => ({ id: p.id, name: p.name })) })), before: g.progress };
  for (const p of alive) { const a = g.actions[p.id]; if (p.role === 'crew' && a && a.done) earned++; if (p.role === 'imp' && a && a.kind === 'sabotage') sabotages++ }
  for (const p of alive) { const a = g.actions[p.id]; if (p.role === 'imp' && a && a.kind === 'kill' && p.cooldown === 0) { const t = alive.find(x => x.id === a.target && x.role === 'crew'); if (t && g.actions[t.id] && a.room === g.actions[t.id].room) victims.add(t.id); p.cooldown = rulesFor(g).killCooldown + 1 } }
  for (const id of victims) { const p = g.players[id], room = g.actions[id].room, occupants = alive.filter(x => g.actions[x.id]?.room === room).length; p.alive = false; events.push({ id: p.id, name: p.name, room, occupants }) }
  const lost = Math.min(earned, sabotages); g.progress = Math.min(g.goal, g.progress + earned - lost); for (const p of alive) p.cooldown = Math.max(0, p.cooldown - 1);
  g.events = events; g.summary = { earned, lost, sabotages }; g.roundLog.gained = g.progress - g.roundLog.before; g.winner = winner(g); return g
}
function resolveVote(g) { const totals = {}; for (const v of Object.values(g.votes)) totals[v] = (totals[v] || 0) + 1; const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]); let expelled = null; if (ranked.length && ranked[0][0] !== 'skip' && (!ranked[1] || ranked[0][1] > ranked[1][1])) { expelled = g.players.find(p => p.id === Number(ranked[0][0]) && p.alive); if (expelled) expelled.alive = false } g.winner = winner(g); return { totals, expelled } }
const TASKS = COPY.tasks;
const TASK_MARKS = [
  { symbol: '◆', color: 'var(--hi)', label: COPY.codes.wires[0], sample: COPY.samples.types[0] },
  { symbol: '●', color: '#207983', label: COPY.codes.wires[1], sample: COPY.samples.types[1] },
  { symbol: '▲', color: '#7752a8', label: COPY.codes.wires[2], sample: COPY.samples.types[2] }
];
function rotatePorts(mask) { return ((mask << 1) | (mask >> 3)) & 15 }
function circuitPower(t) {
  const powered = new Set(), directions = [[-3, 1, 4], [1, 2, 8], [3, 4, 1], [-1, 8, 2]];
  if (t.tiles[3] & 8) powered.add(3);
  const pending = [...powered];
  while (pending.length) {
    const cell = pending.shift();
    for (const [offset, port, opposite] of directions) {
      const next = cell + offset;
      if (next < 0 || next > 8 || (Math.abs(offset) === 1 && Math.floor(next / 3) !== Math.floor(cell / 3))) continue;
      if ((t.tiles[cell] & port) && (t.tiles[next] & opposite) && !powered.has(next)) { powered.add(next); pending.push(next) }
    }
  }
  return { powered, solved: powered.has(5) && Boolean(t.tiles[5] & 2) }
}
function makeTask(p) {
  if (!p.taskBag?.length) {
    p.taskBag = shuffle(Object.keys(TASKS));
    const last = p.taskBag.length - 1;
    if (p.taskBag[last] === p.lastTask) [p.taskBag[0], p.taskBag[last]] = [p.taskBag[last], p.taskBag[0]];
  }
  const type = p.taskBag.pop(); p.lastTask = type;
  if (type === 'wires') {
    const inputOrder = shuffle([0, 1, 2]), outputOrder = shuffle([0, 1, 2]);
    if (inputOrder.every((id, i) => outputOrder[i] === id)) outputOrder.push(outputOrder.shift());
    return { type, inputOrder, outputOrder, connected: [], selected: null }
  }
  if (type === 'circuit') {
    const path = shuffle([[3, 0, 1, 4, 5], [3, 4, 1, 2, 5], [3, 6, 7, 4, 5], [3, 4, 7, 8, 5]])[0];
    const solution = Array.from({ length: 9 }, () => shuffle([3, 5, 6, 9, 10, 12])[0]);
    const portTo = (from, to) => to === from - 3 ? 1 : to === from + 1 ? 2 : to === from + 3 ? 4 : 8;
    path.forEach((cell, i) => { solution[cell] = (i ? portTo(cell, path[i - 1]) : 8) | (i < path.length - 1 ? portTo(cell, path[i + 1]) : 2) });
    let tiles, attempts = 0;
    do {
      tiles = [...solution];
      shuffle(path).slice(0, 3).forEach(cell => { for (let turn = 0; turn < 3; turn++) tiles[cell] = rotatePorts(tiles[cell]) });
    } while (circuitPower({ tiles }).solved && ++attempts < 20);
    if (circuitPower({ tiles }).solved) { while (tiles[3] & 8) tiles[3] = rotatePorts(tiles[3]) }
    return { type, tiles, solution, path }
  }
  if (type === 'radar') {
    const [x, y] = shuffle([[1, 1], [3, 1], [1, 3], [3, 3]])[0];
    const targets = Array.from({ length: 25 }, (_, i) => [i % 5, Math.floor(i / 5)]).filter(([tx, ty]) => { const d = Math.abs(tx - x) + Math.abs(ty - y); return d >= 3 && d <= 4 });
    const [targetX, targetY] = shuffle(targets)[0];
    return { type, x, y, targetX, targetY, startDistance: Math.abs(targetX - x) + Math.abs(targetY - y), heading: 0 }
  }
  if (type === 'power') return { type, targets: shuffle([30, 40, 50, 60, 70]).slice(0, 3), values: shuffle([10, 90, 10]), confirmed: false };
  if (type === 'samples') return { type, queue: shuffle([0, 1, 2, shuffle([0, 1, 2])[0]]), step: 0 };
  return { type, faults: shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 3), isolated: [], checked: [] }
}

/* ---------- ui helpers ---------- */
function stop() { clearInterval(timer); timer = null }
function show(html, theme = 'public') { document.body.dataset.screen = phase; document.body.dataset.theme = theme; stop(); app.innerHTML = html; window.scrollTo(0, 0) }
const sv = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  room: [sv('<circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>'), sv('<path d="M12 2l2 8 8 2-8 2-2 8-2-8-8-2 8-2z"/>'), sv('<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3M7.5 15h9"/>')],
  cover: sv('<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="3"/>'),
  sabotage: sv('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  kill: sv('<circle cx="12" cy="12" r="7"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>')
};
const PTS = [[50, 15], [81, 68], [19, 68]];
function station(btns) { return `<div class="station"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ring2" cx="50" cy="50" r="47"/><circle class="ring" cx="50" cy="50" r="35"/>${PTS.map(p => `<line x1="50" y1="50" x2="${p[0]}" y2="${p[1]}"/>`).join('')}<g class="orbiter"><circle class="sat" cx="50" cy="15" r="2"/></g><circle class="core" cx="50" cy="50" r="3.5"/></svg>${PTS.map((p, i) => btns ? `<button class="room" data-room="${i}" style="left:${p[0]}%;top:${p[1]}%">${ICON.room[i]}<span>${ROOMS[i]}</span></button>` : `<i class="node" style="left:${p[0]}%;top:${p[1]}%"></i>`).join('')}</div>` }
function status() {
  const g = game, pct = g.goal ? Math.round(g.progress / g.goal * 100) : 0;
  return `<div class="hud"><div class="hud-top"><span>${ui(COPY.common.round, { round: g.round })}</span><span>${ui(COPY.common.alive, { count: g.players.filter(p => p.alive).length })}</span></div><div class="meter" style="--p:${pct}%;--n:${g.goal}" role="progressbar" aria-label="${ui(COPY.common.progress)}" aria-valuemin="0" aria-valuemax="${g.goal}" aria-valuenow="${g.progress}"><i></i></div><div class="hud-top"><span>${ui(COPY.common.progress)}</span><b>${ui(COPY.common.taskTotal, { current: g.progress, total: g.goal })}</b></div></div>`
}
const chev = sv('<path d="M9 6l6 6-6 6"/>');
const settingsIcon = sv('<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2" fill="var(--card)"/><circle cx="16" cy="12" r="2" fill="var(--card)"/><circle cx="10" cy="18" r="2" fill="var(--card)"/>');
const RULES = COPY.rules.map((rule, i) => ({ ...rule, ic: [ICON.cover, ICON.room[0], ICON.kill, sv('<path d="M5 12l4 4 10-10"/>'), ICON.room[1]][i] }));

/* ---------- setup: home, players, rules ---------- */
let saved = [];
const logo = '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="20" cy="20" r="15" stroke-dasharray="3 4"/><circle cx="20" cy="20" r="5" fill="#f2550f" stroke="none"/><circle cx="35" cy="20" r="3.4" fill="currentColor" stroke="none"/></svg>';
function setup() {
  phase = 'setup'; game = null;
  show(`<div class="home-top"><header class="brand">${logo}<b class="k">${ui(COPY.meta.brand)}</b></header><button type="button" class="back" id="goSettings" aria-label="${ui(COPY.settings.open)}">${settingsIcon}</button></div>
 <section class="hero"><div class="hero-art">${station(false)}</div><div class="hero-copy"><h1>${ui(COPY.home.title)}</h1><p>${ui(COPY.home.description)}</p><div class="tags">${COPY.home.tags.map(tag => `<span>${ui(tag)}</span>`).join('')}</div></div></section>
 <div class="foot"><button class="btn pulse" id="goPlayers">${ui(COPY.home.start)}</button><button class="btn ghost" id="goRules">${ui(COPY.home.rules)}</button></div>`);
  $('goPlayers').onclick = playersScreen; $('goRules').onclick = () => rulesScreen(0); $('goSettings').onclick = () => settingsScreen('home')
}
function settingsSummary() {
  return `<button type="button" class="settings-summary" id="editSettings" aria-label="${ui(COPY.settings.open)}"><span class="settings-summary-icon" aria-hidden="true">${settingsIcon}</span><span class="settings-summary-text">${ui(COPY.settings.summary, { seconds: preferences.turnSeconds, tasks: preferences.tasksPerCrew })}</span><span class="settings-summary-edit">${ui(COPY.settings.edit)}</span></button>`
}
function impostorLabel(number) {
  return number === 1 ? COPY.setup.oneImpostor : number === 2 ? COPY.setup.twoImpostors : copy(COPY.setup.manyImpostors, { count: number });
}
function impostorSettingsHint() {
  const effective = impostorCountFor(count);
  const hint = copy(COPY.settings.impostorHint, { players: count, max: maxImpostors(count), effective });
  return hint + (preferences.impostorCount > effective ? ' ' + copy(COPY.settings.impostorAdjusted, { requested: preferences.impostorCount, effective }) : '');
}
function settingsScreen(origin = 'home') {
  if (game && !game.winner && phase !== 'setup') return;
  phase = 'settings';
  const close = origin === 'players' ? playersScreen : setup;
  const option = (value, label, selected) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
  const field = (key, label, hint, options) => `<div class="settings-field"><label for="setting-${key}">${ui(label)}</label><p id="hint-${key}">${ui(hint)}</p><select id="setting-${key}" data-preference="${key}" aria-describedby="hint-${key}">${options}</select></div>`;
  const impostorOptions = SETTINGS_OPTIONS.impostorCount.map(value => option(value, value === 0 ? COPY.settings.impostorAuto : value === 1 ? COPY.settings.impostorOne : value === 2 ? COPY.settings.impostorTwo : copy(COPY.settings.impostorMany, { count: value }), preferences.impostorCount)).join('');
  const turnOptions = SETTINGS_OPTIONS.turnSeconds.map(value => option(value, copy(COPY.settings.secondsOption, { seconds: value }), preferences.turnSeconds)).join('');
  const taskOptions = SETTINGS_OPTIONS.tasksPerCrew.map(value => option(value, copy(COPY.settings.tasksOption, { count: value }), preferences.tasksPerCrew)).join('');
  const cooldownOptions = SETTINGS_OPTIONS.killCooldown.map(value => option(value, [COPY.settings.cooldownNone, COPY.settings.cooldownOne, COPY.settings.cooldownTwo][value], preferences.killCooldown)).join('');
  const fontOptions = SETTINGS_OPTIONS.textSize.map(value => option(value, value === 'large' ? COPY.settings.fontLarge : COPY.settings.fontNormal, preferences.textSize)).join('');
  show(`<div class="nav"><button type="button" class="back" id="settingsBack" aria-label="${ui(COPY.settings.back)}">${chev}</button><h2>${ui(COPY.settings.title)}</h2></div><div class="grow settings-content"><p class="settings-intro">${ui(COPY.settings.intro)}</p><section class="settings-card" aria-labelledby="settingsGameTitle"><h2 id="settingsGameTitle">${ui(COPY.settings.gameSection)}</h2>${field('impostorCount', COPY.settings.impostorLabel, impostorSettingsHint(), impostorOptions)}${field('turnSeconds', COPY.settings.turnLabel, COPY.settings.turnHint, turnOptions)}${field('tasksPerCrew', COPY.settings.goalLabel, COPY.settings.goalHint, taskOptions)}${field('killCooldown', COPY.settings.cooldownLabel, COPY.settings.cooldownHint, cooldownOptions)}</section><section class="settings-card" aria-labelledby="settingsDisplayTitle"><h2 id="settingsDisplayTitle">${ui(COPY.settings.displaySection)}</h2>${field('textSize', COPY.settings.fontLabel, COPY.settings.fontHint, fontOptions)}<label class="settings-switch" for="setting-orbitMotion"><span><b>${ui(COPY.settings.motionLabel)}</b><small id="hint-orbitMotion">${ui(COPY.settings.motionHint)}</small></span><input type="checkbox" role="switch" id="setting-orbitMotion" data-preference="orbitMotion" aria-describedby="hint-orbitMotion" ${preferences.orbitMotion ? 'checked' : ''}></label></section><p class="settings-note">${ui(COPY.settings.note)}</p><button type="button" class="btn ghost settings-reset" id="resetSettings">${ui(COPY.settings.reset)}</button><p class="settings-status" id="settingsStatus" role="status" aria-live="polite"></p></div><div class="foot"><button type="button" class="btn" id="settingsDone">${ui(COPY.settings.done)}</button></div>`);
  $('settingsBack').onclick = close; $('settingsDone').onclick = close;
  $$('[data-preference]').forEach(control => control.onchange = () => {
    const key = control.dataset.preference;
    const value = control.type === 'checkbox' ? control.checked : key === 'textSize' ? control.value : Number(control.value);
    const persisted = savePreferences({ ...preferences, [key]: value });
    $('hint-impostorCount').textContent = impostorSettingsHint();
    $('settingsStatus').textContent = persisted ? COPY.settings.saved : COPY.settings.storageUnavailable;
  });
  $('resetSettings').onclick = () => {
    const persisted = savePreferences(DEFAULT_SETTINGS);
    $$('[data-preference]').forEach(control => { if (control.type === 'checkbox') control.checked = preferences[control.dataset.preference]; else control.value = String(preferences[control.dataset.preference]) });
    $('hint-impostorCount').textContent = impostorSettingsHint();
    $('settingsStatus').textContent = persisted ? COPY.settings.resetDone : COPY.settings.storageUnavailable;
  }
}
function playersScreen() {
  phase = 'setup';
  show(`<div class="nav"><button class="back" id="back" aria-label="${ui(COPY.common.back)}">${chev}</button><h2>${ui(COPY.setup.title)}</h2></div>
 <div class="count-card"><div><b class="k">${ui(COPY.setup.count)}</b><p class="small" id="roleCount"></p></div><div class="stepper" role="group" aria-label="${ui(COPY.setup.countLabel)}"><button id="less" aria-label="${ui(COPY.setup.less)}">−</button><b id="countDisplay">${count}</b><button id="more" aria-label="${ui(COPY.setup.more)}">+</button></div></div>
 ${settingsSummary()}<p id="impostorNotice" class="settings-note" role="status" hidden></p><div id="names" class="names"></div><p id="err" class="error" role="alert"></p>
 <div class="foot" style="padding-top:0"><button class="btn" id="start">${ui(COPY.setup.start)}</button></div>`);
  const upd = d => { count = Math.max(4, Math.min(10, count + d)); const c = $('countDisplay'); c.textContent = count; if (d) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump') } $('less').disabled = count === 4; $('more').disabled = count === 10; namesForm() };
  $('less').onclick = () => upd(-1); $('more').onclick = () => upd(1); $('back').onclick = setup;
  $('names').oninput = () => { saved = $$('#names input').map(x => x.value) };
  $('editSettings').onclick = () => { saved = $$('#names input').map(x => x.value); settingsScreen('players') };
  upd(0); $('start').onclick = startGame
}
function namesForm() {
  const box = $('names'), imp = impostorCountFor(count);
  while (box.children.length > count) box.lastChild.remove();
  for (let i = box.children.length; i < count; i++) {
    const el = document.createElement('input'); el.id = 'n' + i; el.maxLength = 18; el.autocomplete = 'off';
    el.placeholder = copy(COPY.setup.placeholder, { number: i + 1 });
    el.setAttribute('aria-label', copy(COPY.setup.nameLabel, { number: i + 1 })); el.value = saved[i] || ''; box.appendChild(el)
  }
  $('roleCount').textContent = copy(COPY.setup.roles, { impostors: impostorLabel(imp), goal: (count - imp) * preferences.tasksPerCrew });
  $('impostorNotice').hidden = preferences.impostorCount <= imp;
  $('impostorNotice').textContent = preferences.impostorCount > imp ? copy(COPY.setup.impostorAdjustment, { players: count, effective: imp, requested: preferences.impostorCount, impostors: impostorLabel(imp) }) : '';
}
function rulesScreen(i, dir) {
  phase = 'setup'; const pg = RULES[i], last = i === RULES.length - 1;
  const ruleValues = { seconds: preferences.turnSeconds, tasksPerCrew: preferences.tasksPerCrew, cooldownRule: [COPY.settings.cooldownRuleNone, COPY.settings.cooldownRuleOne, COPY.settings.cooldownRuleTwo][preferences.killCooldown], impostorRule: preferences.impostorCount === 0 ? COPY.setup.automaticImpostorRule : copy(COPY.setup.manualImpostorRule, { impostors: impostorLabel(impostorCountFor(count)) }) };
  show(`<div class="nav"><button class="back" id="back" aria-label="${ui(COPY.common.back)}">${chev}</button><h2>${ui(COPY.rulesPage.title)}</h2></div>
 <div class="dots" role="img" aria-label="${ui(COPY.common.position, { current: i + 1, total: RULES.length })}">${RULES.map((_, k) => (k ? `<u class="${k <= i ? 'on' : ''}"></u>` : '') + `<i class="${k < i ? 'on' : k === i ? 'cur' : ''}"></i>`).join('')}</div>
 <div class="grow rule-page ${dir === 'back' ? 'bwd' : 'fwd'}"><div class="rule-ic">${pg.ic}</div><h1>${ui(pg.t)}</h1><ul class="rule-list">${pg.l.map(x => `<li>${ui(x, ruleValues)}</li>`).join('')}</ul></div>
 <div class="foot" style="${i ? 'grid-template-columns:1fr 2fr' : ''}">${i ? `<button class="btn ghost" id="prev">${ui(COPY.common.previous)}</button>` : ''}<button class="btn" id="next">${ui(last ? COPY.rulesPage.done : COPY.common.next)}</button></div>`);
  $('back').onclick = setup; if (i) $('prev').onclick = () => rulesScreen(i - 1, 'back');
  $('next').onclick = () => last ? playersScreen() : rulesScreen(i + 1)
}
function startGame() {
  const names = $$('#names input').map(x => x.value.trim());
  if (names.some(n => !n) || new Set(names.map(n => n.normalize('NFKC').toLowerCase())).size !== names.length) { $('err').textContent = COPY.setup.error; return }
  game = createGame(names); phase = 'roles'; queue = game.players.map(p => p.id); index = 0; handoff()
}

/* ---------- hand-off, roles, rounds ---------- */
function handoff() {
  const p = game.players[queue[index]];
  const lab = phase === 'roles' ? COPY.handoff.roles : phase === 'vote' ? COPY.handoff.vote : copy(COPY.handoff.action, { round: game.round });
  show(`<div class="top"><span>${esc(lab)}</span><b dir="ltr">${ui(COPY.common.fraction, { current: index + 1, total: queue.length })}</b></div><div class="dots" role="img" aria-label="${ui(COPY.common.position, { current: index + 1, total: queue.length })}">${queue.map((_, i) => (i ? `<u class="${i <= index ? 'on' : ''}"></u>` : '') + `<i class="${i < index ? 'on' : i === index ? 'cur' : ''}"></i>`).join('')}</div>
 <div class="grow mid"><p class="small">${ui(COPY.handoff.passTo)}</p><h1 class="name">${esc(p.name)}</h1><p>${ui(COPY.handoff.privacy)}</p></div>
 <div class="foot"><button class="btn pulse" id="open">${ui(COPY.handoff.open, { name: p.name })}</button><p class="small center">${ui(phase === 'act' ? COPY.handoff.turnHint : COPY.handoff.waitHint, { seconds: turnSeconds() })}</p></div>`);
  $('open').onclick = () => phase === 'roles' ? reveal() : phase === 'vote' ? ballot() : action()
}
function reveal() {
  const p = game.players[queue[index]], imp = p.role === 'imp', mates = game.players.filter(x => x.role === 'imp' && x.id !== p.id);
  const detail = imp ? (mates.length ? copy(mates.length > 1 ? COPY.role.partners : COPY.role.partner, { names: mates.map(x => x.name).join(COPY.common.comma) }) : COPY.role.solo) : COPY.role.goal;
  show(`<div class="top"><span>${ui(COPY.common.privateFor, { name: p.name })}</span><span>${ui(COPY.role.card)}</span></div><div class="grow mid reveal role-private ${imp ? 'role-impostor' : 'role-crew'}"><div class="glyph">${ICON.cover}<span class="role-mark" aria-hidden="true">${imp ? '◇' : '+'}</span></div><p class="small">${ui(COPY.role.secret)}</p><h1 class="role">${ui(imp ? COPY.role.impostor : COPY.role.crew)}</h1><p class="role-mission">${ui(imp ? COPY.role.impostorMission : COPY.role.crewMission)}</p><div class="role-detail"><b>${ui(imp ? COPY.role.privateInfo : COPY.role.crewGoal)}</b><p>${esc(detail)}</p></div><p class="small">${ui(COPY.role.reminder)}</p></div><div class="foot"><button class="btn" id="hide">${ui(COPY.role.hide)}</button></div>`, 'private');
  $('hide').onclick = () => { index++; if (index < queue.length) handoff(); else roundIntro() }
}
function roundIntro() {
  phase = 'intro'; game.round++; game.actions = {};
  show(`${status()}<div class="grow"><h1>${ui(COPY.common.round, { round: game.round })}.${COPY.round.tagline ? `<br>${ui(COPY.round.tagline)}` : ''}</h1><p>${ui(COPY.round.description)}</p><p class="callout">${ui(COPY.round.limit, { seconds: turnSeconds() })}</p></div><div class="foot"><button class="btn" id="begin">${ui(COPY.round.begin)}</button></div>`);
  $('begin').onclick = () => { phase = 'act'; queue = shuffle(game.players.filter(p => p.alive).map(p => p.id)); index = 0; handoff() }
}

/* ---------- private action turn ---------- */
function action() { const p = game.players[queue[index]]; draft = { room: null, kind: p.role === 'imp' ? 'cover' : 'task', target: null, done: false, locked: false, stage: 'room' }; task = makeTask(p); deadline = Date.now() + turnSeconds() * 1000; paused = false; renderAction(); timer = setInterval(tick, 200); tick() }
function renderAction() {
  const p = game.players[queue[index]], imp = p.role === 'imp', stage = draft.stage; document.body.dataset.theme = 'private';
  app.innerHTML = `<div class="top" style="animation:none"><span>${ui(COPY.common.privateFor, { name: p.name })}</span><span id="time" class="timer"></span></div><div class="fuse" style="animation:none"><i id="fuse"></i></div><div id="actBody" class="col"></div>`;
  const body = $('actBody');
  if (stage === 'room') {
    body.innerHTML = `<div class="grow"><h1>${ui(COPY.action.roomTitle)}</h1><p>${ui(COPY.action.roomHint)}</p>${station(true)}</div><p class="small center">${ui(COPY.action.roomFooter)}</p>`;
    $$('[data-room]').forEach(b => b.onclick = () => { draft.room = Number(b.dataset.room); draft.stage = imp ? 'command' : 'task'; renderAction() });
  } else if (stage === 'command' || stage === 'target') renderCommand(body, p);
  else renderTask(body);
  tick()
}
function renderCommand(body, p) {
  if (draft.stage === 'target') {
    body.innerHTML = `<div class="grow"><div class="head"><h2>${ui(COPY.action.targetTitle)}</h2><button id="backCommand" class="btn ghost command-back">${ui(COPY.common.back)}</button></div><p class="small">${ui(COPY.action.targetHint)}</p><div class="players" role="group" aria-label="${ui(COPY.action.targetGroup)}">${game.players.filter(x => x.alive && x.role === 'crew').map(x => `<button data-target="${x.id}" aria-pressed="${draft.target === x.id}" class="pick${draft.target === x.id ? ' selected' : ''}"><span class="t">${esc(x.name)}</span><span class="chk">✓</span></button>`).join('')}</div></div><button id="confirmOp" class="btn" ${draft.target === null ? 'disabled' : ''}>${ui(COPY.action.confirmTarget)}</button>`;
    $('backCommand').onclick = () => { draft.stage = 'command'; renderAction() };
    $$('[data-target]').forEach(b => b.onclick = () => { draft.target = Number(b.dataset.target); $$('[data-target]').forEach(x => { const y = Number(x.dataset.target) === draft.target; x.classList.toggle('selected', y); x.setAttribute('aria-pressed', String(y)) }); $('confirmOp').disabled = false });
    $('confirmOp').onclick = () => { if (draft.target === null) return; draft.locked = true; draft.stage = 'task'; renderAction() };
  } else {
    const cmds = ['cover', 'sabotage', 'kill'];
    body.innerHTML = `<div class="grow"><h2>${ui(COPY.action.planTitle)}</h2><p class="small">${ui(COPY.action.planHint, { room: ROOMS[draft.room] })}</p><div class="list">${cmds.map(kind => `<button data-kind="${kind}" class="pick" ${kind === 'kill' && p.cooldown ? 'disabled' : ''}><span class="ic ${kind}">${ICON[kind]}</span><span class="t"><b>${ui(COPY.action.commands[kind].title)}</b><small>${ui(kind === 'kill' && p.cooldown ? (p.cooldown === 1 ? COPY.action.commands.kill.cooldown : COPY.settings.cooldownRemainingMany) : COPY.action.commands[kind].description, { count: p.cooldown })}</small></span></button>`).join('')}</div></div>`;
    $$('[data-kind]').forEach(b => b.onclick = () => { draft.kind = b.dataset.kind; draft.target = null; if (draft.kind === 'kill') draft.stage = 'target'; else { draft.locked = true; draft.stage = 'task' } renderAction() });
  }
}
function taskProgress() {
  if (task.type === 'wires') return { current: task.connected.length, total: 3, solved: task.connected.length === 3 };
  if (task.type === 'circuit') {
    const { powered, solved } = circuitPower(task);
    return { current: solved ? task.path.length : Math.min(task.path.length - 1, task.path.filter(cell => powered.has(cell)).length), total: task.path.length, solved }
  }
  if (task.type === 'radar') {
    const distance = Math.abs(task.targetX - task.x) + Math.abs(task.targetY - task.y);
    return { current: Math.max(0, task.startDistance - distance), total: task.startDistance, label: distance ? copy(COPY.radar.remaining, { count: distance }) : COPY.radar.docked, solved: distance === 0 }
  }
  if (task.type === 'power') {
    const current = task.values.filter((value, i) => Math.abs(value - task.targets[i]) <= 8).length;
    return { current, total: 3, solved: task.confirmed && current === 3 }
  }
  if (task.type === 'samples') return { current: task.step, total: task.queue.length, solved: task.step === task.queue.length };
  return { current: task.isolated.length, total: task.faults.length, solved: task.isolated.length === task.faults.length }
}
function updateTaskStatus() {
  const progress = taskProgress(), el = $('taskProgress');
  if (el) { el.textContent = progress.label || copy(COPY.common.fraction, { current: progress.current, total: progress.total }); el.setAttribute('aria-label', copy(COPY.taskUi.progressLabel, { current: progress.current, total: progress.total })) }
  if ($('consoleState')) $('consoleState').textContent = progress.solved ? COPY.taskUi.ready : progress.current ? COPY.taskUi.working : COPY.taskUi.waiting;
  return progress
}
function renderTask(body) {
  const meta = TASKS[task.type];
  body.innerHTML = `<div class="grow task-screen"><div class="task-heading"><div class="task-kicker"><span>${esc(ROOMS[draft.room])}</span><span>${ui(COPY.taskUi.kicker)}</span></div><h2>${ui(meta.title)}</h2><p class="task-description">${ui(meta.description)}</p></div><section class="panel task-console" id="taskPanel" aria-label="${ui(meta.system)}"><div class="console-top"><span class="console-system">${ui(meta.system)}</span><span class="console-progress" id="taskProgress"></span></div><div class="task-board" id="taskBoard" aria-live="off"></div><div class="console-bottom"><span id="consoleState">${ui(COPY.taskUi.waiting)}</span><span class="console-caption">${ui(COPY.taskUi.caption)}</span></div></section><p id="taskNote" class="note task-note" role="status">${ui(meta.hint)}</p></div><button type="button" id="finish" class="btn" disabled>${ui(COPY.taskUi.incomplete)}</button>`;
  renderTaskBoard();
  $('finish').onclick = () => { if (draft?.done) finishAction() };
  if (draft.done) completeTask()
}
function refreshTaskBoard(message, tone = '') {
  const active = document.activeElement, attributes = ['data-port', 'data-side', 'data-tile', 'data-move', 'data-sample', 'data-scan'];
  const selector = active?.closest('#taskBoard') ? attributes.filter(name => active.hasAttribute(name)).map(name => '[' + name + '="' + active.getAttribute(name) + '"]').join('') : '';
  renderTaskBoard();
  if (message) note(message, tone);
  if (taskProgress().solved) { completeTask(); if (selector) $('finish').focus({ preventScroll: true }) }
  else if (selector) {
    const previous = $('taskBoard').querySelector(selector), next = previous && !previous.disabled ? previous : $('taskBoard').querySelector('button:not(:disabled)');
    if (next) next.focus({ preventScroll: true })
  }
}
function renderTaskBoard() {
  const board = $('taskBoard');
  board.onkeydown = null;
  if (task.type === 'wires') renderWires(board);
  else if (task.type === 'circuit') renderCircuit(board);
  else if (task.type === 'radar') renderRadar(board);
  else if (task.type === 'power') renderPower(board);
  else if (task.type === 'samples') renderSamples(board);
  else renderScan(board);
  updateTaskStatus()
}
function canPlayTask() { return Boolean(draft && !draft.done && !paused) }
function renderWires(board) {
  const terminal = (id, side) => {
    const mark = TASK_MARKS[id], connected = task.connected.includes(id), selected = task.selected?.side === side && task.selected.id === id;
    const label = ui(COPY.wires.portLabel, { side: side === 'in' ? COPY.wires.source : COPY.wires.device, label: mark.label, symbol: mark.symbol, status: connected ? COPY.wires.connected : '' });
    return `<button type="button" class="wire-terminal${connected ? ' connected' : ''}${selected ? ' selected' : ''}" style="--wire:${mark.color}" data-port="${id}" data-side="${side}" aria-label="${label}" aria-pressed="${selected}" ${connected ? 'disabled' : ''}><span class="wire-mark" aria-hidden="true">${mark.symbol}</span><span class="wire-label">${esc(mark.label)}${connected ? ' ✓' : ''}</span></button>`
  };
  board.innerHTML = `<div class="wire-board" dir="ltr"><svg class="wire-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${task.connected.map(id => { const start = (task.inputOrder.indexOf(id) + .5) * 100 / 3, end = (task.outputOrder.indexOf(id) + .5) * 100 / 3; return `<path d="M 0 ${start} C 40 ${start}, 60 ${end}, 100 ${end}" fill="none" stroke="${TASK_MARKS[id].color}" stroke-width="2" vector-effect="non-scaling-stroke"/>` }).join('')}</svg><div class="wire-column">${task.inputOrder.map(id => terminal(id, 'in')).join('')}</div><div class="wire-column output">${task.outputOrder.map(id => terminal(id, 'out')).join('')}</div></div>`;
  board.querySelectorAll('[data-port]').forEach(button => button.onclick = () => {
    if (!canPlayTask()) return;
    const id = Number(button.dataset.port), side = button.dataset.side;
    if (!task.selected || task.selected.side === side) {
      task.selected = task.selected?.id === id && task.selected.side === side ? null : { id, side };
      refreshTaskBoard(task.selected ? COPY.wires.selected : TASKS.wires.hint);
    } else if (task.selected.id === id) {
      task.connected.push(id); task.selected = null;
      refreshTaskBoard(COPY.wires.correct);
    } else note(COPY.wires.wrong, 'warn');
  })
}
function renderCircuit(board) {
  const { powered, solved } = circuitPower(task), ends = [[1, 32, 0, COPY.circuit.up], [2, 64, 32, COPY.circuit.right], [4, 32, 64, COPY.circuit.down], [8, 0, 32, COPY.circuit.left]];
  board.innerHTML = `<div class="circuit-board" dir="ltr"><div class="circuit-source" aria-label="${ui(COPY.circuit.inletLabel)}">${ui(COPY.circuit.inlet)} <span aria-hidden="true">→</span></div><div class="circuit-grid">${task.tiles.map((mask, i) => `<button type="button" class="circuit-tile${powered.has(i) ? ' powered' : ''}" data-tile="${i}" aria-label="${ui(COPY.circuit.tileLabel, { row: Math.floor(i / 3) + 1, column: i % 3 + 1, ports: ends.filter(([port]) => mask & port).map(([, , , label]) => label).join(COPY.common.and), status: powered.has(i) ? COPY.circuit.powered : '' })}"><svg viewBox="0 0 64 64" aria-hidden="true">${ends.filter(([port]) => mask & port).map(([, x, y]) => `<path d="M32 32 L${x} ${y}" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>`).join('')}<circle cx="32" cy="32" r="4" fill="currentColor"/></svg></button>`).join('')}</div><div class="circuit-sink${solved ? ' connected' : ''}" aria-label="${ui(COPY.circuit.outletLabel)}"><span aria-hidden="true">→</span>${ui(COPY.circuit.outlet)}</div></div>`;
  board.querySelectorAll('[data-tile]').forEach(button => button.onclick = () => {
    if (!canPlayTask()) return;
    const i = Number(button.dataset.tile); task.tiles[i] = rotatePorts(task.tiles[i]);
    refreshTaskBoard(circuitPower(task).powered.size ? COPY.circuit.flowing : COPY.circuit.disconnected);
  })
}
function renderRadar(board) {
  const ship = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 3 27 27 16 22 5 27Z" fill="currentColor"/><path d="M16 10v10" stroke="var(--soft)" stroke-width="2"/></svg>';
  const moves = { up: [0, -1, 0, '↑', COPY.radar.up], left: [-1, 0, 270, '←', COPY.radar.left], down: [0, 1, 180, '↓', COPY.radar.down], right: [1, 0, 90, '→', COPY.radar.right] };
  board.innerHTML = `<div class="radar-layout"><div class="radar-map" dir="ltr" role="img" aria-label="${ui(COPY.radar.mapLabel, { x: task.x + 1, y: task.y + 1, targetX: task.targetX + 1, targetY: task.targetY + 1 })}"><i class="radar-target" style="--x:${task.targetX};--y:${task.targetY}" aria-hidden="true"></i><i class="radar-ship" style="--x:${task.x};--y:${task.y}" aria-hidden="true"><span style="display:block;transform:rotate(${task.heading}deg)">${ship}</span></i></div><div class="radar-readout"><span>${ui(COPY.radar.ship)}</span><span>${ui(COPY.radar.target)}</span></div><div class="radar-controls" dir="ltr">${Object.entries(moves).map(([move, [dx, dy, , arrow, label]]) => `<button type="button" data-move="${move}" aria-label="${ui(label)}" ${task.x + dx < 0 || task.x + dx > 4 || task.y + dy < 0 || task.y + dy > 4 ? 'disabled' : ''}>${arrow}</button>`).join('')}</div></div>`;
  board.querySelectorAll('[data-move]').forEach(button => button.onclick = () => {
    if (!canPlayTask()) return;
    const [dx, dy, heading] = moves[button.dataset.move];
    task.x = Math.max(0, Math.min(4, task.x + dx)); task.y = Math.max(0, Math.min(4, task.y + dy)); task.heading = heading;
    refreshTaskBoard(COPY.radar.moving);
  });
  board.onkeydown = event => {
    const move = { ArrowUp: 'up', ArrowLeft: 'left', ArrowDown: 'down', ArrowRight: 'right' }[event.key];
    if (!move) return;
    event.preventDefault();
    const button = board.querySelector('[data-move="' + move + '"]'); if (!button.disabled) button.click()
  }
}
function renderPower(board) {
  const labels = COPY.power.channels;
  board.innerHTML = `<div class="power-board">${task.targets.map((target, i) => `<div class="power-channel" data-channel="${i}"><div class="power-label"><b>${ui(labels[i])}</b><span class="power-value" id="powerValue${i}">${ui(COPY.common.percent, { value: task.values[i] })}</span></div><div class="power-range-wrap" style="--target:${target}%;--value:${task.values[i]}%"><i class="power-zone" aria-hidden="true"></i><input class="power-range" data-power="${i}" type="range" min="0" max="100" step="5" value="${task.values[i]}" dir="ltr" aria-label="${ui(COPY.power.rangeLabel, { channel: labels[i], min: target - 8, max: target + 8 })}"></div></div>`).join('')}<div class="power-scale" dir="ltr"><span>${ui(COPY.common.percent, { value: 0 })}</span><span>${ui(COPY.power.safeZone)}</span><span>${ui(COPY.common.percent, { value: 100 })}</span></div><button type="button" class="console-confirm" id="powerConfirm" disabled>${ui(COPY.power.confirm)}</button></div>`;
  const update = () => {
    task.values.forEach((value, i) => {
      const aligned = Math.abs(value - task.targets[i]) <= 8, channel = board.querySelector('[data-channel="' + i + '"]');
      channel.classList.toggle('aligned', aligned); $('powerValue' + i).textContent = aligned ? COPY.power.safe : copy(COPY.common.percent, { value });
      channel.querySelector('.power-range-wrap').style.setProperty('--value', value + '%');
    });
    const ready = taskProgress().current === 3; $('powerConfirm').disabled = !ready || draft.done; $('powerConfirm').classList.toggle('ready', ready);
    updateTaskStatus();
  };
  board.querySelectorAll('[data-power]').forEach(input => input.oninput = () => { if (!canPlayTask()) return; task.values[Number(input.dataset.power)] = Number(input.value); update(); if (taskProgress().current === 3) note(COPY.power.ready) });
  $('powerConfirm').onclick = () => { if (!canPlayTask() || taskProgress().current !== 3) return; task.confirmed = true; updateTaskStatus(); completeTask() };
  update()
}
function renderSamples(board) {
  const mark = TASK_MARKS[task.queue[Math.min(task.step, task.queue.length - 1)]], finished = task.step === task.queue.length;
  board.innerHTML = `<div class="sample-board"><div class="sample-incoming" style="--sample:${mark.color}"><span class="sample-caption">${ui(finished ? COPY.samples.allSorted : COPY.samples.incoming)}</span><div class="sample-symbol" aria-label="${ui(finished ? COPY.samples.finished : mark.sample)}">${finished ? '✓' : mark.symbol}</div><span class="sample-count">${ui(finished ? COPY.samples.finished : COPY.samples.choose)}</span></div><div class="sample-bins">${TASK_MARKS.map((m, i) => `<button type="button" class="sample-bin" data-sample="${i}" style="--sample:${m.color}" aria-label="${ui(COPY.samples.binLabel, { type: m.sample, symbol: m.symbol })}"><span class="bin-symbol" aria-hidden="true">${m.symbol}</span><span>${ui(m.sample)}</span></button>`).join('')}</div><div class="sample-queue" aria-label="${ui(COPY.samples.progressLabel, { current: task.step, total: task.queue.length })}">${task.queue.map((_, i) => `<i class="${i < task.step ? 'sorted' : ''}" aria-hidden="true"></i>`).join('')}</div></div>`;
  board.querySelectorAll('[data-sample]').forEach(button => button.onclick = () => {
    if (!canPlayTask()) return;
    if (Number(button.dataset.sample) !== task.queue[task.step]) { note(COPY.samples.wrong, 'warn'); return }
    task.step++; refreshTaskBoard(COPY.samples.correct);
  })
}
function sensorWave(fault, variant = 0) {
  const normal = 'M0 24H12L18 17 24 31 30 24H44L50 17 56 31 62 24H80';
  const damaged = ['M0 24H80', 'M0 24H12L18 5 24 43 30 24H44L50 5 56 43 62 24H80', 'M0 24H12L18 17 24 31 30 24H80'];
  return `<svg class="scan-signature" viewBox="0 0 80 48" fill="none" aria-hidden="true"><path d="M0 24H80" stroke="currentColor" stroke-opacity=".12"/><path d="${fault ? damaged[variant % damaged.length] : normal}" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}
function renderScan(board) {
  board.innerHTML = `<div class="scan-board"><div class="scan-reference">${sensorWave(false)}<span>${ui(COPY.scan.reference)}</span></div><div class="scan-grid" dir="ltr">${Array.from({ length: 9 }, (_, i) => {
    const fault = task.faults.includes(i), isolated = task.isolated.includes(i), checked = task.checked.includes(i), code = COPY.codes.sensorRows[Math.floor(i / 3)] + (i % 3 + 1), pattern = fault ? COPY.scan.patterns[task.faults.indexOf(i)] : COPY.scan.normal;
    return `<button type="button" class="scan-cell${isolated ? ' isolated' : ''}${checked ? ' clean' : ''}" data-scan="${i}" aria-label="${ui(COPY.scan.cellLabel, { code, pattern, status: isolated ? COPY.scan.isolated : checked ? COPY.scan.clean : '' })}" ${isolated || checked ? 'disabled' : ''}>${isolated ? '<span class="scan-check" aria-hidden="true">✓</span>' : sensorWave(fault, task.faults.indexOf(i))}<span>${esc(code)}</span></button>`
  }).join('')}</div><div class="scan-counter">${ui(COPY.scan.counter)}</div></div>`;
  board.querySelectorAll('[data-scan]').forEach(button => button.onclick = () => {
    if (!canPlayTask()) return;
    const i = Number(button.dataset.scan);
    if (task.faults.includes(i)) { task.isolated.push(i); refreshTaskBoard(COPY.scan.correct) }
    else { task.checked.push(i); refreshTaskBoard(COPY.scan.wrong, 'warn') }
  })
}
function note(text, tone = '') { const el = $('taskNote'); if (el) { el.textContent = text; el.dataset.tone = tone } }
function completeTask() {
  draft.done = true;
  $$('#taskPanel button,#taskPanel input').forEach(control => control.disabled = true);
  note(COPY.taskUi.success, 'success');
  $('taskNote').classList.add('success'); $('taskPanel').classList.add('ok'); $('consoleState').textContent = COPY.taskUi.successState;
  const button = $('finish'); button.disabled = false; button.textContent = COPY.taskUi.finish; button.classList.add('pop');
}
function tick() {
  if (paused || !draft) return; const ms = Math.max(0, deadline - Date.now()), left = Math.ceil(ms / 1000), el = $('time'), f = $('fuse');
  if (el) { el.textContent = copy(COPY.common.seconds, { seconds: left }); el.classList.toggle('urgent', left <= 5) }
  if (f) { f.style.transform = 'scaleX(' + ms / (turnSeconds() * 1000) + ')'; f.parentNode.classList.toggle('urgent', left <= 5) }
  if (left === 0) finishAction()
}
function finishAction() {
  if (!draft) return; stop(); if (draft.room === null) { draft.room = shuffle([0, 1, 2])[0]; draft.done = false }
  if (game.players[queue[index]].role === 'imp' && (!draft.locked || !draft.done)) { draft.kind = 'cover'; draft.target = null }
  game.actions[queue[index]] = { ...draft }; draft = null; index++; if (index < queue.length) handoff(); else { resolve(game); report() }
}
document.addEventListener('visibilitychange', () => {
  if (phase !== 'act' || !draft) return;
  if (document.hidden && !paused) { pauseLeft = Math.max(0, deadline - Date.now()); paused = true; document.body.dataset.theme = 'public'; app.innerHTML = `<div class="grow mid"><h2>${ui(COPY.pause.locked)}</h2><p>${ui(COPY.pause.hidden)}</p></div>` }
  else if (!document.hidden && paused) {
    document.body.dataset.theme = 'public'; app.innerHTML = `<div class="grow mid"><h2>${ui(COPY.pause.title)}</h2><p>${ui(COPY.pause.description)}</p></div><div class="foot"><button class="btn" id="resume">${ui(COPY.pause.resume)}</button></div>`;
    $('resume').onclick = () => { deadline = Date.now() + pauseLeft; paused = false; if (pauseLeft <= 0) { finishAction(); return } renderAction() }
  }
});

/* ---------- report, discussion, vote, end ---------- */
function roomRecords() {
  const victims = new Set(game.events.map(event => event.id));
  return (game.roundLog?.rooms || []).map(room => {
    const casualties = room.visitors.filter(player => victims.has(player.id)).length, count = room.visitors.length;
    const occupancy = count === 0 ? COPY.report.emptyRoom : count === 1 ? COPY.common.playerOne : count === 2 ? COPY.common.playerTwo : copy(COPY.common.players, { count });
    return `<section class="room-record${count ? '' : ' empty'}" aria-label="${esc(room.name)}"><div class="record-head"><span class="record-icon" aria-hidden="true">${ICON.room[room.room]}</span><div class="record-title"><h2>${esc(room.name)}</h2><p>${esc(occupancy)}</p></div>${casualties ? `<span class="record-alert">${ui(casualties === 1 ? COPY.report.oneVictim : COPY.report.victims, { count: casualties })}</span>` : ''}</div><div class="visitor-list">${count ? room.visitors.map(player => `<span class="visitor${victims.has(player.id) ? ' victim' : ''}"><span>${esc(player.name)}</span>${victims.has(player.id) ? `<small>${ui(COPY.common.victim)}</small>` : ''}</span>`).join('') : `<p class="room-empty">${ui(COPY.report.emptyHint)}</p>`}</div></section>`
  }).join('')
}
function reportContent() {
  const summary = game.summary, events = game.events;
  const gained = game.roundLog?.gained ?? (summary.earned - summary.lost);
  const progress = game.goal ? Math.round(game.progress / game.goal * 100) : 0;
  const outcomeIcon = events.length ? ICON.kill : sv('<path d="M5 12l4 4L19 6"/>');
  const outcomeTitle = events.length === 0 ? COPY.report.safeTitle : events.length === 1 ? COPY.report.oneLost : copy(COPY.report.manyLost, { count: events.length });
  const outcomeDetail = events.length ? COPY.report.incidentsDetail : COPY.report.safeDetail;
  const sabotageNote = summary.sabotages ? copy(COPY.report.sabotage, { sabotages: summary.sabotages, lost: summary.lost }) : COPY.report.noSabotage;
  const goalNote = gained < summary.earned - summary.lost ? COPY.report.goalReached : '';
  return `<section class="round-outcome${events.length ? ' has-incidents' : ''}"><span class="outcome-icon" aria-hidden="true">${outcomeIcon}</span><div><h2>${esc(outcomeTitle)}</h2><p>${esc(outcomeDetail)}</p></div></section>${events.length ? `<section class="event-section"><div class="event-section-head"><h2>${ui(COPY.report.incidents)}</h2><span>${ui(events.length === 1 ? COPY.report.oneIncident : COPY.report.manyIncidents, { count: events.length })}</span></div><div class="incident-list">${events.map(event => `<article class="incident-row"><span class="incident-icon" aria-hidden="true">${ICON.room[event.room]}</span><div class="incident-info"><h3>${esc(event.name)}</h3><p>${ui(COPY.report.incidentLocation, { room: ROOMS[event.room], count: event.occupants })}</p></div><span class="incident-tag">${ui(COPY.common.victim)}</span></article>`).join('')}</div></section>` : ''}<section class="event-section"><div class="event-section-head"><h2>${ui(COPY.report.tasks)}</h2><span>${ui(COPY.report.thisRound)}</span></div><div class="report-math"><div><b>${summary.earned}</b><span>${ui(COPY.report.earned)}</span></div><div class="lost"><b>${summary.lost}</b><span>${ui(COPY.report.lost)}</span></div><div class="gained"><b>${ui(COPY.report.gainedValue, { count: gained })}</b><span>${ui(COPY.report.gained)}</span></div></div><div class="round-progress-head"><span>${ui(COPY.common.progress)}</span><b><span>${game.progress}</span> / ${game.goal}</b></div><div class="meter round-progress" style="--p:${progress}%;--n:${game.goal}" role="progressbar" aria-label="${ui(COPY.common.progress)}" aria-valuemin="0" aria-valuemax="${game.goal}" aria-valuenow="${game.progress}"><i></i></div><p class="event-note">${esc(sabotageNote + goalNote)}</p></section>`
}
function report() {
  phase = 'report';
  show(`<div class="top"><span>${ui(COPY.report.roundLog, { round: game.round })}</span><b>${ui(COPY.common.alive, { count: game.players.filter(player => player.alive).length })}</b></div><div class="round-heading"><h1 class="report-title">${ui(COPY.report.title)}</h1><p>${ui(COPY.report.intro)}</p></div><div id="reportPane" class="grow round-report" tabindex="0" aria-label="${ui(COPY.report.title)}">${reportContent()}</div><div class="foot"><button id="next" class="btn">${ui(game.winner ? COPY.common.showResult : COPY.report.discuss)}</button></div>`);
  $('next').onclick = () => game.winner ? end() : discussion()
}
function discussion() {
  phase = 'discuss';
  show(`<div class="top"><span>${ui(COPY.common.round, { round: game.round })}</span><b>${ui(COPY.discussion.open)}</b></div><div class="round-heading"><h1>${ui(COPY.discussion.title)}</h1><p>${ui(COPY.discussion.description)}</p></div><div id="discussionRooms" class="grow discussion-rooms" tabindex="0" aria-label="${ui(COPY.discussion.rosterLabel)}">${roomRecords()}<p class="discussion-note">${ui(COPY.discussion.note)}</p></div><div class="foot"><button id="vote" class="btn">${ui(COPY.discussion.vote)}</button></div>`);
  $('vote').onclick = () => { phase = 'vote'; game.votes = {}; queue = shuffle(game.players.filter(player => player.alive).map(player => player.id)); index = 0; handoff() }
}
function ballot() {
  const p = game.players[queue[index]]; let choice = null;
  show(`<div class="top"><span>${ui(COPY.vote.private, { name: p.name })}</span></div><div class="grow"><h1>${ui(COPY.vote.title)}</h1><p class="small">${ui(COPY.vote.hint)}</p><div class="players" role="group" aria-label="${ui(COPY.vote.group)}">${game.players.filter(x => x.alive).map(x => `<button data-vote="${x.id}" aria-pressed="false" class="pick"><span class="t">${esc(x.name)}</span><span class="chk">✓</span></button>`).join('')}</div><button data-vote="skip" aria-pressed="false" class="pick" style="width:100%;border-style:dashed"><span class="t">${ui(COPY.vote.skip)}</span><span class="chk">✓</span></button></div><div class="foot"><button id="cast" class="btn" disabled>${ui(COPY.vote.confirm)}</button></div>`, 'private');
  $$('[data-vote]').forEach(b => b.onclick = () => { choice = b.dataset.vote; $$('[data-vote]').forEach(x => { const y = x.dataset.vote === choice; x.classList.toggle('selected', y); x.setAttribute('aria-pressed', String(y)) }); $('cast').disabled = false });
  $('cast').onclick = () => { if (choice === null) return; game.votes[p.id] = choice; index++; if (index < queue.length) handoff(); else voteResult() }
}
function voteResult() {
  phase = 'result'; const r = resolveVote(game), rows = Object.entries(r.totals).sort((a, b) => b[1] - a[1]), total = rows.reduce((s, x) => s + x[1], 0) || 1;
  show(`${status()}<div class="grow"><h1>${ui(r.expelled ? COPY.vote.expelled : COPY.vote.nobody, { name: r.expelled?.name })}</h1><p>${ui(r.expelled ? COPY.vote.secret : COPY.vote.tied)}</p><div class="bars">${rows.map(([id, n]) => `<div><div class="bar-top"><span>${id === 'skip' ? ui(COPY.vote.skipLabel) : esc(game.players[Number(id)].name)}</span><b>${ui(COPY.vote.count, { count: n, unit: n === 1 ? COPY.common.voteOne : COPY.common.voteMany })}</b></div><div class="track"><i style="width:${n / total * 100}%"></i></div></div>`).join('')}</div></div><div class="foot"><button id="next" class="btn">${ui(game.winner ? COPY.common.showResult : COPY.common.nextRound)}</button></div>`);
  $('next').onclick = () => game.winner ? end() : roundIntro()
}
function end() {
  phase = 'end'; const crew = game.winner === 'crew';
  const reason = crew ? (game.players.some(p => p.alive && p.role === 'imp') ? COPY.end.tasksDone : COPY.end.noImpostors) : COPY.end.impostorReason;
  show(`<div class="top"><span>${ui(COPY.end.round, { round: game.round })}</span></div><div class="center"><h1 class="end-title">${ui(crew ? COPY.end.crewTitle : COPY.end.impostorTitle)}</h1><p>${ui(reason)}</p></div><div class="grow"><h2>${ui(COPY.end.reveal)}</h2><div class="roster">${game.players.map(p => `<div class="who${p.alive ? '' : ' dead'}"><span>${esc(p.name)}${p.alive ? '' : ui(COPY.end.out)}</span><span class="chip${p.role === 'imp' ? ' imp' : ''}">${ui(p.role === 'imp' ? COPY.common.impostor : COPY.common.crew)}</span></div>`).join('')}</div><p class="small">${ui(COPY.end.progress, { current: game.progress, total: game.goal })}</p></div><div class="foot"><button id="restart" class="btn">${ui(COPY.end.restart)}</button></div>`);
  $('restart').onclick = setup
}
window.addEventListener('beforeunload', e => { if (game && !game.winner && !['end', 'setup', 'settings'].includes(phase)) { e.preventDefault(); e.returnValue = '' } });
setup();
