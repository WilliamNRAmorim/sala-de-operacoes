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
  if (!evs.length) { el.innerHTML = `<div class="vazio2">Sem atividade.</div>`; return; }
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
  if (fItem.tipo === 'sessao') { el.innerHTML = `<div class="vazio2">Selecione um agente.</div>`; return; }
  const tipo = fItem.tipoKey;
  if (fDoc) return desenharDoc(el, tipo);
  const lista = entregasDe(tipo);
  if (!lista.length) { el.innerHTML = `<div class="vazio2">Nenhuma entrega.</div>`; return; }
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
  if (fItem.tipo === 'sessao') { el.innerHTML = `<div class="vazio2">Selecione um agente.</div>`; return; }
  const tipo = fItem.tipoKey; el.innerHTML = '<div class="vazio2">Lendo…</div>';
  const r = await API('/api/memoria?agente=' + encodeURIComponent(tipo));
  if (!r) { el.innerHTML = `<div class="vazio2">Memória indisponível aqui (abra pelo servidor local).</div>`; return; }
  el.innerHTML = `<div class="nota">Arquivo <code>.claude/agent-memory/${esc(tipo)}.md</code>. O agente lê isto ao começar e anota o que aprendeu ao terminar. Suas notas 👍/👎 entram aqui.</div>
    <textarea id="mTxt" rows="18">${esc(r.texto || '')}</textarea><div class="acoes"><button id="mSalvar">Salvar</button></div><div class="nota" id="mMsg"></div>`;
  $('mSalvar').onclick = async () => { const o = await API('/api/memoria?agente=' + encodeURIComponent(tipo), { texto: $('mTxt').value }); $('mMsg').textContent = o && o.ok ? 'Salvo.' : 'Falhou.'; };
}

