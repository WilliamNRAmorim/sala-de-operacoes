'use strict';
/* Sala de Operações — lê eventos (SessionStart, SubagentStart, SubagentStop...) e desenha a sala.
   Toda a aparência e os textos vêm do config.json (+ ajustes salvos no navegador). */

const LS_KEY = 'salaAgentes.cfg';
const $ = id => document.getElementById(id);
let BASE = {}, CFG = {}, demo = false, events = [], demoTimer = null, sse = null;

const merge = (a, b) => {
  if (b === undefined) return a;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const o = { ...a };
    for (const k of Object.keys(b)) o[k] = merge(a[k], b[k]);
    return o;
  }
  return b;
};
const esc = s => String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

/* ---------- config ---------- */
async function loadConfig() {
  try { BASE = await (await fetch('config.json', { cache: 'no-store' })).json(); } catch (e) { BASE = {}; }
  let over = {};
  try { over = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) {}
  CFG = merge(BASE, over);
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local && CFG.fonteLocal) CFG.fonteDados = CFG.fonteLocal;
}
function applyTheme() {
  const t = (CFG.temas || {})[CFG.tema] || {};
  const map = { fundo: '--fundo', painel: '--painel', linha: '--linha', texto: '--texto', suave: '--suave', piso: '--piso', destaque: '--destaque', ok: '--ok', alerta: '--alerta' };
  for (const [k, v] of Object.entries(map)) if (t[k]) document.documentElement.style.setProperty(v, t[k]);
  $('titulo').textContent = CFG.titulo || 'Sala';
  document.title = CFG.titulo || 'Sala';
  $('subtitulo').textContent = CFG.subtitulo || '';
  $('log').style.display = CFG.mostrarLog === false ? 'none' : '';
  const sel = $('janela'); sel.innerHTML = '';
  for (const h of CFG.janelasDisponiveis || [6, 12, 24]) {
    const o = document.createElement('option'); o.value = h; o.textContent = h + ' h'; sel.appendChild(o);
  }
  sel.value = CFG.janelaHoras;
  const st = $('selTema'); st.innerHTML = '';
  for (const n of Object.keys(CFG.temas || {})) {
    const o = document.createElement('option'); o.value = n; o.textContent = n; st.appendChild(o);
  }
  st.value = CFG.tema;
}

/* ---------- sprites ---------- */
// Clones têm nome tipo "tit-v2": herdam aparência e grupo de "tit".
const baseDe = tipo => String(tipo || '').replace(/-(v|b)?\d+$/, '');
function tipoInfo(tipo) {
  const T = CFG.tipos || {};
  const base = T._padrao || {};
  const b = T[tipo] ? tipo : baseDe(tipo);
  const cfg = T[b] || {};
  const sufixo = b !== tipo && T[b] ? ' ' + String(tipo).slice(b.length + 1).toUpperCase() : '';
  return { ...base, ...cfg, _chave: tipo || '', grupo: cfg.grupo || b || tipo, nome: (cfg.nome || tipo || base.nome || 'Agente') + sufixo };
}
function spriteSVG(info, escala = 4) {
  const sp = info.sprite || CFG.sprite || {};
  const rows = sp.pixels || [];
  const pal = { h: info.cabelo || '#333', s: (CFG.paleta || {}).pele, e: (CFG.paleta || {}).olho, c: info.cor || '#88f', p: (CFG.paleta || {}).calca, ...(sp.paleta || {}) };
  const w = Math.max(0, ...rows.map(r => r.length)), h = rows.length;
  let rects = '';
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[ch]}"/>`; }));
  return `<svg width="${w * escala}" height="${h * escala}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`;
}

