/* AutoFarm.js – AutoFarm remoto (um botão via $.getScript)
 * Requisitos: estar em screen=am_farm, jQuery disponível
 * Funcionalidades:
 * - Painel com Start/Stop
 * - Checkboxes de tropas + quantidade por tropa
 * - Intervalo (min), Lote (qtd. por ciclo)
 * - "Só alvos já atacados" (linhas com link de relatório)
 * - "Sem perdas (ignorar amarelo)" igual ao script original
 * - Envia usando Template A (ícone A), atualizando o template antes de cada ciclo
 * - Ignora vermelho e vermelho/azul sempre
 */
(function(){
  'use strict';
  if (!window.$ || !window.game_data) { console.error('AutoFarm: jQuery/game_data indisponível'); return; }
  if (game_data.screen !== 'am_farm') {
    (window.UI && UI.ErrorMessage) ? UI.ErrorMessage('Abra o Assistente de Saque (screen=am_farm) e clique de novo no botão.') : alert('Abra o Assistente de Saque (screen=am_farm).');
    return;
  }

  // Evitar múltiplas instâncias: se já carregado, só reexibe o painel e sai
  if (window.AutoFarm && window.AutoFarm.__loaded) {
    var p0 = document.getElementById('autoFarmPanel_hosted_single');
    if (p0) p0.style.display = 'block';
    if (window.UI && UI.SuccessMessage) UI.SuccessMessage('AutoFarm já carregado.');
    return;
  }

  const $ = window.$;
  const PANEL_ID = 'autoFarmPanel_hosted_single';
  const skipUnits = new Set(['ram','catapult','knight','snob','militia']);
  const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
  const q  = (sel, ctx=document) => ctx.querySelector(sel);
  const qa = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

  let running = false, timer = null;

  // ---------- UI ----------
  function buildPanel(){
    let p = q('#'+PANEL_ID);
    if (p) return p;

    const units = game_data.units.filter(u=>!skipUnits.has(u));
    const savedUnits = JSON.parse(localStorage.getItem('AF_units')||'{}');
    const intSaved   = Number(localStorage.getItem('AF_int')||3);
    const batchSaved = Number(localStorage.getItem('AF_batch')||10);
    const onlyKnownSaved = localStorage.getItem('AF_onlyKnown')!=='0';
    const noLossesSaved  = localStorage.getItem('AF_noLosses')!=='0'; // default true

    p = document.createElement('div');
    p.id = PANEL_ID;
    p.style.cssText = `
      position:fixed; top:80px; right:16px; z-index:99999;
      background:#fff; border:1px solid #7d510f; padding:10px; width:320px;
      box-shadow:0 6px 18px rgba(0,0,0,.2); border-radius:10px; font:12px/1.25 Arial, sans-serif;
    `;
    p.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:move;" id="af_drag">
        <strong style="flex:1">AutoFarm (Template A – remoto)</strong>
        <button id="af_hide" class="btn btn-cancel" title="Ocultar painel">×</button>
      </div>

      <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
        <label title="minutos entre ciclos">Intervalo (min):</label>
        <input id="af_interval" type="number" min="0.2" step="0.1" value="${intSaved}" style="width:64px;">
        <label>Lote:</label>
        <input id="af_batch" type="number" min="1" step="1" value="${batchSaved}" style="width:64px;">
      </div>

      <div style="display:flex; gap:10px; align-items:center; margin-bottom:6px;">
        <label title="Só alvos com relatório (já atacados)">
          <input id="af_onlyKnown" type="checkbox" ${onlyKnownSaved?'checked':''}> Só alvos já atacados
        </label>
        <label title="Ignorar indicadores amarelos (perdas parciais)">
          <input id="af_noLosses" type="checkbox" ${noLossesSaved?'checked':''}> Sem perdas (ignorar amarelo)
        </label>
      </div>

      <div id="af_units" style="max-height:220px; overflow:auto; border:1px solid #ddd; padding:6px; border-radius:6px; margin-bottom:8px;"></div>

      <div style="display:flex; gap:8px; align-items:center;">
        <button id="af_start" class="btn">Start</button>
        <button id="af_stop" class="btn btn-cancel" disabled>Stop</button>
        <span id="af_status" style="margin-left:auto; color:#666;">pronto</span>
      </div>
    `;
    document.body.appendChild(p);

    // Linhas de tropas
    const box = q('#af_units');
    units.forEach(u=>{
      const row = document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:4px;';
      const checked = savedUnits[u]?.checked ?? false;
      const qty = savedUnits[u]?.qty ?? 0;
      row.innerHTML = `
        <input type="checkbox" class="af_cb" data-u="${u}" ${checked?'checked':''}>
        <img src="${image_base+'unit/unit_'+u+'.png'}" style="width:16px;height:16px;">
        <span style="width:100px;text-transform:capitalize">${u}</span>
        <input type="number" min="0" step="1" value="${qty}" class="af_qty" data-u="${u}" style="width:100px;">
      `;
      box.appendChild(row);
    });

    // Persistência
    function saveState(){
      const state = {};
      qa('.af_cb').forEach(cb=>{
        const u = cb.getAttribute('data-u');
        const qty = Number(q(`.af_qty[data-u="${u}"]`).value||0);
        state[u] = {checked: cb.checked, qty};
      });
      localStorage.setItem('AF_units', JSON.stringify(state));
      localStorage.setItem('AF_int', String(q('#af_interval').value||3));
      localStorage.setItem('AF_batch', String(q('#af_batch').value||10));
      localStorage.setItem('AF_onlyKnown', q('#af_onlyKnown').checked ? '1' : '0'));
      localStorage.setItem('AF_noLosses',  q('#af_noLosses').checked  ? '1' : '0'));
    }
    p.addEventListener('change', (ev)=>{
      const t = ev.target;
      if (t.classList.contains('af_cb') || t.classList.contains('af_qty') || t.id==='af_interval' || t.id==='af_batch' || t.id==='af_onlyKnown' || t.id==='af_noLosses') {
        saveState();
      }
    });

    // Drag
    (function(){
      const drag = q('#af_drag');
      let sx, sy, ox, oy, moving=false;
      drag.addEventListener('mousedown', e=>{ moving=true; sx=e.clientX; sy=e.clientY; ox=p.offsetLeft; oy=p.offsetTop; e.preventDefault();});
      document.addEventListener('mousemove', e=>{
        if(!moving) return;
        p.style.left = (ox + (e.clientX - sx))+'px';
        p.style.top  = (oy + (e.clientY - sy))+'px';
        p.style.right = 'auto';
      });
      document.addEventListener('mouseup', ()=>moving=false);
      q('#af_hide').onclick = ()=>{ p.style.display='none'; };
    })();

    // Botões
    q('#af_start').onclick = start;
    q('#af_stop').onclick  = stop;

    return p;
  }

  function status(txt){ const s = q('#af_status'); if (s) s.textContent = txt; }
  function ensurePanel(show=true){
    const p = buildPanel();
    if (show) p.style.display='block';
    return p;
  }

  // ---------- Núcleo ----------
  function currentVillageId(){
    const m = (location.search||'').match(/village=(\d+)/);
    if (m) return Number(m[1]);
    const v = $('#menu_row2 a.village-switch').data('id');
    return v ? Number(v) : game_data.village.id;
  }

  function getTemplateAId(){
    const inp = q('form[action*="action=edit_all"] input[name*="template"][name*="[id]"]');
    return inp ? Number(inp.value) : 1;
  }

  async function saveTemplateAFromPanel(){
    const form = q('form[action*="action=edit_all"]');
    if (!form) throw new Error('Form de template não encontrado.');
    const tplRow = form.querySelector('input[name*="template"][name*="[id]"]')?.closest('tr');
    if (!tplRow) throw new Error('Linha do Template A não localizada.');

    const units = game_data.units.filter(u=>!skipUnits.has(u));
    units.forEach(u=>{
      const cb = q(`.af_cb[data-u="${u}"]`);
      const qtyEl = q(`.af_qty[data-u="${u}"]`);
      const inp = tplRow.querySelector(`input[name="${u}[amount]"], input[name^="${u}["], input[name*="[${u}]"]`);
      if (inp && cb && qtyEl) inp.value = cb.checked ? (parseInt(qtyEl.value||'0',10)||0) : 0;
    });

    const formData = $(form).serialize();
    await $.ajax({ url: form.getAttribute('action'), method:'POST', data: formData });
  }

  function pickTargets(batch, onlyKnown, noLosses){
    const rows = qa('#plunder_list tr[id^="village_"]');
    const chosen = [];
    for (const tr of rows) {
      const dot = tr.querySelector('img[src*="graphic/dots/"]');
      if (!dot) continue;

      const src = dot.getAttribute('src') || '';
      // Ignora vermelho e vermelho/azul sempre
      if (/dots\/(?:red|red_blue)\.(?:png|webp)/.test(src)) continue;
      // Se "sem perdas" marcado: ignora amarelo
      if (noLosses && /dots\/yellow\.(?:png|webp)/.test(src)) continue;

      // "já atacados" = tem link de relatório
      const hadReport = !!tr.querySelector('a[href*="screen=report"][href*="view="]');
      if (onlyKnown && !hadReport) continue;

      // precisa ter ação A disponível
      const iconA = tr.querySelector('a.farm_icon.farm_icon_a');
      if (!iconA) continue;

      const targetId = tr.id.split('_')[1];
      chosen.push({ tr, targetId });
      if (chosen.length >= batch) break;
    }
    return chosen;
  }

  // Enviar com Template A via TribalWars.post (CSRF + throttle)
  async function sendWithTemplateA(targetId, originVillageId){
    return new Promise((resolve, reject) => {
      try{
        const url = Accountmanager.send_units_link.replace(/village=\d+/, 'village='+originVillageId);
        const data = { target: targetId, template_id: getTemplateAId(), source: originVillageId };

        // Throttle conforme o jogo
        const n = Timing.getElapsedTimeSinceLoad ? Timing.getElapsedTimeSinceLoad() : Date.now();
        if (Accountmanager && Accountmanager.farm) {
          if (Accountmanager.farm.last_click && n - Accountmanager.farm.last_click < 200) {
            return setTimeout(() => {
              sendWithTemplateA(targetId, originVillageId).then(resolve).catch(reject);
            }, 220);
          }
          Accountmanager.farm.last_click = n;
        }

        // Chamada oficial com CSRF
        TribalWars.post(
          url,
          null,
          data,
          function ok(resp){ resolve(resp); },
          function err(e){ reject(e || 'Falha no envio'); }
        );
      }catch(e){
        reject(e);
      }
    });
  }

  async function tick(){
    try{
      if (!running) return;
      status('salvando template...');
      await saveTemplateAFromPanel();

      const batch = Math.max(1, parseInt(q('#af_batch').value||'10',10));
      const onlyKnown = q('#af_onlyKnown').checked;
      const noLosses  = q('#af_noLosses').checked;

      status('coletando alvos...');
      const targets = pickTargets(batch, onlyKnown, noLosses);
      if (targets.length === 0) { status('sem alvos válidos'); return; }

      const origin = currentVillageId();
      let sent = 0;
      for (const t of targets) {
        status(`enviando ${sent+1}/${targets.length}...`);
        try{
          await sendWithTemplateA(t.targetId, origin);
          if (window.UI && UI.SuccessMessage) UI.SuccessMessage('Envio OK');
          t.tr.remove();
          sent++;
          await sleep(350 + Math.random()*250);
        }catch(e){
          if (window.UI && UI.ErrorMessage) UI.ErrorMessage(e && e.error || 'Falha no envio');
        }
      }
      status(`OK: ${sent} envios`);
    }catch(e){
      console.error(e);
      status('erro: '+(e?.message||e));
    }
  }

  function start(){
    if (running) return;
    ensurePanel(true);
    running = true;
    const btnS = q('#af_start'), btnP = q('#af_stop');
    if (btnS) btnS.disabled = true;
    if (btnP) btnP.disabled = false;
    status('iniciando...');
    const minutes = Math.max(0.2, parseFloat(q('#af_interval').value||'3'));
    tick();
    timer = setInterval(tick, minutes*60*1000);
  }

  function stop(){
    running = false;
    if (timer) clearInterval(timer);
    const btnS = q('#af_start'), btnP = q('#af_stop');
    if (btnS) btnS.disabled = false;
    if (btnP) btnP.disabled = true;
    status('parado');
  }

  // ---------- API pública e boot ----------
  window.AutoFarm = {
    start, stop,
    isRunning: ()=>running,
    __loaded: true
  };

  ensurePanel(true);
  if (window.UI && UI.SuccessMessage) UI.SuccessMessage('AutoFarm carregado.');
})();
