'use strict';
/* Cena pixel-art da sala (canvas). Tudo vem de CFG.sala (config.json): paredes, móveis, mesas, lugares.
   Cada agente vira um personagem: entra pela porta da esquerda, senta numa mesa e trabalha;
   ao terminar, atravessa a porta e vai para o sofá. Sessões ficam em pé na frente do escritório. */
const Cena = (function () {
  const T = 16, S = 3;
  let cv, cx, bg, bx, CFG = {}, SALA = {}, W = 30, H = 17, ENT = new Map(), primeira = true, rodando = false, ult = 0, relogio = 0, extras = { sofa: 0, mesa: 0 };

  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w * T * S; c.height = h * T * S; const x = c.getContext('2d'); x.setTransform(S, 0, 0, S, 0, 0); x.imageSmoothingEnabled = false; return [c, x]; };
  const col = k => (SALA.cores || {})[k] || '#f0f';
  function R(c, x, y, w, h, color) { c.fillStyle = color; c.fillRect(Math.round(x * T), Math.round(y * T), Math.max(1, Math.round(w * T)), Math.max(1, Math.round(h * T))); }
  function P(c, x, y, w, h, color) { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  const hash = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

  /* ---------- móveis (camada estática) ---------- */
  const mov = {
    planta(c, m) {
      const px = m.x * T, py = m.y * T, pot = py + 16;
      for (let i = -4; i <= 4; i++) { const h = 20 - Math.abs(i) * 3 - (i % 2 ? 2 : 0); P(c, px + i * 2, pot - h, 2, h, i % 2 ? col('planta') : col('plantaEscura')); }
      P(c, px - 9, pot - 3, 18, 3, col('plantaEscura'));
      P(c, px - 7, pot, 14, 10, col('vaso')); P(c, px - 8, pot, 16, 2, '#a87445');
    },
    estante(c, m) {
      const l = m.l || 3, x = m.x * T, y = m.y * T, w = l * T;
      P(c, x, y, w, 26, '#7a4e2a'); P(c, x + 2, y + 2, w - 4, 10, '#3a2412'); P(c, x + 2, y + 14, w - 4, 10, '#3a2412');
      const cores = ['#d33', '#3a7', '#37d', '#eb3', '#eee', '#a4c', '#e83'];
      for (let row = 0; row < 2; row++) { let bxp = x + 3; let i = 0; while (bxp < x + w - 6) { const bw = 2 + Math.floor(hash(m.x * 7 + row * 3 + i) * 2), bh = 6 + Math.floor(hash(i + row * 9 + m.y) * 4); P(c, bxp, y + 2 + row * 12 + (10 - bh), bw, bh, cores[Math.floor(hash(i * 3 + row + m.x) * cores.length)]); bxp += bw + 1; i++; } }
      P(c, x, y + 12, w, 2, '#a87445'); P(c, x, y + 24, w, 2, '#a87445');
    },
    relogio(c, m) { const x = m.x * T, y = m.y * T; c.fillStyle = '#d33'; c.beginPath(); c.arc(x, y, 8, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); P(c, x - 0.5, y - 5, 1, 5, '#222'); P(c, x, y, 4, 1, '#222'); },
    quadro(c, m) { const x = m.x * T, y = m.y * T; P(c, x, y, 22, 26, col('moldura')); P(c, x + 2, y + 2, 18, 22, '#2a2030'); P(c, x + 5, y + 6, 8, 10, '#c9a36b'); P(c, x + 9, y + 14, 6, 8, '#6b4a8a'); },
    quadroG(c, m) { const x = m.x * T, y = m.y * T; P(c, x, y, 50, 24, col('moldura')); P(c, x + 2, y + 2, 46, 20, '#d8c9a0'); const cs = ['#c0392b', '#e67e22', '#2c3e50', '#27ae60', '#f1c40f']; for (let i = 0; i < 12; i++) P(c, x + 3 + i * 3.6, y + 4 + hash(i) * 8, 3, 6 + hash(i + 4) * 8, cs[i % 5]); },
    sofaH(c, m) {
      const x = m.x * T, y = m.y * T, w = m.w * T, h = m.h * T, baixo = m.y > 10;
      const costas = baixo ? y + h * 0.55 : y, ch = h * 0.45;
      P(c, x, y, w, h, col('sofaEscuro'));
      P(c, x, costas, w, ch, col('sofa')); P(c, x, baixo ? y : y + ch, w, h * 0.55, col('sofa'));
      P(c, x, y, 4, h, col('sofaEscuro')); P(c, x + w - 4, y, 4, h, col('sofaEscuro'));
      P(c, x + w / 2 - 0.5, baixo ? y : y + ch, 1, h * 0.55, col('sofaEscuro'));
    },
    sofaV(c, m) {
      const x = m.x * T, y = m.y * T, w = m.w * T, h = m.h * T, dir = m.x > 24 ? 1 : 0;
      P(c, x, y, w, h, col('sofaEscuro')); P(c, dir ? x : x + w * 0.4, y, w * 0.6, h, col('sofa'));
      P(c, x, y, w, 4, col('sofaEscuro')); P(c, x, y + h - 4, w, 4, col('sofaEscuro'));
      P(c, x, y + h / 2 - 0.5, w, 1, col('sofaEscuro'));
    },
    mesaCafe(c, m) {
      const x = m.x * T, y = m.y * T, w = m.w * T, h = m.h * T;
      P(c, x, y, w, h, col('mesaBorda')); P(c, x + 2, y + 2, w - 4, h - 6, col('mesa'));
      P(c, x + w / 2 - 4, y + h / 2 - 5, 7, 7, '#e8e8ee'); P(c, x + w / 2 + 3, y + h / 2 - 3, 3, 3, '#e8e8ee');
    },
    lixeira(c, m) { const x = m.x * T, y = m.y * T; P(c, x - 5, y, 10, 12, '#9aa0aa'); P(c, x - 6, y - 1, 12, 2, '#c3c8d0'); P(c, x - 3, y + 2, 1, 8, '#7b818b'); P(c, x + 2, y + 2, 1, 8, '#7b818b'); },
    balcao(c, m) { const x = m.x * T, y = m.y * T, w = m.w * T, h = m.h * T; P(c, x, y, w, h, col('mesaBorda')); P(c, x, y, w, h * 0.45, col('mesa')); P(c, x + w * 0.1, y + 2, 7, 6, '#e8e8ee'); }
  };

  function desenharFundo() {
    const c = bx; c.clearRect(0, 0, W * T, H * T);
    R(c, 0, 0, W, H, col('paredeTopo'));
    // piso madeira (escritório)
    c.save(); c.beginPath(); c.rect(1 * T, 4 * T, 16 * T, 12 * T); c.clip();
    for (let ty = 4; ty < 16; ty++) for (let b = -2; b < 18; b += 2) {
      const x = b + (ty % 2), k = Math.floor(hash(x * 3 + ty * 11) * 2);
      R(c, x, ty, 2, 1, k ? col('madeira1') : col('madeira2')); R(c, x + 1.94, ty, 0.06, 1, col('madeiraLinha')); R(c, x, ty + 0.94, 2, 0.06, col('madeiraLinha'));
    }
    c.restore();
    // piso lounge + xadrez
    R(c, 18, 4, 11, 12, col('lounge'));
    c.save(); c.beginPath(); c.rect(18 * T, 4 * T, 11 * T, 12 * T); c.clip();
    const q = 12; for (let i = 0; i < Math.ceil(11 * T / q); i++) for (let j = 0; j < 2; j++) P(c, 18 * T + i * q, 16 * T - 2 * q + j * q, q, q, (i + j) % 2 ? col('xadrez1') : col('xadrez2'));
    c.restore();
    // paredes de cima e divisória
    R(c, 1, 1, 28, 3, col('parede')); R(c, 1, 3.7, 28, 0.3, col('rodape'));
    const p = SALA.porta || { y1: 8, y2: 10.5 };
    R(c, 17, 0, 1, p.y1, col('paredeTopo')); R(c, 17.15, 4, 0.7, p.y1 - 4, col('parede')); R(c, 17, 4, 0.15, p.y1 - 4, col('rodape'));
    R(c, 17, p.y2, 1, 16 - p.y2, col('paredeTopo')); R(c, 17.15, p.y2, 0.7, 16 - p.y2, col('parede'));
    R(c, 17, 0, 1, 4, col('paredeTopo'));
    // sombra sob a parede
    c.globalAlpha = .18; R(c, 1, 4, 16, 0.25, '#000'); R(c, 18, 4, 11, 0.25, '#000'); c.globalAlpha = 1;
    (SALA.moveis || []).forEach(m => (mov[m.t] || (() => {}))(c, m));
    c.strokeStyle = '#05070d'; c.lineWidth = 2; c.strokeRect(1, 1, W * T - 2, H * T - 2);
  }

  /* ---------- lugares ---------- */
  const mesas = () => (SALA.mesas || []).map(m => ({ m, x: (m.x + 1.8) * T, y: (m.y + 2) * T + 8, gx: (m.x + 3.6 + 0.7) * T, baixa: m.y > (SALA.corredorY || 9.2) }));
  const sofas = () => (SALA.lugaresSofa || []).map(l => ({ x: l.x * T, y: l.y * T, sentado: !!l.sentado, olha: l.olha || 'frente' }));
  const sessoesL = () => (SALA.lugaresSessao || []).map(l => ({ x: l.x * T, y: l.y * T }));
  const gaps = () => [1.5, 6.3, 11.3, 16.1].map(g => g * T);
  const nearGap = x => gaps().reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a);

  function rota(e, zona, slot) {
    const cy = (SALA.corredorY || 9.2) * T, pt = SALA.porta || {}, fx = (SALA.faixas || {});
    const dO = { x: (pt.xEscritorio || 16.6) * T, y: cy }, dL = { x: (pt.xLounge || 18.8) * T, y: cy };
    const laneX = (fx.x || 19.4) * T, cima = (fx.cima || 6.6) * T, baixo = (fx.baixo || 14.4) * T;
    const pts = [], add = (x, y) => pts.push({ x, y });
    const doLounge = e.x > 17.6 * T;
    if (!doLounge) {
      if (e.y > cy + 2 * T) { const g = nearGap(e.x); add(g, e.y); add(g, cy); }
      else add(e.x, cy);
    } else {
      const lane = e.y < cy + 0.3 * T ? cima : baixo;
      add(e.x, lane); add(laneX, lane); add(laneX, cy); add(dL.x, cy); add(dO.x, cy);
    }
    if (zona === 'mesa') {
      if (slot.baixa) { add(slot.gx, cy); add(slot.gx, slot.y + 14); add(slot.x, slot.y + 14); add(slot.x, slot.y); }
      else { add(slot.x, cy); add(slot.x, slot.y); }
    } else if (zona === 'sessao') {
      const g = nearGap(slot.x); add(g, cy); add(g, slot.y); add(slot.x, slot.y);
    } else {
      add(dO.x, cy); add(dL.x, cy); add(laneX, cy);
      const lane = slot.y <= cy + 0.2 * T ? cima : baixo;
      add(laneX, lane); add(slot.x, lane); add(slot.x, slot.y);
    }
    return pts.filter((p, i) => !i || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 0.5);
  }

  /* ---------- sincronização ---------- */
  function sync(lista) {
    if (!SALA.mesas) return;
    const ids = new Set(lista.map(i => i.id));
    for (const id of [...ENT.keys()]) if (!ids.has(id)) ENT.delete(id);
    const M = mesas(), SF = sofas(), SS = sessoesL();
    const lugares = { mesa: M, sofa: SF, sessao: SS };
    const quer = it => it.tipo === 'sessao' ? 'sessao' : (it.estado === 'done' ? 'sofa' : 'mesa');
    const usado = { mesa: new Set(), sofa: new Set(), sessao: new Set() };
    for (const it of lista) { const e = ENT.get(it.id); if (e && e.zona === quer(it) && e.idx != null) usado[e.zona].add(e.idx); }
    extras = { sofa: 0, mesa: 0 };
    for (const it of lista) {
      let e = ENT.get(it.id); const z = quer(it);
      if (!e) { const en = SALA.entrada || { x: 1.4, y: 9.2 }; e = { id: it.id, x: en.x * T, y: en.y * T, path: [], zona: null, idx: null, sentado: false, dir: 'frente', mov: false, t0: Math.random() * 5 }; ENT.set(it.id, e); e.novo = true; }
      e.item = it; e.info = it.info; e.estado = it.estado; e.rotulo = it.rotulo; e.sub = it.sub;
      if (e.zona !== z || e.idx == null) {
        let idx = -1; const L = lugares[z];
        for (let i = 0; i < L.length; i++) if (!usado[z].has(i)) { idx = i; break; }
        if (idx < 0) { e.zona = z; e.idx = null; e.escondido = true; extras[z === 'sofa' ? 'sofa' : 'mesa']++; continue; }
        usado[z].add(idx); e.zona = z; e.idx = idx; e.escondido = false;
        const slot = L[idx];
        if (primeira) { e.x = slot.x; e.y = slot.y; e.path = []; }
        else { e.path = rota(e, z, slot); }
        e.sentado = z === 'mesa' ? true : (z === 'sofa' ? slot.sentado : false);
        e.dir = z === 'mesa' ? 'costas' : (z === 'sofa' ? slot.olha : 'frente');
      }
    }
    primeira = false;
  }
  function reset() { ENT.clear(); primeira = true; }
  // fx, fy = posição do clique como fração (0..1) do canvas; devolve o item do personagem mais próximo
  function pick(fx, fy) {
    const x = fx * W * T, y = fy * H * T; let melhor = null, dm = 1e9;
    ENT.forEach(e => { if (e.escondido) return; const dx = Math.abs(x - e.x), dy = y - (e.y - 12); if (dx < 14 && dy > -16 && dy < 18) { const d = dx + Math.abs(dy); if (d < dm) { dm = d; melhor = e.item; } } });
    return melhor;
  }

  /* ---------- personagem ---------- */
  // Cada tipo pode ter o próprio sprite (tipos.<nome>.sprite); senão vale o sprite global.
  const spriteDe = e => e.info.sprite || CFG.sprite || {};
  function linhas(e) {
    const s = spriteDe(e), base = s.pixels || [];
    if (e.dir !== 'costas') return base;
    const letras = s.rostoLetras || ['s', 'e'], n = s.linhasRosto || 5, sub = s.costasLetra || 'h';
    return base.map((r, i) => i < n ? [...r].map(ch => letras.includes(ch) ? sub : ch).join('') : r);
  }
  function desenharPessoa(c, e, t) {
    const sp = spriteDe(e), perna = sp.letraPerna || 'p';
    const rows = linhas(e), sc = (SALA.escalaPersonagem || 2), pal = { h: e.info.cabelo || '#333', s: (CFG.paleta || {}).pele, e: (CFG.paleta || {}).olho, c: e.info.cor || '#88f', p: (CFG.paleta || {}).calca, ...(sp.paleta || {}) };
    const w = Math.max(...rows.map(r => r.length)), n = e.sentado ? Math.min(9, rows.length) : rows.length;
    const trab = e.zona === 'mesa' && e.estado === 'work' && !e.mov;
    const passo = e.mov ? Math.floor(t * 8) % 2 : 0;
    const bob = e.mov ? (passo ? 1 : 0) : (trab ? (Math.floor(t * 4) % 2 ? 1 : 0) : 0);
    const x0 = Math.round(e.x - w * sc / 2), y0 = Math.round(e.y - n * sc - bob);
    if (!e.sentado) { c.globalAlpha = .25; P(c, e.x - 8, e.y - 1, 16, 3, '#000'); c.globalAlpha = 1; }
    for (let j = 0; j < n; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const k = pal[row[i]]; if (!k) continue;
        let dx = 0; if (e.mov && j >= rows.length - 2 && row[i] === perna) dx = (passo ? 1 : -1) * (i < w / 2 ? -1 : 1);
        P(c, x0 + (i + dx) * sc, y0 + j * sc, sc, sc, k);
      }
    }
    return { topo: y0, x: e.x };
  }
  function texto(c, s, x, y, cor, tam) {
    c.font = `bold ${tam || 4.6}px "Courier New", monospace`; c.textAlign = 'center'; c.lineWidth = 1.4; c.strokeStyle = 'rgba(8,10,20,.95)'; c.strokeText(s, x, y); c.fillStyle = cor; c.fillText(s, x, y);
  }

  /* ---------- quadro a quadro ---------- */
  function desenharMesas(c, t) {
    const ocupada = {}; ENT.forEach(e => { if (e.zona === 'mesa' && e.idx != null) ocupada[e.idx] = e; });
    mesas().forEach((s, i) => {
      const m = s.m, x = m.x * T, y = m.y * T, e = ocupada[i];
      P(c, x, y, 3.6 * T, 1.35 * T, col('mesa')); P(c, x, y + 1.35 * T, 3.6 * T, 0.65 * T, col('mesaBorda')); P(c, x, y + 1.35 * T, 3.6 * T, 1, '#00000030');
      // monitor
      const mx = Math.round(x + 1.8 * T - 11), my = Math.round(y + 1);
      P(c, mx, my, 22, 17, col('monitor')); P(c, mx + 8, my + 17, 6, 3, '#9aa0aa'); P(c, mx + 3, my + 20, 16, 1, '#7b818b');
      const tela = e ? (e.estado === 'sumido' ? col('telaSumida') : col('tela')) : col('telaOff');
      P(c, mx + 2, my + 2, 18, 11, tela);
      if (e && e.estado !== 'sumido') { c.globalAlpha = .55; for (let k = 0; k < 4; k++) { const w = 5 + Math.floor(hash(k + Math.floor(t * 2) * 1.7) * 9); P(c, mx + 3, my + 3 + k * 2.5, w, 1, '#0a3a1f'); } c.globalAlpha = 1; }
      P(c, Math.round(x + 1.8 * T - 8), Math.round(y + 22), 16, 5, '#e6e9ee'); P(c, Math.round(x + 1.8 * T + 11), Math.round(y + 23), 3, 4, '#e6e9ee');
      // cadeira
      P(c, Math.round(x + 1.8 * T - 9), Math.round((m.y + 2) * T - 3), 18, 15, '#3f7a4b'); P(c, Math.round(x + 1.8 * T - 8), Math.round((m.y + 2) * T - 2), 16, 4, col('cadeira'));
    });
  }
  function quadro(t) {
    cx.clearRect(0, 0, W * T, H * T);
    cx.drawImage(bg, 0, 0, W * T, H * T);
    desenharMesas(cx, t);
    const lista = [...ENT.values()].filter(e => !e.escondido).sort((a, b) => a.y - b.y);
    const marcas = [];
    for (const e of lista) { const r = desenharPessoa(cx, e, t); marcas.push({ e, r }); }
    for (const { e, r } of marcas) {
      const trab = e.estado === 'work' && !e.mov && e.zona !== 'sofa';
      if (trab || e.estado === 'sumido') { const bal = e.estado === 'sumido' ? '❓' : (e.info.balao || '…'); cx.font = '7px sans-serif'; cx.textAlign = 'center'; cx.fillText(bal, e.x + 9, r.topo - 2 + Math.round(Math.sin(t * 4) * 1.2)); }
      if (e.zona === 'sofa' && !e.mov) { cx.font = '6px sans-serif'; cx.textAlign = 'center'; cx.fillText('✓', e.x + 9, r.topo - 1); }
      texto(cx, e.rotulo, e.x, e.y + 7, '#fff'); if (e.sub) texto(cx, e.sub, e.x, e.y + 12, '#aab3d6', 3.8);
    }
    if (extras.sofa) texto(cx, `+${extras.sofa} no sofá`, 24 * T, 5 * T, '#fff', 5);
    if (extras.mesa) texto(cx, `+${extras.mesa} sem mesa`, 9 * T, 3.3 * T, '#ffd23f', 5);
  }
  function passo(ts) {
    const dt = Math.min(0.05, (ts - ult) / 1000 || 0.016); ult = ts; relogio += dt;
    ENT.forEach(e => {
      e.mov = false;
      if (e.path.length) {
        const p = e.path[0], dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy), v = 62 * dt;
        if (d <= v) { e.x = p.x; e.y = p.y; e.path.shift(); } else { e.x += dx / d * v; e.y += dy / d * v; }
        e.mov = true; e.dir = Math.abs(dy) > Math.abs(dx) && dy < 0 ? 'costas' : 'frente';
      } else if (e.zona === 'mesa') e.dir = 'costas';
      else if (e.zona === 'sofa') { const s = sofas()[e.idx]; if (s) e.dir = s.olha; } else e.dir = 'frente';
    });
    quadro(relogio);
    requestAnimationFrame(passo);
  }

  function init(canvas, cfg) {
    cv = canvas; setCfg(cfg);
    if (!rodando) { rodando = true; requestAnimationFrame(passo); }
  }
  function setCfg(cfg) {
    CFG = cfg || {}; SALA = CFG.sala || {}; W = SALA.largura || 30; H = SALA.altura || 17;
    cv.width = W * T * S; cv.height = H * T * S;
    cx = cv.getContext('2d'); cx.setTransform(S, 0, 0, S, 0, 0); cx.imageSmoothingEnabled = false;
    [bg, bx] = mk(W, H); desenharFundo();
  }
  return { init, setCfg, sync, reset, pick };
})();
