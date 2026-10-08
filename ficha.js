'use strict';
/* Ficha do agente (clique no personagem) e Revisão semanal.
   Depende do servidor local (serve.ps1) para ler entregas, salvar avaliações/memória e gerir agentes.
   Na versão online (sem servidor) a ficha mostra só o que vem dos eventos. */

let fItem = null, fAba = 'atividade', fDoc = null, AVAL = [];
const API = async (rota, corpo) => {
  try {
    const r = await fetch(rota, corpo ? { method: 'POST', headers: { 'X-Sala': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : { cache: 'no-store' });
    return await r.json();
  } catch (e) { return null; }
};
const ICONE = { Read: '📖', Glob: '🔎', Grep: '🔎', WebSearch: '🌐', WebFetch: '🌐', Write: '✍️', Edit: '✏️', Bash: '⚙️', NotebookEdit: '✏️' };
const hora = t => new Date(t).toLocaleTimeString().slice(0, 8);
const diaHora = t => new Date(t).toLocaleString().slice(0, 16);

async function carregarAval() {
  const r = await API('/api/avaliacoes');
  try { AVAL = r && r.texto ? JSON.parse(r.texto.replace(/^﻿/, '')) : []; } catch (e) { AVAL = []; }
}

/* ---------- números por agente ---------- */
function statsDe(tipo, desde = 0) {
  const t0 = desde || 0;
  const tarefas = events.filter(e => e.ev === 'SubagentStop' && baseOuIgual(e.type, tipo) && new Date(e.t) >= t0).length;
  const av = avalUnicas().filter(a => a.agente === tipo && new Date(a.t) >= t0);
  const ups = av.filter(a => a.nota === 'up').length, downs = av.filter(a => a.nota === 'down').length;
  const retrab = av.filter(a => (a.tags || []).includes('retrabalho')).length;
  return { tarefas, ups, downs, retrab, aval: ups + downs, aprov: ups + downs ? Math.round(ups / (ups + downs) * 100) : null };
}
// a nota mais recente de cada tarefa (run) ou, sem run, de cada arquivo
function avalUnicas() { const m = new Map(); AVAL.forEach(a => m.set(a.run ? 'r:' + a.run : 'f:' + a.agente + '|' + a.arquivo, a)); return [...m.values()]; }
const baseOuIgual = (a, b) => a === b;
function xpNivel(tipo) {
  const s = statsDe(tipo);
  const xp = Math.max(0, s.tarefas * 10 + s.ups * 50 - s.downs * 20);
  const nivel = 1 + Math.floor(Math.sqrt(xp / 40));
  const ini = 40 * (nivel - 1) ** 2, fim = 40 * nivel ** 2;
  return { xp, nivel, pct: Math.min(100, Math.round((xp - ini) / (fim - ini) * 100)), s };
}

/* ---------- ficha ---------- */
function abrirFicha(item) {
  if (!item) return;
  fItem = item; fDoc = null; fAba = 'atividade';
  const sessao = item.tipo === 'sessao', tipo = item.tipoKey || '';
  const info = item.info || {};
  $('fAvatar').innerHTML = spriteSVG(info, 5);
  $('fNome').textContent = sessao ? 'Sessão: ' + item.rotulo : (item.rotulo || info.nome || tipo) + (item.desc ? ' — ' + item.desc : '');
  if (sessao) { $('fSub').textContent = 'Conversa principal do Claude Code'; $('fXp').style.width = '0'; $('fNivel').textContent = ''; }
  else {
    const x = xpNivel(tipo);
    $('fSub').textContent = info.descricao || '';
    $('fXp').style.width = x.pct + '%';
    $('fNivel').textContent = `Nível ${x.nivel} · ${x.xp} XP · ${x.s.tarefas} tarefas · 👍 ${x.s.ups}  👎 ${x.s.downs}`;
    API('/api/agentes').then(r => { const a = r && r.itens && r.itens.find(i => i.nome === tipo); if (a && fItem === item) $('fSub').textContent = `${a.modelo} · ${a.descricao.slice(0, 140)}`; });
  }
  document.querySelectorAll('#ficha .tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === 'atividade'));
  $('ficha').hidden = false; desenharAba();
}
function eventosDoItem() {
  if (!fItem) return [];
  if (fItem.tipo === 'sessao') return events.filter(e => e.session === fItem.sessId && !e.agent);
  return events.filter(e => e.agent === fItem.run);
}
function desenharAba() {
  if (!fItem) return;
  const el = $('fBody');
  if (fAba === 'atividade') return abaAtividade(el);
  if (fAba === 'entregas') return abaEntregas(el);
  return abaMemoria(el);
}
function abaAtividade(el) {
  const evs = eventosDoItem().filter(e => e.ev !== 'Stop' && e.ev !== 'UserPromptSubmit').slice(-80).reverse();
  if (!evs.length) { el.innerHTML = `<div class="vazio2">Ainda sem atividade registrada. Os hooks gravam cada ferramenta que o agente usa.</div>`; return; }
  el.innerHTML = evs.map(e => {
    if (e.ev === 'SubagentStart') return `<div class="lin">🚀 <b>começou</b> <small>${hora(e.t)}</small></div>`;
    if (e.ev === 'SubagentStop') return `<div class="lin">✅ <b>terminou</b> <small>${hora(e.t)}</small>${e.resumo ? `<div>${esc(e.resumo)}</div>` : ''}</div>`;
    if (e.ev === 'PostToolUse') return `<div class="lin">${ICONE[e.tool] || '🔧'} <b>${esc(e.tool)}</b> <small>${hora(e.t)}</small><div>${esc(e.alvo || '')}</div></div>`;
    return `<div class="lin">${esc(e.ev)} <small>${hora(e.t)}</small></div>`;
  }).join('');
}
function entregasDe(tipo) {
  const m = new Map();
  events.filter(e => e.ev === 'PostToolUse' && (e.tool === 'Write' || e.tool === 'Edit') && e.arquivo && e.type === tipo)
    .forEach(e => { m.set(e.arquivo, e); });
  return [...m.values()].sort((a, b) => new Date(b.t) - new Date(a.t));
}
function notaDe(tipo, arquivo) { const l = AVAL.filter(a => a.agente === tipo && a.arquivo === arquivo); return l.length ? l[l.length - 1] : null; }
async function abaEntregas(el) {
  if (fItem.tipo === 'sessao') { el.innerHTML = `<div class="vazio2">Entregas são por agente. Clique num agente.</div>`; return; }
  const tipo = fItem.tipoKey;
  if (fDoc) return desenharDoc(el, tipo);
  const lista = entregasDe(tipo);
  if (!lista.length) { el.innerHTML = `<div class="vazio2">Este agente ainda não entregou nenhum arquivo.</div>`; return; }
  el.innerHTML = lista.map((e, i) => {
    const n = notaDe(tipo, e.arquivo);
    return `<div class="entrega" data-i="${i}">📄 <b>${esc(e.arquivo.split('/').pop())}</b>${n ? `<span class="badge ${n.nota}">${n.nota === 'up' ? '👍 aprovado' : '👎 reprovado'}</span>` : '<span class="badge">sem nota</span>'}<div class="nota">${esc(e.arquivo)} · ${diaHora(e.t)}</div></div>`;
  }).join('');
  el.querySelectorAll('.entrega').forEach(d => d.onclick = async () => {
    const e = lista[+d.dataset.i]; el.innerHTML = '<div class="vazio2">Abrindo…</div>';
    const r = await API('/api/arquivo?p=' + encodeURIComponent(e.arquivo));
    fDoc = { arquivo: e.arquivo, texto: r && r.texto != null ? r.texto : '(não foi possível abrir: ' + (r ? r.erro : 'servidor local desligado') + ')' };
    desenharDoc(el, tipo);
  });
}
function desenharDoc(el, tipo) {
  const n = notaDe(tipo, fDoc.arquivo);
  el.innerHTML = `<div class="acoes"><button id="dVoltar">← entregas</button></div>
    <div class="nota">${esc(fDoc.arquivo)}</div><pre class="doc">${esc(fDoc.texto)}</pre>
    <div class="nota">${n ? 'Sua última nota: ' + (n.nota === 'up' ? '👍' : '👎') + (n.comentario ? ' — ' + esc(n.comentario) : '') : 'Ainda sem nota.'}</div>
    <textarea id="dCom" rows="2" placeholder="O que ficou bom ou ruim? (vira lição na memória do agente)"></textarea>
    <div class="acoes"><button id="dUp">👍 aprovar</button><button id="dDown">👎 reprovar</button></div><div class="nota" id="dMsg"></div>`;
  $('dVoltar').onclick = () => { fDoc = null; desenharAba(); };
  const enviar = async nota => {
    if (demo) { $('dMsg').textContent = 'Modo demo: a nota não é salva.'; return; }
    const r = await API('/api/avaliar', { agente: tipo, run: fItem.run || '', arquivo: fDoc.arquivo, nota, comentario: $('dCom').value });
    $('dMsg').textContent = r && r.ok ? 'Salvo. O agente vai ler isso da próxima vez.' : 'Não consegui salvar (servidor local desligado?).';
    if (r && r.ok) { await carregarAval(); abrirFichaMantendo(); }
  };
  $('dUp').onclick = () => enviar('up'); $('dDown').onclick = () => enviar('down');
}
function abrirFichaMantendo() { const d = fDoc, a = fAba; abrirFicha(fItem); fAba = a; fDoc = d; document.querySelectorAll('#ficha .tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === a)); desenharAba(); }
async function abaMemoria(el) {
  if (fItem.tipo === 'sessao') { el.innerHTML = `<div class="vazio2">A memória é por agente.</div>`; return; }
  const tipo = fItem.tipoKey; el.innerHTML = '<div class="vazio2">Lendo…</div>';
  const r = await API('/api/memoria?agente=' + encodeURIComponent(tipo));
  if (!r) { el.innerHTML = `<div class="vazio2">Servidor local desligado: a memória só aparece na versão local.</div>`; return; }
  el.innerHTML = `<div class="nota">Arquivo <code>.claude/agent-memory/${esc(tipo)}.md</code>. O agente lê isto ao começar e anota o que aprendeu ao terminar. Suas notas 👍/👎 entram aqui.</div>
    <textarea id="mTxt" rows="18">${esc(r.texto || '')}</textarea><div class="acoes"><button id="mSalvar">Salvar</button></div><div class="nota" id="mMsg"></div>`;
  $('mSalvar').onclick = async () => { const o = await API('/api/memoria?agente=' + encodeURIComponent(tipo), { texto: $('mTxt').value }); $('mMsg').textContent = o && o.ok ? 'Salvo.' : 'Falhou.'; };
}

/* ---------- revisão semanal ---------- */
async function abrirRevisao() {
  $('revisao').hidden = false; const el = $('rBody'); el.innerHTML = '<div class="vazio2">Calculando…</div>';
  await carregarAval();
  const R = { fracao: .25, minAvaliacoes: 3, dias: 7, ...(CFG.revisao || {}) };
  const desde = Date.now() - R.dias * 864e5;
  const ag = await API('/api/agentes');
  const ativos = (ag && ag.itens ? ag.itens.filter(a => a.ativo).map(a => a.nome) : [...new Set(events.map(e => e.type).filter(Boolean))]);
  const linhas = ativos.map(n => { const x = xpNivel(n), s = statsDe(n, desde); return { nome: n, info: tipoInfo(n), grupo: tipoInfo(n).grupo, s, nivel: x.nivel, xp: x.xp, elegivel: s.aval >= R.minAvaliacoes }; });
  const grupos = {}; linhas.forEach(l => (grupos[l.grupo] = grupos[l.grupo] || []).push(l));
  let html = `<div class="nota">Janela: últimos ${R.dias} dias · só entram no ranking agentes com pelo menos ${R.minAvaliacoes} notas suas · seleção: ${Math.round(R.fracao * 100)}% melhores e piores <b>dentro do mesmo grupo</b>. Nada é feito sem o seu clique.</div>`;
  for (const [g, lista] of Object.entries(grupos)) {
    lista.sort((a, b) => (b.s.ups - b.s.downs) - (a.s.ups - a.s.downs) || (b.s.aprov || 0) - (a.s.aprov || 0));
    const el2 = lista.filter(l => l.elegivel), k = Math.max(1, Math.floor(el2.length * R.fracao));
    const podeSelecionar = el2.length >= 2;
    const top = podeSelecionar ? el2.slice(0, k) : [], bot = podeSelecionar ? el2.slice(-k).reverse() : [];
    html += `<h3>Grupo: ${esc(g)}</h3><table class="rank"><tr><th>Agente</th><th>Nível</th><th>Tarefas</th><th>👍</th><th>👎</th><th>Aprovação</th><th>Retrabalho</th><th></th></tr>` +
      lista.map(l => `<tr class="${top.includes(l) ? 'top' : bot.includes(l) ? 'bot' : ''}"><td>${esc(l.info.nome)} <small>(${esc(l.nome)})</small></td><td>${l.nivel}</td><td>${l.s.tarefas}</td><td>${l.s.ups}</td><td>${l.s.downs}</td><td>${l.s.aprov == null ? '—' : l.s.aprov + '%'}</td><td>${l.s.retrab}</td><td>${l.elegivel ? (top.includes(l) ? '⭐ replicar' : bot.includes(l) ? '⚠ aposentar?' : '') : '<span class="nota">poucas notas</span>'}</td></tr>`).join('') + '</table>';
    if (!podeSelecionar) html += `<div class="nota">Sem proposta neste grupo: precisa de pelo menos 2 agentes com ${R.minAvaliacoes}+ notas. Para competir, crie um segundo agente do mesmo grupo (ex.: <code>${esc(lista[0].nome)}-v2</code>).</div>`;
    else top.forEach((melhor, i) => {
      const pior = bot[i]; if (!pior || pior === melhor) return;
      const sug = melhor.nome.replace(/-(v|b)?\d+$/, '') + '-v' + (Math.floor(Date.now() / 6048e5) % 1000);
      html += `<div class="prop" data-pior="${esc(pior.nome)}" data-melhor="${esc(melhor.nome)}"><b>Proposta:</b> aposentar <b>${esc(pior.info.nome)}</b> e replicar <b>${esc(melhor.info.nome)}</b>.
        <div class="nota">O clone herda o prompt e a memória do campeão, com uma variação para testar na próxima semana. O aposentado vai para <code>.claude/agents/_aposentados/</code> (dá para voltar).</div>
        <input class="pNome" value="${esc(sug)}" placeholder="nome do clone"><textarea class="pVar" rows="2" placeholder="Variação a testar (ex.: 'abra sempre com uma pergunta'; 'pesquise 2 fontes a mais')"></textarea>
        <div class="acoes"><button class="pOk">Aprovar troca</button></div><div class="nota pMsg"></div></div>`;
    });
  }
  if (!linhas.length) html += '<div class="vazio2">Nenhum agente encontrado.</div>';
  el.innerHTML = html;
  el.querySelectorAll('.prop').forEach(p => p.querySelector('.pOk').onclick = async () => {
    const pior = p.dataset.pior, melhor = p.dataset.melhor, para = p.querySelector('.pNome').value.trim(), variacao = p.querySelector('.pVar').value.trim();
    if (!variacao) { p.querySelector('.pMsg').textContent = 'Descreva a variação a testar.'; return; }
    if (!confirm(`Aposentar "${pior}" e criar "${para}" a partir de "${melhor}"?`)) return;
    const c = await API('/api/clonar', { de: melhor, para, variacao });
    if (!c || !c.ok) { p.querySelector('.pMsg').textContent = 'Não consegui clonar: ' + (c ? c.erro : 'servidor local desligado'); return; }
    const a = await API('/api/arquivar', { agente: pior });
    p.querySelector('.pMsg').textContent = a && a.ok ? `Pronto: ${pior} aposentado, ${para} criado. Vale a partir da próxima sessão do Claude Code.` : 'Clone criado, mas não consegui aposentar ' + pior + '.';
  });
}

/* ---------- avaliação logo que o agente termina ---------- */
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const CHIPS = [['atendeu', 'Atendeu o que pedi'], ['sem_problemas', 'Sem problemas'], ['retrabalho', 'Teve retrabalho'], ['errou', 'Errou'], ['nao_atendeu', 'Não era isso']];
const iniciadoEm = Date.now(), avaliadoDemo = new Set(), jaAvisado = new Set();
const foiAvaliado = run => avaliadoDemo.has(run) || avalUnicas().some(a => a.run === run);
function pendentesAval() {
  return derivar(events).agentes.filter(a => a.estado === 'done' && a.id && !foiAvaliado(a.id)).sort((x, y) => y.fim - x.fim);
}
async function avaliarRun(a, nota, tags, com) {
  const agente = a.tipo && /^[a-z0-9][a-z0-9-]*$/.test(a.tipo) ? a.tipo : 'geral';
  if (demo || !LOCAL) avaliadoDemo.add(a.id);
  else {
    const r = await API('/api/avaliar', { agente, run: a.id, arquivo: (a.arquivos || []).slice(-1)[0] || '', nota, tags, comentario: com || '', contexto: String(a.resumo || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').slice(0, 140) });
    if (!r || !r.ok) { alert('Não consegui salvar a nota (o servidor local está ligado?)'); return false; }
    await carregarAval();
  }
  atualizarAval(); return true;
}
function cardAval(a, compacto) {
  const v = visual(a), rel = a.resumo || '(o agente não deixou relatório)', arqs = a.arquivos || [];
  const el = document.createElement('div'); el.className = compacto ? 'toast' : 'cardav'; el.dataset.run = a.id;
  const quem = `<div class="quem">${spriteSVG(v.info, 3)}<span>${esc(v.rotulo)}</span><small class="nota">terminou · ${dur(a.fim - a.inicio)}${v.desc ? ' · ' + esc(v.desc) : ''}</small></div>`;
  const botoes = `<div class="bt"><button class="btn-joia">👍 Joia</button><button class="btn-dis">👎 Deslike</button>${compacto ? '<button class="det">detalhes</button>' : ''}</div>`;
  el.innerHTML = quem + (compacto
    ? `<div class="rel">${esc(rel.replace(/\*\*/g, '').slice(0, 240))}</div>`
    : `<pre class="rel">${esc(rel.replace(/\*\*/g, ''))}</pre>${arqs.length ? `<div class="nota">Entregas: ${arqs.map(esc).join(', ')}</div>` : ''}<div class="chips">${CHIPS.map(c => `<button class="chip" data-t="${c[0]}">${c[1]}</button>`).join('')}</div><textarea class="com" rows="2" placeholder="Comentário (opcional): o que ficou bom ou ruim? Vira lição na memória do agente."></textarea>`) + botoes;
  el.querySelectorAll('.chip').forEach(c => c.onclick = () => c.classList.toggle('on'));
  const tags = () => [...el.querySelectorAll('.chip.on')].map(c => c.dataset.t), com = () => (el.querySelector('.com') || {}).value || '';
  el.querySelector('.btn-joia').onclick = () => avaliarRun(a, 'up', tags(), com());
  el.querySelector('.btn-dis').onclick = () => avaliarRun(a, 'down', tags(), com());
  const d = el.querySelector('.det'); if (d) d.onclick = abrirAval;
  return el;
}
function atualizarAval() {
  if (!LOCAL && !demo) { $('btnAval').hidden = true; return; }
  const pend = pendentesAval(), ids = new Set(pend.map(a => a.id));
  $('btnAval').hidden = !pend.length; $('btnAval').innerHTML = `⭐ avaliar <b>${pend.length}</b>`;
  const T = $('toasts');
  [...T.children].forEach(t => { if (!ids.has(t.dataset.run)) t.remove(); });
  pend.filter(a => (a.fim >= iniciadoEm - 5000) && !jaAvisado.has(a.id)).forEach(a => { jaAvisado.add(a.id); T.appendChild(cardAval(a, true)); });
  while (T.children.length > 4) T.firstChild.remove();
  if (!$('aval').hidden) desenharAval();
}
function desenharAval() {
  const pend = pendentesAval(), el = $('aBody'); el.innerHTML = '';
  if (!pend.length) { el.innerHTML = '<div class="vazio2">Nada esperando a sua nota. 🎉</div>'; return; }
  pend.forEach(a => el.appendChild(cardAval(a, false)));
}
function abrirAval() { $('aval').hidden = false; desenharAval(); }

/* ---------- ligações ---------- */
function ligarFicha() {
  const cv = $('cena');
  const frac = ev => { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height]; };
  cv.addEventListener('click', ev => { const it = Cena.pick(...frac(ev)); if (it) abrirFicha(it); });
  cv.addEventListener('mousemove', ev => { cv.style.cursor = Cena.pick(...frac(ev)) ? 'pointer' : 'default'; });
  $('fFechar').onclick = () => { $('ficha').hidden = true; fItem = null; };
  document.querySelectorAll('#ficha .tabs button').forEach(b => b.onclick = () => { fAba = b.dataset.t; fDoc = null; document.querySelectorAll('#ficha .tabs button').forEach(x => x.classList.toggle('on', x === b)); desenharAba(); });
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) $('btnRev').hidden = true;   // revisão semanal só no servidor local
  $('btnRev').onclick = abrirRevisao; $('rFechar').onclick = () => $('revisao').hidden = true;
  $('btnAval').onclick = abrirAval; $('aFechar').onclick = () => $('aval').hidden = true;
  carregarAval().then(atualizarAval); setInterval(atualizarAval, 2000);
  setInterval(() => { if (fItem && !$('ficha').hidden && fAba === 'atividade') abaAtividade($('fBody')); }, 2000);
}
ligarFicha();