/* ---------- estado a partir dos eventos ---------- */
function derivar(evs) {
  const now = Date.now(), janela = (CFG.janelaHoras || 12) * 3600e3;
  const sess = {}, ag = {}, pend = [];   // pend: descrições de agentes recém-criados, à espera do SubagentStart
  const nomeProj = p => ((CFG.projetos || {})[p]) || p || '';
  const pegaNome = (tipo, t) => { const i = pend.findIndex(p => p.tipo === tipo && p.t <= t + 2000); return i >= 0 ? pend.splice(i, 1)[0].desc : ''; };
  const sorted = [...evs].sort((a, b) => new Date(a.t) - new Date(b.t));
  for (const e of sorted) {
    const t = new Date(e.t).getTime();
    if (now - t > janela && e.ev !== 'SessionStart') continue;
    const sid = e.session || '?';
    const s = sess[sid] || (sess[sid] = { id: sid, projeto: nomeProj(e.project), estado: 'idle', inicio: t, fim: null, ult: t });
    s.ult = t; if (e.project) s.projeto = nomeProj(e.project);
    switch (e.ev) {
      case 'UserPromptSubmit': s.estado = 'work'; break;
      case 'Stop': s.estado = 'idle'; break;
      case 'SessionEnd': s.estado = 'fim'; s.fim = t; break;
      case 'PreToolUse': if (e.tool === 'Agent' || e.tool === 'Task') pend.push({ t, tipo: e.type, desc: e.alvo || '' }); break;
      case 'SubagentStart': ag[e.agent || sid + t] = { id: e.agent, tipo: e.type, nome: pegaNome(e.type, t), sessao: sid, projeto: nomeProj(e.project), inicio: t, fim: null }; break;
      case 'PostToolUse': { const a = ag[e.agent]; if (a && (e.tool === 'Write' || e.tool === 'Edit') && e.arquivo) (a.arquivos = a.arquivos || []).push(e.arquivo); } break;
      case 'SubagentStop': { const a = ag[e.agent]; if (a) { a.fim = t; a.resumo = e.resumo || ''; } else ag[e.agent] = { id: e.agent, tipo: e.type, sessao: sid, projeto: nomeProj(e.project), inicio: t, fim: t }; } break;
    }
  }
  const stale = (CFG.minutosParaSumido || 30) * 60e3;
  const agentes = Object.values(ag).map(a => ({ ...a, estado: a.fim ? 'done' : (now - a.inicio > stale ? 'sumido' : 'work') }));
  const sessoes = Object.values(sess).filter(s => s.estado !== 'fim' && now - s.ult < janela);
  return { agentes, sessoes };
}

// Aparência e nome de um agente. Nome vem da descrição dada ao criá-lo ("Bit: roteiro" -> Bit; "Haiku 07" -> Haiku 07).
// Se a descrição começa com um tipo conhecido (bit, insta, din, tit...), usa a aparência desse tipo.
function visual(a) {
  const T = CFG.tipos || {}, desc = String(a.nome || '').trim();
  const primeira = desc.split(/[:\s]/)[0].toLowerCase();
  let chave = a.tipo;
  if ((!T[chave] || chave === 'general-purpose' || !chave) && T[primeira] && !primeira.startsWith('_')) chave = primeira;
  const info = tipoInfo(chave);
  let rotulo = info.nome;
  if (desc && (chave === 'general-purpose' || !chave || !T[a.tipo])) rotulo = T[primeira] ? info.nome : desc.replace(/\s*[:\-–].*$/, '').slice(0, 16) || info.nome;
  return { info, rotulo, desc };
}

/* ---------- desenho ---------- */
const dur = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'min' : Math.floor(s / 3600) + 'h' + String(Math.floor(s % 3600 / 60)).padStart(2, '0'); };
const pessoa = (info, cls, estadoTxt, estCls, meta) =>
  `<div class="pessoa ${cls}">${spriteSVG(info)}${cls === 'trab' ? `<span class="balao">${esc(info.balao || '…')}</span>` : ''}<div class="nome">${esc(info.nome)}</div><div class="estado ${estCls}">${esc(estadoTxt)}</div><div class="meta">${esc(meta)}</div></div>`;

