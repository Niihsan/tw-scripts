/* AutoFarm.js – BR138 – Versão 2.3 (baseado na sua 2.2)
 * Patch aplicado: impedir que múltiplas aldeias ataquem o MESMO alvo no MESMO ciclo
 * Nenhuma outra lógica foi alterada.
 */

(function(){
  'use strict';
  if (!window.$ || !window.game_data) { console.error('AutoFarm: jQuery/game_data indisponível'); return; }

  if (game_data.screen !== 'am_farm') {
    try {
      location.href = TribalWars.buildURL('GET','am_farm');
    } catch(e) {
      location.href = game_data.link_base_pure + 'am_farm';
    }
    return;
  }

  if (window.AutoFarm && window.AutoFarm.__loaded) {
    const p0 = document.getElementById('autoFarmPanel_hosted_single_v2');
    if (p0) p0.style.display = 'block';
    if (window.UI && UI.SuccessMessage) UI.SuccessMessage('AutoFarm v2.3 já carregado.');
    return;
  }

  const $ = window.$;
  const PANEL_ID = 'autoFarmPanel_hosted_single_v2';
  const PLAN_ID  = 'AutoFarmPlanTable';
  const skipUnits = new Set(['ram','catapult','knight','snob','militia']);
  const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
  const q  = (sel, ctx=document) => ctx.querySelector(sel);
  const qa = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

  const LAST_KEY = 'AF_lastSent_v2_combo';
  function loadLast() { try{ return JSON.parse(localStorage.getItem(LAST_KEY) || '{}'); }catch(_){ return {}; } }
  function saveLast(map){ try{ localStorage.setItem(LAST_KEY, JSON.stringify(map)); }catch(_){} }
  let lastSent = loadLast();

  let running = false, timer = null;

  function toCoordObj(coord){ const m=(coord||'').match(/(\d{1,3})\|(\d{1,3})/); return m?{x:+m[1],y:+m[2]}:null; }
  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
  function nowSec(){ return Math.floor(Date.now()/1000); }

  async function buildGroupSelect(selectedId){
    try{
      const resp = await $.get(TribalWars.buildURL('GET','groups',{ ajax:'load_group_menu' }));
      let html = '<select id="af_group" style="max-width:180px">';
      resp.result.forEach(g=>{
        if (g.type==='separator') html += '<option disabled>────────</option>';
        else html += `<option value="${g.group_id}" ${String(g.group_id)===String(selectedId)?'selected':''}>${g.name}</option>`;
      });
      html += '</select>';
      return html;
    }catch(e){
      return `<select id="af_group"><option value="0" selected>Todos</option></select>`;
    }
  }

  async function buildPanel(){
    let p = q('#'+PANEL_ID);
    if (p) return p;

    const units = game_data.units.filter(u=>!skipUnits.has(u));
    const savedUnits   = JSON.parse(localStorage.getItem('AF_units')||'{}');
    const intSaved     = Number(localStorage.getItem('AF_int')||3);
    const batchSaved   = Number(localStorage.getItem('AF_batch')||10);
    const onlyKnownSav = localStorage.getItem('AF_onlyKnown')!=='0';
    const noLossesSav  = localStorage.getItem('AF_noLosses')!=='0';
    const gapSaved     = Number(localStorage.getItem('AF_gapMin')||15);
    const maxFieldsSav = Number(localStorage.getItem('AF_maxFields')||25);
    const groupSav     = localStorage.getItem('AF_groupId')||'0';

    const groupSelect = await buildGroupSelect(groupSav);

    p = document.createElement('div');
    p.id = PANEL_ID;
    p.style.cssText = `
      position:fixed; top:80px; right:16px; z-index:99999;
      background:#fff; border:1px solid #7d510f; padding:10px; width:380px;
      box-shadow:0 6px 18px rgba(0,0,0,.2); border-radius:10px; font:12px Arial;
    `;

    p.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:move;" id="af_drag">
        <strong style="flex:1">AutoFarm v2.3 (BR138)</strong>
        <button id="af_hide" class="btn btn-cancel" title="Ocultar painel">×</button>
      </div>

      <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
        <label>Grupo:</label>
        ${groupSelect}
        <label style="margin-left:8px">Campos máx.:</label>
        <input id="af_maxFields" type="number" min="1" step="1" value="${maxFieldsSav}" style="width:64px;">
      </div>

      <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
        <label>Intervalo (min):</label>
        <input id="af_interval" type="number" min="0.2" step="0.1" value="${intSaved}" style="width:64px;">
        <label>Lote/origem:</label>
        <input id="af_batch" type="number" min="1" step="1" value="${batchSaved}" style="width:80px;">
      </div>

      <div style="display:flex; gap:10px;">
        <label><input id="af_onlyKnown" type="checkbox" ${onlyKnownSav?'checked':''}> Só alvos já atacados</label>
        <label><input id="af_noLosses" type="checkbox" ${noLossesSav?'checked':''}> Sem perdas</label>
      </div>

      <div style="margin:6px 0 8px;">
        <label>Proteção por alvo (min):</label>
        <input id="af_gapMin" type="number" min="1" step="1" value="${gapSaved}" style="width:64px;">
      </div>

      <div id="af_units" style="max-height:220px; overflow:auto; border:1px solid #ddd; padding:6px; margin-bottom:8px; border-radius:6px;"></div>

      <div style="display:flex; gap:8px; align-items:center;">
        <button id="af_start" class="btn">Start</button>
        <button id="af_stop"  class="btn btn-cancel" disabled>Stop</button>
        <span id="af_status" style="margin-left:auto;color:#666;">pronto</span>
      </div>

      <div id="af_info" style="margin-top:6px;color:#444;"></div>
    `;

    document.body.appendChild(p);

    const box = q('#af_units');
    units.forEach(u=>{
      const saved = savedUnits[u] || {checked:false, qty:0};
      const row = document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:4px;';
      row.innerHTML = `
        <input type="checkbox" class="af_cb" data-u="${u}" ${saved.checked?'checked':''}>
        <img src="${image_base+'unit/unit_'+u+'.png'}" style="width:16px;height:16px;">
        <span style="width:120px">${u}</span>
        <input type="number" min="0" step="1" value="${saved.qty}" class="af_qty" data-u="${u}" style="width:100px;">
      `;
      box.appendChild(row);
    });

    function saveState(){
      const st={};
      qa('.af_cb').forEach(cb=>{
        const u=cb.dataset.u;
        const qty=Number(q(`.af_qty[data-u="${u}"]`).value||0);
        st[u]={checked:cb.checked,qty};
      });
      localStorage.setItem('AF_units',JSON.stringify(st));
      localStorage.setItem('AF_int',q('#af_interval').value);
      localStorage.setItem('AF_batch',q('#af_batch').value);
      localStorage.setItem('AF_onlyKnown',q('#af_onlyKnown').checked?'1':'0');
      localStorage.setItem('AF_noLosses',q('#af_noLosses').checked?'1':'0');
      localStorage.setItem('AF_gapMin',q('#af_gapMin').value);
      localStorage.setItem('AF_maxFields',q('#af_maxFields').value);
      localStorage.setItem('AF_groupId',q('#af_group').value);
    }

    p.addEventListener('change',(ev)=>{
      const t=ev.target;
      if(
        t.classList.contains('af_cb') ||
        t.classList.contains('af_qty')||
        [
          'af_interval','af_batch','af_onlyKnown',
          'af_noLosses','af_gapMin','af_maxFields','af_group'
        ].includes(t.id)
      ){
        saveState();
      }
    });

    (function(){
      const drag=q('#af_drag');
      let sx,sy,ox,oy,m=false;
      drag.onmousedown=e=>{m=true; sx=e.clientX; sy=e.clientY; ox=p.offsetLeft; oy=p.offsetTop; e.preventDefault();};
      document.onmousemove=e=>{
        if(!m) return;
        p.style.left=(ox+(e.clientX-sx))+"px";
        p.style.top=(oy+(e.clientY-sy))+"px";
        p.style.right="auto";
      };
      document.onmouseup=()=>m=false;
    })();

    q('#af_hide').onclick=()=>{p.style.display='none';};
    q('#af_start').onclick=()=>start();
    q('#af_stop' ).onclick=()=>stop();

    return p;
  }

  function status(t){const s=q('#af_status'); if(s)s.textContent=t;}
  function info(t){const i=q('#af_info'); if(i)i.textContent=t;}

  async function ensurePanel(show=true){
    const p = await buildPanel();
    if(show) p.style.display='block';
    return p;
  }
  // ---------- RENDERIZAÇÃO DO PLANO (igual sua v2.2) ----------
  function clearPlanTable(){
    $('#'+PLAN_ID).remove();
  }

  function renderPlanTable(plan){
    clearPlanTable();
    const groups = {};
    plan.forEach(j=> (groups[j.originCoord] = groups[j.originCoord] || []).push(j));

    const $wrap = $(`
      <div id="${PLAN_ID}" class="vis" style="margin:8px 0;">
        <h4>FarmGod</h4>
        <div id="AF_progress" class="progress-bar live-progress-bar progress-bar-alive" style="width:98%;margin:5px auto;">
          <div style="background: rgb(146, 194, 0);"></div>
          <span class="label"></span>
        </div>
        <table class="vis" width="100%">
          <thead>
            <tr>
              <th style="text-align:center;">Origem</th>
              <th style="text-align:center;">Alvo</th>
              <th style="text-align:center;">Campos</th>
              <th style="text-align:center;">Farm</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    `);

    const $tbody = $wrap.find('tbody');

    Object.keys(groups).forEach(originCoord=>{
      const arr = groups[originCoord];
      $tbody.append(`
        <tr>
          <td colspan="4" style="background:#e7d098;">
            <input type="button" class="btn" value="Ir para ${originCoord}" onclick="location.href='${game_data.link_base_pure}screen=info_village&id=${arr[0].originId}'" style="float:right;">
            <b style="line-height:24px;">Origem: ${originCoord}</b>
          </td>
        </tr>
      `);
      arr.forEach(j=>{
        $tbody.append(`
          <tr class="af_plan_row" data-origin="${j.originId}" data-target="${j.targetId}">
            <td style="text-align:center;"><a href="${game_data.link_base_pure}screen=info_village&id=${j.originId}">${j.originCoord}</a></td>
            <td style="text-align:center;"><a href="${game_data.link_base_pure}screen=info_village&id=${j.targetId}">${j.targetCoord}</a></td>
            <td style="text-align:center;">${j.distance.toFixed(2)}</td>
            <td style="text-align:center;"><span class="farm_icon farm_icon_a"></span></td>
          </tr>
        `);
      });
    });

    const $anchor = $('#am_widget_Farm').first();
    if ($anchor.length) $anchor.before($wrap);
    else $('body').prepend($wrap);

    if (window.UI && UI.InitProgressBars) {
      UI.InitProgressBars();
      if (UI.updateProgressBar) {
        $('#AF_progress').data('current', 0).data('max', plan.length);
        UI.updateProgressBar($('#AF_progress'), 0, plan.length);
      }
    }
  }

  function updateProgressAfterSend(){
    if (!window.UI || !UI.updateProgressBar) return;
    const $pb = $('#AF_progress');
    const cur = ($pb.data('current') || 0) + 1;
    const max = $pb.data('max') || 0;
    $pb.data('current', cur);
    UI.updateProgressBar($pb, cur, max);
  }

  // ---------- BUSCA DE FARMS (Assistente de Saque) ----------
  function buildAmFarmBaseUrl() {
    const p = new URLSearchParams(window.location.search);
    const order = p.get('order');
    const dir = p.get('dir');
    const extra =
      (order ? '&order='+encodeURIComponent(order) : '') +
      (dir   ? '&dir='+encodeURIComponent(dir) : '');
    return TribalWars.buildURL('GET','am_farm') + extra;
  }

  async function fetchFarms(){
    const farms={};
    const base = buildAmFarmBaseUrl();

    const firstHtml = await $.ajax({url:base});
    const $first = $(firstHtml);

    const hasFarmPage =
         /[?&]Farm_page=\d+/.test(firstHtml)
      || $first.find('a.paged-nav-item[href*="Farm_page="]').length>0;

    const pageParam = hasFarmPage ? 'Farm_page':'page';

    // detectar quantidade de páginas
    const $nav = $first.find('#plunder_list_nav').first();
    let pageCount = 0;
    if ($nav.length){
      const items = $nav.find('a.paged-nav-item, strong.paged-nav-item');
      if (items.length){
        const last = items.last().text().replace(/\D+/g,'');
        pageCount = Math.max(0, parseInt(last,10)||0);
      }
    }
    if(!pageCount){
      const sel = $first.find('.paged-nav-item').first().closest('td').find('select').first();
      if(sel.length) pageCount = sel.find('option').length-1;
    }

    function extract($h){
      $h.find('#plunder_list tr[id^="village_"], #plunder_list_1 tr[id^="village_"], #plunder_list_2 tr[id^="village_"]')
      .each(function(){
        const $tr=$(this);
        const id=parseInt(this.id.split('_')[1],10);
        const coordMatch=($tr.find('a[href*="view="]').first().text()||'').match(/\d{1,3}\|\d{1,3}/);
        if(!coordMatch) return;

        const coord = coordMatch[0];
        const dotImg = $tr.find('img[src*="dots"]').attr('src')||"";
        const dotMatch = dotImg.match(/dots\/(green|yellow|red|blue|red_blue)/);
        const dot = dotMatch ? dotMatch[1] : 'green';

        farms[coord] = { id, dot };
      });
    }

    extract($first);

    const sep = base.includes('?')?'&':'?';
    for(let p=1;p<=pageCount;p++){
      const html = await $.ajax({url:`${base}${sep}${pageParam}=${p}`});
      extract($(html));
    }

    return farms;
  }

  // ---------- BUSCA DE ALDEIAS DE ORIGEM ----------
  async function fetchVillages(groupId){
    const data={};
    const base = TribalWars.buildURL('GET','overview_villages',{mode:'combined',group:groupId});

    async function process(page){
      const html = await $.ajax({url: base+(page===-1?'':'&page='+page)});
      const $html = $(html);

      $html.find('#combined_table .row_a, #combined_table .row_b').each(function(){
        const $el=$(this);
        const $qel=$el.find('.quickedit-label').first();
        const coordMatch=($qel.text()||'').match(/\d{1,3}\|\d{1,3}/);
        if(!coordMatch) return;

        const coord=coordMatch[0];
        const id=parseInt($el.find('.quickedit-vn').first().data('id'),10);
        const units=[];
        $el.find('.unit-item').each((i,elem)=>{
          const u=game_data.units[i];
          if(!skipUnits.has(u))
            units.push(parseInt($(elem).text().replace(/\D+/g,''),10)||0);
        });

        data[coord]={id,coord,units};
      });

      const sel = $html.find('.paged-nav-item').first().closest('td').find('select').first();
      const navLen = sel.length ? sel.find('option').length - 1 : $html.find('.paged-nav-item').length;
      if(page < navLen) return process(page===-1?1:page+1);
    }

    await process(-1);
    return data;
  }

  // ---------- PLANEJAMENTO COM PATCH: "1 alvo == 1 ataque" ----------
  function planPerOrigin(origins, farms, opts){
    const unitsUse = game_data.units.filter(u=>!skipUnits.has(u));
    const need={};

    // tropas marcadas na UI
    unitsUse.forEach(u=>{
      const cb=q(`.af_cb[data-u="${u}"]`);
      const qty=q(`.af_qty[data-u="${u}"]`);
      need[u] = cb && cb.checked ? (parseInt(qty.value||'0',10)||0) : 0;
    });

    // opções
    const { maxFields, onlyKnown, noLosses, gapSec, batch } = opts;

    const nowS=nowSec();
    const result=[];

    // 🔥 PATCH AQUI: impedir que mais de uma origem ataque o mesmo alvo
    const usedTargets = new Set();

    Object.keys(origins).forEach(coordOrigin=>{
      const org = origins[coordOrigin];
      const orgCoord = toCoordObj(coordOrigin);
      if(!orgCoord) return;

      // quantos ataques essa origem pode fazer
      let possible=Infinity, hasSome=false;
      const avail={};
      let idx=0;
      for(let i=0;i<game_data.units.length;i++){
        const u=game_data.units[i];
        if(skipUnits.has(u)) continue;
        const have=org.units[idx++]||0;
        avail[u]=have;
      }

      Object.keys(need).forEach(u=>{
        if(need[u]>0){
          hasSome=true;
          const c=Math.floor((avail[u]||0)/need[u]);
          possible=Math.min(possible,c);
        }
      });

      if(!hasSome || !isFinite(possible)) possible=0;

      const quota=Math.min(batch,Math.max(0,possible));
      if(quota<=0) return;

      const ordered = Object.keys(farms)
        .map(c=>({coord:c,d:dist(orgCoord,toCoordObj(c))}))
        .sort((a,b)=>a.d-b.d);

      let picked=0;
      for(const it of ordered){
        if(picked>=quota) break;

        const fr=farms[it.coord];
        if(!fr) continue;

        if(fr.dot==='red' || fr.dot==='red_blue') continue;
        if(noLosses && fr.dot==='yellow') continue;
        if(onlyKnown && fr.dot!=='green' && fr.dot!=='blue') continue;
        if(it.d > maxFields) continue;

        const key=org.id+':'+fr.id;
        const last=lastSent[key]||0;
        if(last && (nowS-last)<gapSec) continue;

        // 🔥 PATCH: impedir duplicação de alvo
        if(usedTargets.has(fr.id)) continue;
        usedTargets.add(fr.id);

        result.push({
          originId: org.id,
          targetId: fr.id,
          originCoord: coordOrigin,
          targetCoord: it.coord,
          distance: it.d
        });

        picked++;
      }
    });

    return result;
  }

  // ---------- ENVIO DO ATAQUE ----------
  async function sendWithTemplateA(targetId,originId){
    return new Promise((ok,err)=>{
      try{
        const url=Accountmanager.send_units_link.replace(/village=\d+/, 'village='+originId);
        const data={target:targetId,template_id:getTemplateAId(),source:originId};

        const n=(Timing && Timing.getElapsedTimeSinceLoad)?Timing.getElapsedTimeSinceLoad():Date.now();
        if(Accountmanager?.farm?.last_click && n-Accountmanager.farm.last_click<200){
          return setTimeout(()=>sendWithTemplateA(targetId,originId).then(ok).catch(err),250);
        }
        if(Accountmanager?.farm) Accountmanager.farm.last_click=n;

        TribalWars.post(url,null,data,r=>ok(r),e=>err(e||"Falha no envio"));
      }catch(e){err(e);}
    });
  }

  // ---------- CICLO COMPLETO ----------
  async function tick(){
    try{
      if(!running) return;

      const groupId=q('#af_group').value;
      const batch=Math.max(1,parseInt(q('#af_batch').value||10));
      const onlyKnown=q('#af_onlyKnown').checked;
      const noLosses=q('#af_noLosses').checked;
      const gapMin=Math.max(1,parseInt(q('#af_gapMin').value||15));
      const gapSec=gapMin*60;
      const maxFields=Math.max(1,parseInt(q('#af_maxFields').value||25));

      status("Salvando template A...");
      await saveTemplateAFromPanel();

      status("Lendo aldeias...");
      const villages=await fetchVillages(groupId);

      status("Lendo farms...");
      const farms=await fetchFarms();

      status("Planejando...");
      const plan=planPerOrigin(villages,farms,{maxFields,onlyKnown,noLosses,gapSec,batch});

      info(`Plano gerado: ${plan.length} envios`);
      renderPlanTable(plan);

      let sent=0;
      const nowS=nowSec();

      for(const job of plan){
        if(!running) break;

        status(`Enviando ${sent+1}/${plan.length} (${job.originCoord} → ${job.targetCoord})`);

        try{
          await sendWithTemplateA(job.targetId,job.originId);
          lastSent[job.originId+':'+job.targetId]=nowS;
          saveLast(lastSent);

          $(`#${PLAN_ID} tr.af_plan_row[data-origin="${job.originId}"][data-target="${job.targetId}"]`).remove();
          updateProgressAfterSend();

          if(UI&&UI.SuccessMessage)
            UI.SuccessMessage(`OK ${job.originCoord} → ${job.targetCoord}`);

          sent++;
          await sleep(350+Math.random()*250);

        }catch(e){
          if(UI&&UI.ErrorMessage) UI.ErrorMessage(e.error||"Falha no envio");
        }
      }

      status(`OK: ${sent}/${plan.length}`);
    }catch(e){
      console.error(e);
      status("Erro: "+e);
    }
  }

  async function start(){
    if(running) return;
    running=true;

    const btnS=q('#af_start'), btnP=q('#af_stop');
    if(btnS) btnS.disabled=true;
    if(btnP) btnP.disabled=false;

    status("Iniciando...");
    clearPlanTable();

    const minutes=Math.max(0.2,parseFloat(q('#af_interval').value||3));
    await tick();
    timer=setInterval(tick,minutes*60*1000);
  }

  function stop(){
    running=false;
    if(timer) clearInterval(timer);
    const btnS=q('#af_start'), btnP=q('#af_stop');
    if(btnS) btnS.disabled=false;
    if(btnP) btnP.disabled=true;
    status("Parado");
  }

  (async function(){
    await ensurePanel(true);
    if(UI&&UI.SuccessMessage) UI.SuccessMessage("AutoFarm v2.3 carregado (BR138)");
  })();

  window.AutoFarm={start,stop,isRunning:()=>running,__loaded:true};
})();