/* ---------- relatório semanal ---------- */
const pad2 = n => String(n).padStart(2, '0');
const dataBR = t => { const d = new Date(t); return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1); };
const dataISO = t => { const d = new Date(t); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
const tiraMd = s => String(s || '').replace(/\*\*/g, '').trim();
// o que o próprio agente admitiu na linha "Erros ou retrabalho:" do relatório final dele
const admissao = resumo => { const m = /Erros ou retrabalho:\s*([^\n]+)/i.exec(tiraMd(resumo)); return m && !/^(nenhum|nada|—|-)\.?$/i.test(m[1].trim()) ? m[1].trim() : ''; };
// o que foi avaliado: contexto gravado na nota, senão o arquivo, senão a descrição da tarefa (pelo id da execução)
let RUNS_SEMANA = {};
const ctxCurto = a => { const r = RUNS_SEMANA[a.run] || {}; const arq = a.arquivo && !a.arquivo.includes('agent-memory') ? a.arquivo : ''; return String(a.contexto || arq || r.nome || (r.arquivos && r.arquivos[0]) || r.tipo || '').replace(/\s+/g, ' ').slice(0, 90); };

async function coletarSemana() {
  const R = { fracao: .25, minAvaliacoes: 3, dias: 7, ...(CFG.revisao || {}) };
  await carregarAval();
  const h = await API('/api/historico?dias=' + R.dias);
  const evs = Array.isArray(h) ? h : events;                  // sem servidor local: usa o que a página já tem
  const desde = Date.now() - R.dias * 864e5, ate = Date.now();
  const runs = derivar(evs, R.dias * 24).agentes;
  RUNS_SEMANA = Object.fromEntries(runs.filter(r => r.id).map(r => [r.id, r]));
  const ag = await API('/api/agentes');
  const nomes = new Set([...(ag && ag.itens ? ag.itens.filter(a => a.ativo).map(a => a.nome) : []), ...runs.map(r => r.tipo)]);
  const avs = avalUnicas().filter(a => new Date(a.t) >= desde);
  const agentes = [];
  for (const nome of nomes) {
    const mine = runs.filter(r => r.tipo === nome), done = mine.filter(r => r.estado === 'done');
    const av = avs.filter(a => a.agente === nome), ups = av.filter(a => a.nota === 'up'), downs = av.filter(a => a.nota === 'down');
    const tag = t => av.filter(a => (a.tags || []).includes(t)).length;
    const avRuns = new Set(av.map(a => a.run).filter(Boolean));
    const semNota = done.filter(r => !avRuns.has(r.id) && !foiAvaliado(r.id)).length;
    const ids = new Set(mine.map(r => r.id)), ferr = {};
    evs.filter(e => e.ev === 'PostToolUse' && ids.has(e.agent) && e.tool !== 'Agent').forEach(e => { ferr[e.tool] = (ferr[e.tool] || 0) + 1; });
    const entregas = [...new Map(mine.flatMap(r => (r.arquivos || []).filter(f => !f.includes('agent-memory')).map(f => [f, { arquivo: f, t: r.fim || r.inicio }]))).values()];
    const admitidos = done.map(r => ({ r, txt: admissao(r.resumo) })).filter(x => x.txt);
    let mem = []; const m = await API('/api/memoria?agente=' + encodeURIComponent(nome));
    // só as lições que o próprio agente escreveu (as linhas APROVADO/REPROVADO já aparecem em Acertos e Erros)
    if (m && m.texto) mem = m.texto.split('\n').filter(l => { const x = /^- \[(\d{4}-\d{2}-\d{2})\]/.exec(l); return x && new Date(x[1] + 'T00:00:00') >= desde - 864e5 && !/^- \[[\d-]+\] (APROVADO|REPROVADO)/.test(l); });
    const tempoMedio = done.length ? done.reduce((s, r) => s + (r.fim - r.inicio), 0) / done.length : 0;
    agentes.push({ nome, info: tipoInfo(nome), grupo: tipoInfo(nome).grupo, tarefas: done.length, ups, downs, aval: av.length, aprov: av.length ? Math.round(ups.length / av.length * 100) : null, retrab: tag('retrabalho'), errou: tag('errou'), naoAtendeu: tag('nao_atendeu'), semNota, ferr, entregas, admitidos, mem, tempoMedio, nivel: xpNivel(nome).nivel, av });
  }
  agentes.sort((a, b) => b.tarefas - a.tarefas || a.nome.localeCompare(b.nome));
  return { R, desde, ate, agentes };
}
// quem replicar e quem aposentar: só entram agentes com notas suficientes, comparados dentro do mesmo grupo
function decidir(S) {
  const grupos = {}; S.agentes.forEach(a => (grupos[a.grupo] = grupos[a.grupo] || []).push(a));
  const props = [], faltam = [];
  for (const [g, lista] of Object.entries(grupos)) {
    const el = lista.filter(a => a.aval >= S.R.minAvaliacoes).sort((a, b) => (b.ups.length - b.downs.length) - (a.ups.length - a.downs.length) || (b.aprov || 0) - (a.aprov || 0));
    if (el.length < 2) { lista.filter(a => a.tarefas).forEach(a => faltam.push(`${a.info.nome} ${a.aval}/${S.R.minAvaliacoes}`)); continue; }
    const k = Math.max(1, Math.floor(el.length * S.R.fracao)), top = el.slice(0, k), bot = el.slice(-k).reverse();
    top.forEach((melhor, i) => { const pior = bot[i]; if (pior && pior !== melhor) props.push({ grupo: g, melhor, pior }); });
  }
  return { props, faltam };
}
function relatorioMD(S) {
  const D = decidir(S), L = [], ano = new Date(S.ate).getFullYear();
  L.push(`# Relatório semanal: ${dataBR(S.desde)} a ${dataBR(S.ate)}/${ano}`, '', '## Resumo', '',
    '| Agente | Nível | Tarefas | 👍 | 👎 | Sem nota | Aprovação | Retrabalho | Errou | Tempo médio |', '|---|---|---|---|---|---|---|---|---|---|');
  S.agentes.filter(a => a.tarefas || a.aval).forEach(a => L.push(`| ${a.info.nome} | ${a.nivel} | ${a.tarefas} | ${a.ups.length} | ${a.downs.length} | ${a.semNota} | ${a.aprov == null ? '-' : a.aprov + '%'} | ${a.retrab} | ${a.errou} | ${a.tempoMedio ? dur(a.tempoMedio) : '-'} |`));
  L.push('', '## Decisão', '');
  if (D.props.length) D.props.forEach(p => L.push(`- Replicar **${p.melhor.info.nome}** e aposentar **${p.pior.info.nome}** (grupo ${p.grupo}): aprovação ${p.melhor.aprov}% contra ${p.pior.aprov}%.`));
  else L.push('- Nenhuma troca proposta.');
  if (D.faltam.length) L.push(`- Notas por agente (mínimo ${S.R.minAvaliacoes} para entrar no ranking): ${D.faltam.join('; ')}.`);
  const parados = S.agentes.filter(a => !a.tarefas && !a.aval).map(a => a.info.nome); if (parados.length) L.push(`- Sem atividade na semana: ${parados.join(', ')}.`);
  S.agentes.forEach(a => {
    if (!a.tarefas && !a.av.length) return;
    L.push('', `## ${a.info.nome}`, '', `Tarefas ${a.tarefas} · 👍 ${a.ups.length} · 👎 ${a.downs.length} · sem nota ${a.semNota}`);
    const fez = atividadeTxt(a.ferr); if (fez) L.push('', `**O que fez:** ${fez}`);
    if (a.entregas.length) L.push('', '**Entregas:**', ...a.entregas.map(e => `- ${e.arquivo} (${dataBR(e.t)})`));
    if (a.ups.length) L.push('', '**Acertos (👍):**', ...a.ups.map(x => `- ${dataBR(x.t)} ${ctxCurto(x)}${x.comentario ? ': ' + x.comentario : ''}${(x.tags || []).length ? ' [' + x.tags.join(', ') + ']' : ''}`));
    const ruins = a.av.filter(x => x.nota === 'down' || (x.tags || []).some(t => ['retrabalho', 'errou', 'nao_atendeu'].includes(t)));
    if (ruins.length) L.push('', '**Erros e retrabalho (sua avaliação):**', ...ruins.map(x => `- ${dataBR(x.t)} ${x.nota === 'down' ? '👎 ' : ''}${ctxCurto(x)}${x.comentario ? ': ' + x.comentario : ''}${(x.tags || []).length ? ' [' + x.tags.join(', ') + ']' : ''}`));
    if (a.admitidos.length) L.push('', '**Erros que o próprio agente admitiu:**', ...a.admitidos.map(x => `- ${dataBR(x.r.fim)} ${x.r.nome ? x.r.nome + ': ' : ''}${x.txt}`));
    if (a.mem.length) L.push('', '**Lições anotadas na memória:**', ...a.mem);
  });
  return L.join('\n');
}
// markdown mínimo (títulos, tabela, lista, negrito) para exibir o relatório na janela
function mdParaHtml(md) {
  const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const out = []; let tab = null, lista = false;
  const fecha = () => { if (tab) { out.push('<table class="rank">' + tab.join('') + '</table>'); tab = null; } if (lista) { out.push('</ul>'); lista = false; } };
  md.split('\n').forEach(l => {
    if (/^\|/.test(l)) {
      if (/^\|[-| ]+\|$/.test(l)) return;
      const c = l.split('|').slice(1, -1).map(x => x.trim()); tab = tab || [];
      const th = tab.length === 0; tab.push('<tr>' + c.map(x => (th ? '<th>' : '<td>') + inl(x) + (th ? '</th>' : '</td>')).join('') + '</tr>'); return;
    }
    if (tab) fecha();
    const h = /^(#{1,2}) (.*)/.exec(l);
    if (h) { fecha(); out.push(`<h${h[1].length + 1}>${inl(h[2])}</h${h[1].length + 1}>`); return; }
    if (/^- /.test(l)) { if (!lista) { out.push('<ul>'); lista = true; } out.push('<li>' + inl(l.slice(2)) + '</li>'); return; }
    if (l.trim()) { fecha(); out.push('<p>' + inl(l) + '</p>'); }
  });
  fecha(); return out.join('');
}
async function abrirRevisao() {
  $('revisao').hidden = false; const el = $('rBody'); el.innerHTML = '<div class="vazio2">Calculando…</div>';
  const S = await coletarSemana(), D = decidir(S), md = relatorioMD(S), nome = 'semana-' + dataISO(S.ate) + '.md';
  const lista = LOCAL ? await API('/api/relatorios') : null;
  el.innerHTML = `<div class="acoes"><button id="rSalvar">💾 Salvar este relatório</button><span class="nota" id="rMsg"></span></div>` +
    (lista && lista.itens && lista.itens.length ? `<div class="nota">Anteriores: ${lista.itens.map(n => `<a href="#" class="rAnt" data-n="${n}">${n.replace('semana-', '').replace('.md', '')}</a>`).join(' · ')}</div>` : '') +
    D.props.map(p => `<div class="prop" data-pior="${esc(p.pior.nome)}" data-melhor="${esc(p.melhor.nome)}"><b>Decisão:</b> aposentar <b>${esc(p.pior.info.nome)}</b> (${p.pior.aprov}%) e replicar <b>${esc(p.melhor.info.nome)}</b> (${p.melhor.aprov}%).
      <input class="pNome" value="${esc(p.melhor.nome.replace(/-(v|b)?\d+$/, '') + '-v' + (Math.floor(Date.now() / 6048e5) % 1000))}" placeholder="nome do clone"><textarea class="pVar" rows="2" placeholder="Variação a testar no clone (ex.: abra sempre com uma pergunta)"></textarea>
      <div class="acoes"><button class="pOk">Aprovar troca</button></div><div class="nota pMsg"></div></div>`).join('') +
    `<div class="doc-rel">${mdParaHtml(md)}</div>`;
  $('rSalvar').onclick = async () => { const r = await API('/api/relatorio', { nome, texto: md }); $('rMsg').textContent = r && r.ok ? 'Salvo em ' + r.arquivo : 'Não consegui salvar.'; };
  el.querySelectorAll('.rAnt').forEach(a => a.onclick = async ev => { ev.preventDefault(); const r = await API('/api/arquivo?p=' + encodeURIComponent('Sala_Agentes/relatorios/' + a.dataset.n)); if (r && r.texto) el.querySelector('.doc-rel').innerHTML = mdParaHtml(r.texto); });
  el.querySelectorAll('.prop').forEach(p => p.querySelector('.pOk').onclick = async () => {
    const pior = p.dataset.pior, melhor = p.dataset.melhor, para = p.querySelector('.pNome').value.trim(), variacao = p.querySelector('.pVar').value.trim();
    if (!variacao) { p.querySelector('.pMsg').textContent = 'Descreva a variação a testar.'; return; }
    if (!confirm(`Aposentar "${pior}" e criar "${para}" a partir de "${melhor}"?`)) return;
    const c = await API('/api/clonar', { de: melhor, para, variacao });
    if (!c || !c.ok) { p.querySelector('.pMsg').textContent = 'Não consegui clonar: ' + (c ? c.erro : 'servidor local desligado'); return; }
    const a = await API('/api/arquivar', { agente: pior });
    p.querySelector('.pMsg').textContent = a && a.ok ? `Pronto: ${pior} aposentado, ${para} criado (vale a partir da próxima sessão).` : 'Clone criado, mas não consegui aposentar ' + pior + '.';
  });
}
// uma vez por semana, se a Sala estiver aberta no servidor local, salva o relatório sozinha
async function autoRelatorio() {
  if (!LOCAL || demo) return;
  const l = await API('/api/relatorios'); if (!l) return;
  const ult = (l.itens || [])[0], ultT = ult ? new Date(ult.replace('semana-', '').replace('.md', '') + 'T12:00:00').getTime() : 0;
  if (Date.now() - ultT < 7 * 864e5) return;
  const S = await coletarSemana(); if (!S.agentes.some(a => a.tarefas)) return;
  const r = await API('/api/relatorio', { nome: 'semana-' + dataISO(S.ate) + '.md', texto: relatorioMD(S) });
  if (r && r.ok) {
    const t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = '<div class="quem">📊 Relatório semanal salvo</div><div class="rel">' + esc(r.arquivo) + '</div><div class="bt"><button class="det">abrir</button></div>';
    t.querySelector('.det').onclick = () => { t.remove(); abrirRevisao(); }; $('toasts').appendChild(t);
  }
}

/* ---------- avaliação logo que o agente termina ---------- */
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const CHIPS = [['atendeu', 'Atendeu o que pedi'], ['sem_problemas', 'Sem problemas'], ['retrabalho', 'Teve retrabalho'], ['errou', 'Errou'], ['nao_atendeu', 'Não era isso']];
const iniciadoEm = Date.now(), avaliadoDemo = new Set(), jaAvisado = new Set(); let ultimaAssin = '';
const foiAvaliado = run => avaliadoDemo.has(run) || avalUnicas().some(a => a.run === run);
function pendentesAval() {
  return derivar(events).agentes.filter(a => a.estado === 'done' && a.id && !foiAvaliado(a.id)).sort((x, y) => y.fim - x.fim);
}
async function avaliarRun(a, nota, tags, com) {
  const agente = a.tipo && /^[a-z0-9][a-z0-9-]*$/.test(a.tipo) ? a.tipo : 'geral';
  if (demo || !LOCAL) avaliadoDemo.add(a.id);
  else {
    const r = await API('/api/avaliar', { agente, run: a.id, arquivo: (a.arquivos || []).filter(f => !f.includes('agent-memory')).slice(-1)[0] || '', nota, tags, comentario: com || '', contexto: String(a.resumo || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').slice(0, 140) });
    if (!r || !r.ok) { alert('Não consegui salvar a nota (o servidor local está ligado?)'); return false; }
    await carregarAval();
  }
  atualizarAval(); return true;
}
// "O que ele fez", contado a partir dos registros dos hooks (funciona mesmo sem relatório do agente)
function atividadeTxt(c) {
  const s = (n, t) => n ? t.replace('#', n).replace('(s)', n === 1 ? '' : 's').replace('(es)', n === 1 ? '' : 'es') : '';
  return [s(c.Read, 'leu # arquivo(s)'), s((c.Glob || 0) + (c.Grep || 0), 'buscou # vez(es) nos arquivos'), s((c.WebSearch || 0) + (c.WebFetch || 0), 'pesquisou na web # vez(es)'), s(c.Write, 'gravou # arquivo(s)'), s(c.Edit, 'editou # vez(es)'), s(c.Bash, 'rodou # comando(s)')].filter(Boolean).join(' · ');
}
function atividadeDe(a) { const c = {}; events.filter(e => e.agent === a.id && e.ev === 'PostToolUse' && e.tool !== 'Agent').forEach(e => { c[e.tool] = (c[e.tool] || 0) + 1; }); return atividadeTxt(c); }
function cardAval(a, compacto) {
  const v = visual(a), arqs = [...new Set((a.arquivos || []).filter(f => !f.includes('agent-memory')))];
  const rel = (a.resumo || '').replace(/\*\*/g, '').trim();
  const el = document.createElement('div'); el.className = compacto ? 'toast' : 'cardav'; el.dataset.run = a.id;
  const quem = `<div class="quem">${spriteSVG(v.info, 3)}<span>${esc(v.rotulo)}</span><small class="nota">terminou · ${dur(a.fim - a.inicio)}${v.desc ? ' · ' + esc(v.desc) : ''}</small></div>`;
  const fezTxt = atividadeDe(a), fez = fezTxt ? `<div class="nota fez">🔧 ${esc(fezTxt)}</div>` : '';
  const botoes = `<div class="bt"><button class="btn-joia">👍 Joia</button><button class="btn-dis">👎 Deslike</button>${compacto ? '<button class="det">detalhes</button>' : ''}</div>`;
  const relBloco = (t, c) => t ? `<${c ? 'div' : 'pre'} class="rel">${esc(c ? t.slice(0, 240) : t)}</${c ? 'div' : 'pre'}>` : '';
  el.innerHTML = quem + (compacto
    ? relBloco(rel, true) + fez
    : relBloco(rel, false) + fez + `${arqs.length ? `<div class="nota">Entregas:</div><div class="chips">${arqs.map(f => `<button class="chip arq" data-p="${esc(f)}">📄 ${esc(f.split('/').pop())}</button>`).join('')}</div><pre class="doc arqdoc" hidden></pre>` : ''}<div class="chips">${CHIPS.map(c => `<button class="chip" data-t="${c[0]}">${c[1]}</button>`).join('')}</div><textarea class="com" rows="2" placeholder="Comentário (opcional): o que ficou bom ou ruim? Vira lição na memória do agente."></textarea>`) + botoes;
  el.querySelectorAll('.chip:not(.arq)').forEach(c => c.onclick = () => c.classList.toggle('on'));
  el.querySelectorAll('.arq').forEach(b => b.onclick = async () => {
    const pre = el.querySelector('.arqdoc'); if (pre.dataset.p === b.dataset.p && !pre.hidden) { pre.hidden = true; return; }
    pre.hidden = false; pre.dataset.p = b.dataset.p; pre.textContent = 'Abrindo…';
    const r = await API('/api/arquivo?p=' + encodeURIComponent(b.dataset.p));
    pre.textContent = r && r.texto != null ? r.texto : '(não foi possível abrir: ' + (r ? r.erro : 'só funciona no servidor local') + ')';
  });
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
  const assin = pend.map(a => a.id).join(','); if (!$('aval').hidden && assin !== ultimaAssin) desenharAval(); ultimaAssin = assin;
}
function desenharAval() {
  const pend = pendentesAval(), el = $('aBody'); el.innerHTML = '';
  if (!pend.length) { el.innerHTML = '<div class="vazio2">Nada esperando a sua nota. 🎉</div>'; return; }
  pend.forEach(a => el.appendChild(cardAval(a, false)));
}
function abrirAval() { $('aval').hidden = false; desenharAval(); ultimaAssin = pendentesAval().map(a => a.id).join(','); }

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
  carregarAval().then(atualizarAval).then(autoRelatorio); setInterval(atualizarAval, 2000);
  setInterval(() => { if (fItem && !$('ficha').hidden && fAba === 'atividade') abaAtividade($('fBody')); }, 2000);
}
ligarFicha();