let lastKey = '', prevAct = new Set(), logLines = [];
function render() {
  const { agentes, sessoes } = derivar(events);
  const T = CFG.textos || {}, now = Date.now();
  const ativos = agentes.filter(a => a.estado !== 'done').sort((a, b) => a.inicio - b.inicio);
  const feitos = agentes.filter(a => a.estado === 'done').sort((a, b) => b.fim - a.fim);

  // HUD
  const porTipo = {}; agentes.forEach(a => porTipo[tipoInfo(a.tipo).nome] = (porTipo[tipoInfo(a.tipo).nome] || 0) + 1);
  $('hud').innerHTML = `<div class="pill">ativos <b>${ativos.filter(a => a.estado === 'work').length}</b></div><div class="pill">encerrados <b>${feitos.length}</b></div><div class="pill">sessões <b>${sessoes.length}</b></div>` +
    Object.entries(porTipo).map(([n, c]) => `<div class="pill">${esc(n)} <b>${c}</b></div>`).join('');

  // cena: um personagem por agente / sessão
  const lista = [];
  // agentes únicos (config.agentesUnicos) aparecem UMA vez: só a execução mais recente (a que está trabalhando, se houver)
  const unicos = new Set(CFG.agentesUnicos || []), jaTem = new Set(), manter = new Set();
  [...ativos, ...feitos].sort((a, b) => b.inicio - a.inicio).forEach(a => { if (unicos.has(a.tipo)) { if (jaTem.has(a.tipo)) return; jaTem.add(a.tipo); } manter.add(a); });
  sessoes.forEach(s => lista.push({ id: 's:' + s.id, tipo: 'sessao', sessId: s.id, estado: s.estado, info: { cor: '#ffffff', cabelo: '#222222', balao: '💬' }, rotulo: s.projeto || 'sessão', sub: s.estado === 'work' ? (T.trabalhando || 'trabalhando') : 'aguardando' }));
  ativos.filter(a => manter.has(a)).forEach(a => { const v = visual(a); lista.push({ id: 'a:' + (a.id || a.inicio), tipo: 'agente', tipoKey: a.tipo, run: a.id, desc: v.desc, estado: a.estado, info: v.info, rotulo: v.rotulo, sub: (a.estado === 'sumido' ? (T.sumiu || 'sumiu?') + ' ' : '') + dur(now - a.inicio) }); });
  feitos.filter(a => manter.has(a)).slice(0, CFG.maxNoSofa || 12).forEach(a => { const v = visual(a); lista.push({ id: 'a:' + (a.id || a.inicio), tipo: 'agente', tipoKey: a.tipo, run: a.id, desc: v.desc, estado: 'done', info: v.info, rotulo: v.rotulo, sub: dur(a.fim - a.inicio) }); });
  Cena.sync(lista);

  // log de mudanças
  const act = new Set(ativos.map(a => a.id));
  for (const a of ativos) if (!prevAct.has(a.id)) logLines.unshift(`${new Date().toLocaleTimeString()} <b>${esc(tipoInfo(a.tipo).nome)}</b> entrou em ação`);
  for (const id of prevAct) if (!act.has(id)) { const a = agentes.find(x => x.id === id); if (a) logLines.unshift(`${new Date().toLocaleTimeString()} <b>${esc(tipoInfo(a.tipo).nome)}</b> ${esc(T.concluiu || 'concluiu')}`); }
  prevAct = act; logLines = logLines.slice(0, 40);
  $('log').innerHTML = logLines.map(l => `<div>${l}</div>`).join('') || `<div>${esc(T.semAgentes || '')}</div>`;
}

