/* AutoFarm.js – BR138 – Versão 2.2 (com patch “1 ataque por alvo”)
 * - Redireciona para screen=am_farm se não estiver na página do Assistente de Saque
 * - Multi-origem por GRUPO, ordenado por distância
 * - Proteção por combo (origem+alvo) em minutos
 * - Ataques possíveis por origem (com base nas quantidades marcadas)
 * - Renderização do planejamento na UI (agrupado por origem + barra de progresso)
 * - Filtros: Só já atacados, Sem perdas (amarelo), Campos máx., Lote/origem
 * - Envio via Template A (TribalWars.post)
 * - Busca TODAS as páginas do Assistente (detecta Farm_page/page e preserva order/dir)
 */

(function(){
  'use strict';

  if (!window.$ || !window.game_data) {
    console.error('AutoFarm: jQuery/game_data indisponível');
    return;
  }

  //----------------------- REDIRECIONAMENTO --------------------------
  if (game_data.screen !== 'am_farm') {
    try {
      location.href = TribalWars.buildURL('GET','am_farm');
    } catch(e) {
      location.href = game_data.link_base_pure + 'am_farm';
    }
    return;
  }

  //----------------------- EVITA DUPLO LOAD --------------------------
  if (window.AutoFarm && window.AutoFarm.__loaded) {
    const p0 = document.getElementById('autoFarmPanel_hosted_single_v2');
    if (p0) p0.style.display = 'block';
    if (UI?.SuccessMessage) UI.SuccessMessage('AutoFarm v2 já carregado (BR138).');
    return;
  }

  const $ = window.$;
  const PANEL_ID = 'autoFarmPanel_hosted_single_v2';
  const PLAN_ID  = 'AutoFarmPlanTable';
  const skipUnits = new Set(['ram','catapult','knight','snob','militia']);
  const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
  const q  = (sel, ctx=document) => ctx.querySelector(sel);
  const qa = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

  // Persistência (origem+alvo)
  const LAST_KEY = 'AF_lastSent_v2_combo';
  function loadLast(){ try{return JSON.parse(localStorage.getItem(LAST_KEY)||'{}');}catch(_){return {}} }
  function saveLast(m){ try{localStorage.setItem(LAST_KEY,JSON.stringify(m));}catch(_){} }
  let lastSent = loadLast();

  let running = false;
  let timer   = null;

  //------------------------------- UTIL --------------------------------
  function toCoordObj(coord){ const m=coord?.match(/(\d{1,3})\|(\d{1,3})/); return m?{x:+m[1],y:+m[2]}:null; }
  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
  function nowSec(){ return Math.floor(Date.now()/1000); }

  //---------------------------------------------------------------------
  //---------------------------- PAINEL --------------------------------
  //---------------------------------------------------------------------
  async function buildGroupSelect(selectedId){
    try{
      const resp = await $.get(TribalWars.buildURL('GET','groups',{ ajax:'load_group_menu' }));
      let html = '<select id="af_group" style="max-width:180px">';
      resp.result.forEach(g=>{
        if(g.type==='separator') html+='<option disabled>────────</option>';
        else html+=`<option value="${g.group_id}" ${String(g.group_id)===String(selectedId)?'selected':''}>${g.name}</option>`;
      });
      html+='</select>';
      return html;
    }catch(e){
      return `<select id="af_group"><option value="0" selected>Todos</option></select>`;
    }
  }

  async function buildPanel(){
    let p = q('#'+PANEL_ID);
    if (p) return p;

    const units = game_data.units.filter(u=>!skipUnits.has(u));
    const savedUnits = JSON.parse(localStorage.getItem('AF_units')||'{}');
    const intSaved   = Number(localStorage.getItem('AF_int')||3);
    const batchSaved = Number(localStorage.getItem('AF_batch')||10);
    const onlyKnownSav = localStorage.getItem('AF_onlyKnown')!=='0';
    const noLossesSav  = localStorage.getItem('AF_noLosses')!=='0';
    const gapSaved     = Number(localStorage.getItem('AF_gapMin')||15);
    const maxFieldsSav = Number(localStorage.getItem('AF_maxFields')||25);
    const groupSav     = localStorage.getItem('AF_groupId')||'0';

    const groupSelect = await buildGroupSelect(groupSav);

    p = document.createElement('div');
    p.id = PANEL_ID;
    p.style.cssText=`
      position:fixed; top:80px; right:16px; z-index:99999;
      background:#fff; border:1px solid #7d510f; padding:10px; width:380px;
      box-shadow:0 6px 18px rgba(0,0,0,.2); border-radius:10px;
      font:12px/1.25 Arial, sans-serif;
    `;
    document.body.appendChild(p);

    p.innerHTML = `
      <div id="af_drag" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:move;">
        <strong style="flex:1">AutoFarm v2 (Template A – BR138)</strong>
        <button id="af_hide" class="btn btn-cancel">×</button>
      </div>

      <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;">
        <label>Grupo:</label>
        ${groupSelect}
        <label style="margin-left:8px">Campos máx.:</label>
        <input id="af_maxFields" type="number" value="${maxFieldsSav}" style="width:64px;">
      </div>

      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
        <label>Intervalo (min):</label>
        <input id="af_interval" type="number" value="${intSaved}" step="0.1" style="width:64px;">
        <label>Lote/origem:</label>
        <input id="af_batch" type="number" value="${batchSaved}" style="width:80px;">
      </div>

      <div style="display:flex;gap:10px;align-items:center;margin-bottom:6px;">
        <label><input id="af_onlyKnown" type="checkbox" ${onlyKnownSav?'checked':''}> Só já atacados</label>
        <label><input id="af_noLosses"  type="checkbox" ${noLossesSav?'checked':''}> Sem perdas</label>
      </div>

      <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">
        <label>Proteção por alvo (min):</label>
        <input id="af_gapMin" type="number" value="${gapSaved}" style="width:64px;">
      </div>

      <div id="af_units" style="max-height:220px;overflow:auto;border:1px solid #ddd;padding:6px;border-radius:6px;margin-bottom:8px;"></div>

      <div style="display:flex;gap:8px;align-items:center;">
        <button id="af_start" class="btn">Start</button>
        <button id="af_stop" class="btn btn-cancel" disabled>Stop</button>
        <span id="af_status" style="margin-left:auto;color:#666;">pronto</span>
      </div>

      <div id="af_info" style="margin-top:6px;color:#444;"></div>
    `;

    // unidades no painel
    const box = q('#af_units');
    units.forEach(u=>{
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:4px;';
      const st=savedUnits[u]||{checked:false,qty:0};
      row.innerHTML=`
        <input type="checkbox" class="af_cb" data-u="${u}" ${st.checked?'checked':''}>
        <img src="${image_base+'unit/unit_'+u+'.png'}" style="width:16px;height:16px;">
        <span style="width:120px;text-transform:capitalize">${u}</span>
        <input type="number" class="af_qty" data-u="${u}" value="${st.qty}" style="width:100px;">
      `;
      box.appendChild(row);
    });

    // salvar estado
    function saveState(){
      const st={};
      qa('.af_cb').forEach(cb=>{
        const u = cb.dataset.u;
        const qn = q(`.af_qty[data-u="${u}"]`);
        st[u]={checked:cb.checked,qty:Number(qn?.value||0)};
      });
      localStorage.setItem('AF_units',JSON.stringify(st));
      localStorage.setItem('AF_int',q('#af_interval').value);
      localStorage.setItem('AF_batch',q('#af_batch').value);
      localStorage.setItem('AF_onlyKnown',q('#af_onlyKnown').checked?'1':'0');
      localStorage.setItem('AF_noLosses', q('#af_noLosses').checked?'1':'0');
      localStorage.setItem('AF_gapMin',   q('#af_gapMin').value);
      localStorage.setItem('AF_maxFields',q('#af_maxFields').value);
      localStorage.setItem('AF_groupId',  q('#af_group').value);
    }

    p.addEventListener('change',saveState);

    // drag
    (function(){
      const drag=q('#af_drag');
      let sx,sy,ox,oy,m=false;
      drag.onmousedown=e=>{m=true;sx=e.clientX;sy=e.clientY;ox=p.offsetLeft;oy=p.offsetTop;e.preventDefault();}
      document.onmousemove=e=>{
        if(!m)return;
        p.style.left=(ox + e.clientX - sx)+'px';
        p.style.top =(oy + e.clientY - sy)+'px';
        p.style.right='auto';
      }
      document.onmouseup=()=>m=false;
      q('#af_hide').onclick=()=>p.style.display='none';
    })();

    q('#af_start').onclick=start;
    q('#af_stop').onclick=stop;

    return p;
  }

  function status(t){ const s=q('#af_status'); if(s)s.textContent=t; }
  function info(t){ const i=q('#af_info'); if(i)i.textContent=t; }

  async function ensurePanel(show=true){
    const p=await buildPanel();
    if(show)p.style.display='block';
    return p;
  }

  //---------------------- PLANO NA UI -------------------------
  function clearPlanTable(){ $('#'+PLAN_ID).remove(); }

  function renderPlanTable(plan){
    clearPlanTable();
    const groups={};
    plan.forEach(j=>{ (groups[j.originCoord]=groups[j.originCoord]||[]).push(j); });

    const $wrap=$(`
      <div id="${PLAN_ID}" class="vis" style="margin:8px 0;">
        <h4>FarmGod</h4>
        <div id="AF_progress" class="progress-bar live-progress-bar progress-bar-alive" style="width:98%;margin:5px auto;">
          <div style="background: rgb(146,194,0);"></div>
          <span class="label"></span>
        </div>
        <table class="vis" width="100%">
          <thead>
            <tr>
              <th style="text-align:center;">Origem</th>
              <th style="text-align:center;">Target</th>
              <th style="text-align:center;">fields</th>
              <th style="text-align:center;">Farm</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    `);

    const $tb=$wrap.find('tbody');

    Object.keys(groups).forEach(origin=>{
      const arr=groups[origin];
      $tb.append(`
        <tr>
          <td colspan="4" style="background:#e7d098;">
            <input type="button" class="btn" value="Ir para ${origin}" 
              onclick="location.href='${game_data.link_base_pure}info_village&id=${arr[0].originId}'" 
              style="float:right;">
            <b>Origem: ${origin}</b>
          </td>
        </tr>
      `);

      arr.forEach(j=>{
        $tb.append(`
          <tr class="af_plan_row" data-origin="${j.originId}" data-target="${j.targetId}">
            <td style="text-align:center;"><a href="${game_data.link_base_pure}info_village&id=${j.originId}">${j.originCoord}</a></td>
            <td style="text-align:center;"><a href="${game_data.link_base_pure}info_village&id=${j.targetId}">${j.targetCoord}</a></td>
            <td style="text-align:center;">${j.distance.toFixed(2)}</td>
            <td style="text-align:center;"><span class="farm_icon farm_icon_a"></span></td>
          </tr>
        `);
      });
    });

    $('#am_widget_Farm').first().before($wrap);

    if(UI?.InitProgressBars){
      UI.InitProgressBars();
      if(UI.updateProgressBar){
        $('#AF_progress').data('current',0).data('max',plan.length);
        UI.updateProgressBar($('#AF_progress'),0,plan.length);
      }
    }
  }

  function updateProgressAfterSend(){
    const $pb=$('#AF_progress');
    if(!$pb.length||!UI?.updateProgressBar)return;
    const c=($pb.data('current')||0)+1;
    const m=($pb.data('max')||0);
    $pb.data('current',c);
    UI.updateProgressBar($pb,c,m);
  }

  //------------------- LEITURA TEMPLATE A -------------------
  function getTemplateAId(){
    const inp=q('form[action*="action=edit_all"] input[name*="template"][name*="[id]"]');
    return inp?Number(inp.value):1;
  }

  async function saveTemplateAFromPanel(){
    const form=q('form[action*="action=edit_all"]');
    if(!form)throw new Error('Form template não encontrado');
    const tr=form.querySelector('input[name*="template"][name*="[id]"]')?.closest('tr');
    if(!tr)throw new Error('Linha Template A não encontrada');

    const units=game_data.units.filter(u=>!skipUnits.has(u));
    units.forEach(u=>{
      const cb=q(`.af_cb[data-u="${u}"]`);
      const qty=q(`.af_qty[data-u="${u}"]`);
      const inp=tr.querySelector(`input[name="${u}[amount]"],input[name^="${u}["],input[name*="[${u}]"]`);
      if(inp && cb && qty) inp.value=cb.checked?(parseInt(qty.value||0)||0):0;
    });

    const data=$(form).serialize();
    await $.post(form.action, data);
  }

  //----------------- BUSCA AM_FARM MULTIPÁGINA -----------------
  function buildAmFarmBaseUrl(){
    const params=new URLSearchParams(location.search);
    const order=params.get('order');
    const dir  =params.get('dir');
    let extra='';
    if(order)extra+='&order='+order;
    if(dir)  extra+='&dir='  +dir;
    return TribalWars.buildURL('GET','am_farm')+extra;
  }

  async function fetchFarms(){
    const farms={};
    const base=buildAmFarmBaseUrl();

    const firstHtml=await $.get(base);
    const $first=$(firstHtml);

    const hasFarmPage=/[?&]Farm_page=\d+/.test(firstHtml) ||
                      $first.find('a.paged-nav-item[href*="Farm_page="]').length>0;

    const pageParam=hasFarmPage?'Farm_page':'page';

    let pageCount=0;
    const $nav=$first.find('#plunder_list_nav').first();
    if($nav.length){
      const items=$nav.find('a.paged-nav-item,strong.paged-nav-item');
      if(items.length){
        const last=items.last().text().replace(/\D+/g,'');
        pageCount=Math.max(0,parseInt(last)||0);
      }
    }

    if(!pageCount){
      const $sel=$first.find('.paged-nav-item').first().closest('td').find('select').first();
      if($sel.length) pageCount=Math.max(0,$sel.find('option').length-1);
    }

    function extract($h){
      $h.find('#plunder_list tr[id^="village_"], #plunder_list_1 tr[id^="village_"], #plunder_list_2 tr[id^="village_"]')
      .each(function(){
        const $tr=$(this);
        const id=parseInt(this.id.split('_')[1],10);
        const coordMatch=$tr.find('a[href*="screen=report&mode=all&view="]').first().text().match(/\d{1,3}\|\d{1,3}/);
        if(!coordMatch)return;
        const coord=coordMatch[0];
        const dotImg=$tr.find('img[src*="graphic/dots/"]').attr('src')||'';
        const dot=/dots\/(green|yellow|red|blue|red_blue)/.exec(dotImg)?.[1] || 'green';
        const hasReport=!!$tr.find('a[href*="view="]').length;
        farms[coord]={id,dot,hasReport};
      });
    }

    extract($first);

    const sep=base.includes('?')?'&':'?';
    for(let p=1;p<=pageCount;p++){
      const html=await $.get(`${base}${sep}${pageParam}=${p}`);
      extract($(html));
    }

    return farms;
  }

  async function fetchVillages(groupId){
    const data={};
    const url=TribalWars.buildURL('GET','overview_villages',{mode:'combined',group:groupId});

    async function process(page){
      const html=await $.get(url+(page===-1?'':'&page='+page));
      const $h=$(html);

      $h.find('#combined_table .row_a,#combined_table .row_b').each(function(){
        const $el=$(this);
        const $qel=$el.find('.quickedit-label').first();
        const cstr=$qel.text().match(/\d{1,3}\|\d{1,3}/);
        if(!cstr)return;
        const coord=cstr[0];
        const id=parseInt($el.find('.quickedit-vn').first().data('id'),10);
        const name=$qel.data('text')||$qel.text();

        const units=[];
        $el.find('.unit-item').each(function(i){
          const uname=game_data.units[i];
          if(!skipUnits.has(uname))
            units.push(parseInt($(this).text().replace(/\D+/g,''))||0);
        });

        data[coord]={id,name,coord,units};
      });

      const navSel=$h.find('.paged-nav-item').first().closest('td').find('select').first();
      const navLen=navSel.length?navSel.find('option').length-1:$h.find('.paged-nav-item').not('[href*="page=-1"]').length;
      if(page<navLen) return process(page===-1?1:page+1);
    }

    await process(-1);
    return data;
  }

  //----------------------------------------------------------------------
  //---------------------- PATCH APLICADO AQUI ---------------------------
 ----------------------------------------------------------------------

  // ⭐⭐ **ESTA É A ÚNICA FUNÇÃO ALTERADA** ⭐⭐
  // Restrição: APENAS 1 ATAQUE por alvo (global) em cada ciclo
  function planPerOrigin(origins, farms, opts){
    const useUnits = game_data.units.filter(u=>!skipUnits.has(u));

    const need={};
    useUnits.forEach(u=>{
      const cb=q(`.af_cb[data-u="${u}"]`);
      const qt=q(`.af_qty[data-u="${u}"]`);
      need[u]=(cb&&cb.checked)?(parseInt(qt.value||0)||0):0;
    });

    const { maxFields, onlyKnown, noLosses, gapSec, batch } = opts;
    const nowS=nowSec();
    const result=[];

    // PATCH → impede multi-origem no mesmo alvo
    const usedTargets = new Set();

    Object.keys(origins).forEach(coordOrigin=>{
      const org=origins[coordOrigin];
      const orgCoord=toCoordObj(coordOrigin);
      if(!orgCoord)return;

      let possible=Infinity;
      let hasAny=false;
      const avail={};
      let idx=0;

      for(let i=0;i<game_data.units.length;i++){
        const uname=game_data.units[i];
        if(skipUnits.has(uname))continue;
        const have=org.units[idx++]||0;
        avail[uname]=have;
      }

      Object.keys(need).forEach(u=>{
        const n=need[u];
        if(n>0){
          hasAny=true;
          const have=avail[u]||0;
          const count=Math.floor(have/n);
          possible=Math.min(possible,count);
        }
      });

      if(!hasAny||!isFinite(possible))possible=0;
      const quota=Math.min(batch,Math.max(0,possible));
      if(quota<=0)return;

      const ordered=Object.keys(farms).map(coord=>{
        return {coord,d:dist(orgCoord,toCoordObj(coord))};
      }).sort((a,b)=>a.d-b.d);

      let picked=0;

      for(const it of ordered){
        if(picked>=quota)break;

        const f=farms[it.coord];
        if(!f)continue;

        if(f.dot==='red' || f.dot==='red_blue')continue;
        if(noLosses && f.dot==='yellow')continue;
        if(onlyKnown && !f.hasReport)continue;
        if(it.d>maxFields)continue;

        // PATCH → verifica se alvo já foi usado por outra origem
        if(usedTargets.has(f.id)) continue;

        const key=org.id+':'+f.id;
        const last=lastSent[key]?Number(lastSent[key]):0;
        if(last && (nowS-last)<gapSec) continue;

        // marca alvo como já usado
        usedTargets.add(f.id);

        result.push({
          originId:org.id,
          targetId:f.id,
          originCoord:coordOrigin,
          targetCoord:it.coord,
          distance:it.d
        });
        picked++;
      }
    });

    return result;
  }

  //----------------------------------------------------------------------
  //------------------------------- ENVIO --------------------------------
  //----------------------------------------------------------------------
  async function sendWithTemplateA(targetId, originVillageId){
    return new Promise((resolve,reject)=>{
      try{
        const url=Accountmanager.send_units_link.replace(/village=\d+/,`village=${originVillageId}`);
        const data={target:targetId,template_id:getTemplateAId(),source:originVillageId};
        const n=Timing?.getElapsedTimeSinceLoad?.() ?? Date.now();

        if(Accountmanager?.farm){
          if(Accountmanager.farm.last_click && n - Accountmanager.farm.last_click < 200){
            return setTimeout(()=>sendWithTemplateA(targetId,originVillageId).then(resolve).catch(reject),220);
          }
          Accountmanager.farm.last_click=n;
        }

        TribalWars.post(url,null,data,r=>resolve(r),e=>reject(e||'Erro no envio'));
      }catch(e){reject(e);}
    });
  }

  //----------------------------------------------------------------------
  //------------------------------- CICLO --------------------------------
  //----------------------------------------------------------------------
  async function tick(){
    try{
      if(!running)return;

      const groupId=q('#af_group').value;
      const batch  =Number(q('#af_batch').value);
      const onlyKnown=q('#af_onlyKnown').checked;
      const noLosses =q('#af_noLosses').checked;
      const gapMin   =Number(q('#af_gapMin').value);
      const gapSec   =gapMin*60;
      const maxFields=Number(q('#af_maxFields').value);

      status('salvando template...');
      await saveTemplateAFromPanel();

      status('lendo aldeias...');
      const villages=await fetchVillages(groupId);

      status('lendo lista...');
      const farms=await fetchFarms();

      status('planejando...');
      const plan=planPerOrigin(villages, farms, {maxFields,onlyKnown,noLosses,gapSec,batch});

      info(`Plano: ${plan.length} envios`);
      renderPlanTable(plan);

      if(!plan.length){
        status('sem alvos válidos');
        return;
      }

      const ts=nowSec();
      let sent=0;

      for(const job of plan){
        if(!running)break;

        status(`enviando ${sent+1}/${plan.length}`);
        try{
          await sendWithTemplateA(job.targetId,job.originId);

          lastSent[job.originId+':'+job.targetId]=ts;
          saveLast(lastSent);

          $(`#${PLAN_ID} tr.af_plan_row[data-origin="${job.originId}"][data-target="${job.targetId}"]`).remove();
          updateProgressAfterSend();

          UI?.SuccessMessage?.(`${job.originCoord} → ${job.targetCoord}`);
          sent++;
          await sleep(350+Math.random()*250);
        }catch(e){
          UI?.ErrorMessage?.(e);
        }
      }

      status(`OK ${sent}/${plan.length}`);
    }catch(e){
      status('erro: '+e);
      console.error(e);
    }
  }

  async function start(){
    if(running)return;
    await ensurePanel(true);
    running=true;
    q('#af_start').disabled=true;
    q('#af_stop').disabled=false;
    status('iniciando...');
    clearPlanTable();
    const mins=parseFloat(q('#af_interval').value||'3');
    await tick();
    timer=setInterval(tick,mins*60000);
  }

  function stop(){
    running=false;
    if(timer)clearInterval(timer);
    q('#af_start').disabled=false;
    q('#af_stop').disabled=true;
    status('parado');
  }

  //----------------------------------------------------------------------
  //------------------------------- BOOT --------------------------------
  //----------------------------------------------------------------------
  (async function(){
    await ensurePanel(true);
    UI?.SuccessMessage?.('AutoFarm v2.2 (BR138) carregado.');
  })();

  window.AutoFarm={start,stop,isRunning:()=>running,__loaded:true};

})();