/* ---------- fonte de dados ---------- */
function parseEvents(txt) { try { const j = JSON.parse(txt.replace(/^﻿/, '')); return Array.isArray(j) ? j : (j ? [j] : []); } catch (e) { return null; } }
async function poll() {
  if (demo || ['sse', 'firebase'].includes((CFG.fonteDados || {}).tipo)) { render(); return; }
  const src = CFG.fonteDados || { tipo: 'arquivo', url: 'data/events.json' };
  try {
    const r = await fetch(src.url + (src.url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
    const ev = parseEvents(await r.text()); if (ev) events = ev;
  } catch (e) {}
  render();
}
function startStream() {
  const src = CFG.fonteDados || {};
  if (sse) { sse.close(); sse = null; }
  if (demo || !src.url) return;
  if (src.tipo === 'sse') {
    sse = new EventSource(src.url);
    sse.onmessage = m => { const ev = parseEvents(m.data); if (ev) { events = events.concat(ev).slice(-1000); render(); } };
  } else if (src.tipo === 'firebase') {
    // Firebase Realtime Database: stream (SSE) de /salas/<id>/eventos. Mantém um mapa chave -> evento.
    const store = {};
    const sync = () => { events = Object.values(store); render(); };
    sse = new EventSource(src.url + (src.url.includes('?') ? '&' : '?') + 'orderBy="$key"&limitToLast=' + (src.limite || 300));
    const lidar = (path, data, merge) => {
      if (path === '/') { if (!merge) for (const k of Object.keys(store)) delete store[k]; if (data) Object.assign(store, data); }
      else { const k = path.split('/')[1]; if (data === null) delete store[k]; else store[k] = data; }
      sync();
    };
    sse.addEventListener('put', m => { try { const j = JSON.parse(m.data); lidar(j.path, j.data, false); } catch (e) {} });
    sse.addEventListener('patch', m => { try { const j = JSON.parse(m.data); lidar(j.path, j.data, true); } catch (e) {} });
  }
}

/* ---------- demo ---------- */
const DEMO_REL = '**O que fiz:** roteiro-base de 10 falas com a lição final.\n**Entregas:** Conteudo_Bit/Semanal/teste_bit/roteiro_base.md\n**Erros ou retrabalho:** nenhum.\n**Atendi ao que foi pedido?** sim.\n**Falta aprovar:** o tema.';
const DEMO_TIPOS = ['bit', 'insta', 'din', 'tit', 'explorador'];
function demoStart() {
  Cena.reset();
  demo = true; events = []; let n = 0; const now = Date.now(), iso = ms => new Date(ms).toISOString();
  const add = (ev, o) => events.push({ t: iso(o.t ?? Date.now()), ev, session: 'demo1', agent: o.agent || '', type: o.type || '', project: 'Projetos', tool: o.tool || '', alvo: o.alvo || '', arquivo: o.arquivo || '', resumo: o.resumo || '' });
  // atividade falsa de ferramentas e uma entrega real (o roteiro de teste) para a ficha funcionar no demo
  const ferr = [['WebSearch', 'tema em alta em tecnologia hoje'], ['Read', 'Conteudo_Bit/LEIA-ME.md'], ['Grep', 'gancho'], ['WebFetch', 'https://canaltech.com.br/…']];
  const trabalho = (id, tipo, t0) => { ferr.slice(0, 2 + (n % 3)).forEach((f, k) => add('PostToolUse', { agent: id, type: tipo, tool: f[0], alvo: f[1], t: t0 + (k + 1) * 8e3 })); };
  add('SessionStart', { t: now - 40 * 60e3 }); add('UserPromptSubmit', { t: now - 39 * 60e3 });
  for (let i = 0; i < 5; i++) {
    const id = 'd' + (n++), tipo = DEMO_TIPOS[i % 5], s = now - (35 - i * 5) * 60e3;
    add('SubagentStart', { agent: id, type: tipo, t: s }); trabalho(id, tipo, s);
    add('PostToolUse', { agent: id, type: tipo, tool: 'Write', alvo: 'roteiro_base.md', arquivo: 'Conteudo_Bit/Semanal/teste_bit/roteiro_base.md', t: s + 60e3 });
    add('SubagentStop', { agent: id, type: tipo, t: s + (2 + i) * 60e3, resumo: DEMO_REL });
  }
  for (let i = 0; i < 3; i++) { const id = 'd' + (n++), tipo = DEMO_TIPOS[i], s = now - (i + 1) * 20e3; add('SubagentStart', { agent: id, type: tipo, t: s }); trabalho(id, tipo, s); }
  render();
  demoTimer = setInterval(() => {
    const abertos = events.filter(e => e.ev === 'SubagentStart' && !events.some(x => x.ev === 'SubagentStop' && x.agent === e.agent));
    if (abertos.length && (Math.random() < .5 || abertos.length > 5)) {
      const a = abertos[Math.floor(Math.random() * abertos.length)];
      add('PostToolUse', { agent: a.agent, type: a.type, tool: 'Write', alvo: 'roteiro_base.md', arquivo: 'Conteudo_Bit/Semanal/teste_bit/roteiro_base.md' });
      add('SubagentStop', { agent: a.agent, type: a.type, resumo: DEMO_REL });
    } else { const id = 'd' + (n++), tipo = DEMO_TIPOS[Math.floor(Math.random() * 5)]; add('SubagentStart', { agent: id, type: tipo }); trabalho(id, tipo, Date.now()); }
    render();
  }, 2500);
}
function demoStop() { Cena.reset(); demo = false; clearInterval(demoTimer); events = []; poll(); startStream(); }

/* ---------- painel de configuração ---------- */
function openDrawer() { $('cfg').value = JSON.stringify(CFG, null, 2); $('cfgErr').textContent = ''; $('drawer').hidden = false; }
function saveCfg(obj) { try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch (e) {} }
function bind() {
  $('btnCfg').onclick = openDrawer; $('fechar').onclick = () => $('drawer').hidden = true;
  $('btnDemo').onclick = () => { if (demo) { demoStop(); $('btnDemo').textContent = '▶ demo'; } else { demoStart(); $('btnDemo').textContent = '■ demo'; } };
  $('janela').onchange = e => { CFG.janelaHoras = +e.target.value; saveCfg(CFG); render(); };
  $('selTema').onchange = e => { CFG.tema = e.target.value; saveCfg(CFG); applyTheme(); $('cfg').value = JSON.stringify(CFG, null, 2); render(); };
  $('aplicar').onclick = () => { try { CFG = JSON.parse($('cfg').value); saveCfg(CFG); applyTheme(); Cena.setCfg(CFG); Cena.reset(); render(); startStream(); $('cfgErr').textContent = ''; } catch (e) { $('cfgErr').textContent = 'JSON inválido: ' + e.message; } };
  $('restaurar').onclick = () => { try { localStorage.removeItem(LS_KEY); } catch (e) {} CFG = JSON.parse(JSON.stringify(BASE)); applyTheme(); Cena.setCfg(CFG); Cena.reset(); render(); $('cfg').value = JSON.stringify(CFG, null, 2); };
  $('exportar').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(CFG, null, 2)], { type: 'application/json' })); a.download = 'config.json'; a.click(); };
}

(async function init() {
  await loadConfig(); applyTheme(); bind(); Cena.init($('cena'), CFG);
  if (new URLSearchParams(location.search).has('demo')) { demoStart(); $('btnDemo').textContent = '■ demo'; }
  else { await poll(); startStream(); }
  setInterval(poll, (CFG.pollSegundos || 4) * 1000);
  setInterval(render, 1000);
})();
