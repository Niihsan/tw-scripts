/* AutoFarm v2.3 – BR138
 * Funções:
 *  - Apenas DOT VERDE (sem perdas)
 *  - Um único ataque por alvo por ciclo
 *  - Preferência pela aldeia mais próxima, fallback para segunda/terceira (estilo FarmGod)
 *  - Sem duplicação de alvos
 *  - Paginação Farm_page / page
 *  - Redirecionamento automático
 *  - Batch por origem
 *  - Proteção origem+alvo (minutos)
 *  - UI estilo FarmGod
 *  - Template A dinâmico
 */

(function(){
'use strict';
if(!window.$ || !window.game_data){console.error("AutoFarm: jQuery/game_data indisponíveis");return;}

// se não estiver em am_farm → redireciona
if(game_data.screen!=="am_farm"){
    try{location.href=TribalWars.buildURL("GET","am_farm");}
    catch(e){location.href=game_data.link_base_pure+"am_farm";}
    return;
}

// impedir duplicação de script
if(window.AutoFarm && window.AutoFarm.__loaded){
    const p=document.getElementById("autoFarmPanel_v23");
    if(p) p.style.display="block";
    if(window.UI && UI.SuccessMessage) UI.SuccessMessage("AutoFarm v2.3 já carregado.");
    return;
}

const $ = window.$;
const PANEL_ID="autoFarmPanel_v23";
const PLAN_ID="AutoFarmPlan_v23";
const skipUnits=new Set(["ram","catapult","knight","snob","militia"]);
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

function nowSec(){return Math.floor(Date.now()/1000);}
function toCoordObj(c){const m=(c||"").match(/(\d{1,3})\|(\d{1,3})/);return m?{x:+m[1],y:+m[2]}:null;}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function q(s,ctx=document){return ctx.querySelector(s);}
function qa(s,ctx=document){return Array.from(ctx.querySelectorAll(s));}

// memória origem+alvo
const LAST_KEY="AF_v23_lastSent";
function loadLast(){try{return JSON.parse(localStorage.getItem(LAST_KEY)||"{}");}catch(_){return{};}}
function saveLast(m){try{localStorage.setItem(LAST_KEY,JSON.stringify(m));}catch(_){}}
let lastSent=loadLast();

// painel
async function buildGroupSelect(selected){
    try{
        const r=await $.get(TribalWars.buildURL("GET","groups",{ajax:"load_group_menu"}));
        let h=`<select id="af_group" style="max-width:180px">`;
        r.result.forEach(g=>{
            if(g.type==="separator") h+=`<option disabled>────────</option>`;
            else h+=`<option value="${g.group_id}" ${String(g.group_id)===String(selected)?"selected":""}>${g.name}</option>`;
        });
        h+=`</select>`;
        return h;
    }catch(e){
        return `<select id="af_group"><option value="0" selected>Todos</option></select>`;
    }
}

async function buildPanel(){
    let p=document.getElementById(PANEL_ID);
    if(p) return p;

    const units=game_data.units.filter(u=>!skipUnits.has(u));
    const saved=JSON.parse(localStorage.getItem("AF_v23_units")||"{}");
    const savedInt=Number(localStorage.getItem("AF_v23_int")||3);
    const savedGap=Number(localStorage.getItem("AF_v23_gap")||15);
    const savedBatch=Number(localStorage.getItem("AF_v23_batch")||10);
    const savedFields=Number(localStorage.getItem("AF_v23_fields")||25);
    const savedGroup=localStorage.getItem("AF_v23_group")||"0";

    const groupSel=await buildGroupSelect(savedGroup);

    p=document.createElement("div");
    p.id=PANEL_ID;
    p.style.cssText=`
        position:fixed;top:80px;right:16px;z-index:99999;
        background:#fff;border:1px solid #7d510f;padding:10px;
        width:380px;box-shadow:0 0 12px rgba(0,0,0,.25);
        border-radius:10px;font:12px Arial;
    `;

    p.innerHTML=`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:move;" id="af_drag_v23">
        <b style="flex:1">AutoFarm v2.3 – BR138</b>
        <button id="af_hide_v23" class="btn btn-cancel">×</button>
      </div>

      <div style="margin-bottom:6px;">
        Grupo: ${groupSel}
        &nbsp;&nbsp; Campos máx:
        <input id="af_fields_v23" type="number" min="1" value="${savedFields}" style="width:60px;">
      </div>

      <div style="margin-bottom:6px;">
        Intervalo(min):
        <input id="af_interval_v23" type="number" min="0.1" step="0.1" value="${savedInt}" style="width:60px;">
        &nbsp; Lote:
        <input id="af_batch_v23" type="number" min="1" step="1" value="${savedBatch}" style="width:60px;">
      </div>

      <div style="margin-bottom:6px;">
        Proteção alvo(min):
        <input id="af_gap_v23" type="number" min="1" value="${savedGap}" style="width:60px;">
      </div>

      <div style="margin-bottom:6px;color:#333;">
        <b>Apenas DOT VERDE (ataques sem perdas)</b>
      </div>

      <div id="af_units_list_v23"
           style="max-height:200px;overflow:auto;border:1px solid #ddd;padding:6px;margin-bottom:6px;border-radius:6px;">
      </div>

      <div style="display:flex;gap:8px;align-items:center;">
        <button id="af_start_v23" class="btn btn-confirm">Start</button>
        <button id="af_stop_v23"  class="btn btn-cancel" disabled>Stop</button>
        <span id="af_status_v23"  style="margin-left:10px;">pronto</span>
      </div>

      <div id="af_info_v23" style="margin-top:6px;color:#444;"></div>
    `;

    document.body.appendChild(p);

    // tropas
    const box=q("#af_units_list_v23");
    units.forEach(u=>{
        const st=saved[u]||{checked:false,qty:0};
        const r=document.createElement("div");
        r.style="display:flex;align-items:center;gap:6px;margin-bottom:4px;";
        r.innerHTML=`
          <input type="checkbox" class="af_cb_v23" data-u="${u}" ${st.checked?"checked":""}>
          <img src="${image_base+"unit/unit_"+u+".png"}" style="width:16px;height:16px;">
          <span style="width:110px;">${u}</span>
          <input type="number" class="af_qty_v23" data-u="${u}"
            value="${st.qty}" min="0" style="width:80px;">
        `;
        box.appendChild(r);
    });

    function saveState(){
        const m={};
        qa(".af_cb_v23").forEach(cb=>{
            const u=cb.dataset.u;
            const qty=Number(q(`.af_qty_v23[data-u="${u}"]`).value||0);
            m[u]={checked:cb.checked,qty};
        });
        localStorage.setItem("AF_v23_units",JSON.stringify(m));
        localStorage.setItem("AF_v23_int",q("#af_interval_v23").value);
        localStorage.setItem("AF_v23_gap",q("#af_gap_v23").value);
        localStorage.setItem("AF_v23_batch",q("#af_batch_v23").value);
        localStorage.setItem("AF_v23_fields",q("#af_fields_v23").value);
        localStorage.setItem("AF_v23_group",q("#af_group").value);
    }

    p.addEventListener("change",ev=>{
        if(ev.target.classList.contains("af_cb_v23")
        || ev.target.classList.contains("af_qty_v23")
        || ["af_interval_v23","af_gap_v23","af_batch_v23","af_fields_v23","af_group"].includes(ev.target.id))
            saveState();
    });

    // drag
    (function(){
        const d=q("#af_drag_v23");
        let ok=false,sx=0,sy=0,ox=0,oy=0;
        d.onmousedown=e=>{ok=true;sx=e.clientX;sy=e.clientY;ox=p.offsetLeft;oy=p.offsetTop;e.preventDefault();};
        document.onmousemove=e=>{
            if(!ok) return;
            p.style.left=(ox+(e.clientX-sx))+"px";
            p.style.top=(oy+(e.clientY-sy))+"px";
            p.style.right="auto";
        };
        document.onmouseup=()=>ok=false;
    })();

    q("#af_hide_v23").onclick=()=>{p.style.display="none";};
    return p;
}

function status(t){const e=q("#af_status_v23");if(e)e.textContent=t;}
function info(t){const e=q("#af_info_v23");if(e)e.textContent=t;}

(async function(){
    await buildPanel();
})();
// =========================================
// TEMPLATE A – SALVAR TROPA DEFINIDA NO PAINEL
// =========================================
function getTemplateAId(){
    const inp = document.querySelector(
        'form[action*="action=edit_all"] input[name*="template"][name*="[id]"]'
    );
    return inp ? Number(inp.value) : 1;
}

async function saveTemplateA(){
    const form = document.querySelector('form[action*="action=edit_all"]');
    if(!form) return;
    const row=form.querySelector('input[name*="template"][name*="[id]"]').closest('tr');
    const units=game_data.units.filter(u=>!skipUnits.has(u));

    units.forEach(u=>{
        const cb=document.querySelector(`.af_cb_v23[data-u="${u}"]`);
        const qty=document.querySelector(`.af_qty_v23[data-u="${u}"]`);
        const inp=row.querySelector(`input[name="${u}[amount]"],input[name^="${u}["],input[name*="[${u}]"]`);
        if(inp&&cb) inp.value=cb.checked?(parseInt(qty.value||"0",10)||0):0;
    });

    await $.ajax({
        url:form.getAttribute("action"),
        method:"POST",
        data:$(form).serialize()
    });
}

// =========================================
// CAPTURAR TODAS AS PÁGINAS DO ASSISTENTE (DOT VERDE APENAS)
// =========================================
function buildAmFarmBaseUrl(){
    const params=new URLSearchParams(window.location.search);
    const order=params.get("order");
    const dir=params.get("dir");
    const extra=(order?`&order=${encodeURIComponent(order)}`:"")
               +(dir?`&dir=${encodeURIComponent(dir)}`:"");
    return TribalWars.buildURL("GET","am_farm")+extra;
}

async function fetchFarms(){
    const farms={};
    const base=buildAmFarmBaseUrl();

    const first=await $.ajax({url:base});
    const $first=$(first);

    const hasFarmPage=/[?&]Farm_page=\d+/.test(first)
       ||$first.find('a.paged-nav-item[href*="Farm_page="]').length>0;

    const pageParam=hasFarmPage?"Farm_page":"page";

    let pageCount=0;
    const nav=$first.find("#plunder_list_nav").first();
    if(nav.length){
        const items=nav.find("a.paged-nav-item, strong.paged-nav-item");
        if(items.length){
            const last=items.last().text().replace(/\D+/g,"");
            pageCount=Math.max(0,parseInt(last,10)||0);
        }
    }
    if(!pageCount){
        const sel=$first.find(".paged-nav-item").first().closest("td").find("select").first();
        if(sel.length) pageCount=sel.find("option").length-1;
    }

    function extract($html){
        $html.find(
            '#plunder_list tr[id^="village_"],'+
            '#plunder_list_1 tr[id^="village_"],'+
            '#plunder_list_2 tr[id^="village_"]'
        ).each(function(){
            const $tr=$(this);
            const id=parseInt(this.id.split("_")[1],10);

            const dotImg=$tr.find('img[src*="dots"]').attr("src")||"";
            if(!/dots\/green/.test(dotImg)) return; // somente DOT VERDE

            const coordMatch=$tr.find('a[href*="view="]').first().text().match(/\d{1,3}\|\d{1,3}/);
            if(!coordMatch) return;

            const coord=coordMatch[0];
            farms[coord]={id};
        });
    }

    extract($first);

    const sep=base.includes("?")?"&":"?";
    for(let p=1;p<=pageCount;p++){
        const html=await $.ajax({url:`${base}${sep}${pageParam}=${p}`});
        extract($(html));
    }

    return farms;
}

// =========================================
// CAPTURAR ALDEIAS DA ORIGEM
// =========================================
async function fetchVillages(groupId){
    const out={};
    const url=TribalWars.buildURL("GET","overview_villages",{mode:"combined",group:groupId});

    async function proc(page){
        const html=await $.ajax({url:url+(page===-1?"":`&page=${page}`)});
        const $h=$(html);

        $h.find('#combined_table .row_a, #combined_table .row_b')
        .each(function(){
            const $el=$(this);
            const $q=$el.find(".quickedit-label").first();
            const coord=($q.text().match(/\d{1,3}\|\d{1,3}/)||[])[0];
            if(!coord) return;
            const id=parseInt($el.find(".quickedit-vn").first().data("id"),10);

            const units=[];
            $el.find(".unit-item").each((i,x)=>{
                const u=game_data.units[i];
                if(!skipUnits.has(u)){
                    units.push(parseInt($(x).text().replace(/\D+/g,""),10)||0);
                }
            });

            out[coord]={id,coord,units};
        });

        const sel=$h.find('.paged-nav-item').first().closest("td").find("select").first();
        const navLen=sel.length?sel.find("option").length-1:
                        $h.find('.paged-nav-item').not('[href*="page=-1"]').length;
        if(page<navLen) return proc(page===-1?1:page+1);
    }
    await proc(-1);
    return out;
}

// =========================================
// PLANEJAMENTO (ORIGEM MAIS PRÓXIMA + FALLBACK)
// =========================================
function planAttacks(villages,farms,opts){
    const need={};
    game_data.units.forEach(u=>{
        if(skipUnits.has(u)) return;
        const cb=document.querySelector(`.af_cb_v23[data-u="${u}"]`);
        if(!cb||!cb.checked){need[u]=0;return;}
        const qty=document.querySelector(`.af_qty_v23[data-u="${u}"]`);
        need[u]=Math.max(0,parseInt(qty.value||"0",10)||0);
    });

    const {maxFields,batch,gapSec}=opts;
    const now=nowSec();
    const usedTargets=new Set(); // impedir duplicação

    const originsEntries=Object.entries(villages)
        .map(([coord,obj])=>({coord,id:obj.id,units:obj.units,xy:toCoordObj(coord)}));

    const farmList=Object.entries(farms)
        .map(([coord,obj])=>({coord,id:obj.id,xy:toCoordObj(coord)}));

    // ordenar farmList por distância mínima possível (ajuda fallback)
    farmList.forEach(f=>{
        let best=Infinity;
        originsEntries.forEach(o=>{
            const d=dist(o.xy,f.xy);
            if(d<best) best=d;
        });
        f.closest=best;
    });
    farmList.sort((a,b)=>a.closest-b.closest);

    const result=[];

    for(const f of farmList){
        if(usedTargets.has(f.id)) continue;

        let chosen=null;
        let chosenDist=Infinity;

        for(const o of originsEntries){
            const distance=dist(o.xy,f.xy);
            if(distance>maxFields) continue;

            let ok=true;
            let idx=0;
            for(let i=0;i<game_data.units.length;i++){
                const u=game_data.units[i];
                if(skipUnits.has(u)) continue;
                const have=o.units[idx++]||0;
                if(need[u]>0 && have<need[u]){ok=false;break;}
            }
            if(!ok) continue;

            const last=lastSent[o.id+":"+f.id]||0;
            if(last && (now-last)<gapSec) continue;

            if(distance<chosenDist){
                chosen={o,f,distance};
                chosenDist=distance;
            }
        }

        if(chosen){
            usedTargets.add(chosen.f.id);
            result.push({
                originId:chosen.o.id,
                originCoord:chosen.o.coord,
                targetId:chosen.f.id,
                targetCoord:chosen.f.coord,
                distance:chosen.distance
            });
        }
    }

    // limitar por origem (batch)
    const grouped={};
    result.forEach(r=>{
        (grouped[r.originId]=grouped[r.originId]||[]).push(r);
    });

    const final=[];
    Object.values(grouped).forEach(list=>{
        final.push(...list.slice(0,batch));
    });

    return final;
}

// =========================================
// RENDERIZAÇÃO ESTILO FARMGOD
// =========================================
function clearPlan(){ $("#"+PLAN_ID).remove(); }

function renderPlan(plan){
    clearPlan();
    if(!plan.length) return;

    const wrap=$(`
      <div id="${PLAN_ID}" class="vis" style="margin:8px 0;">
        <h4>FarmGod</h4>
        <div id="AF_bar_v23" class="progress-bar live-progress-bar progress-bar-alive" 
             style="width:98%;margin:5px auto;">
             <div style="background: rgb(146,194,0);"></div>
             <span class="label"></span>
        </div>
        <table class="vis" width="100%">
          <thead>
            <tr>
              <th style="text-align:center;">Origem</th>
              <th style="text-align:center;">Alvo</th>
              <th style="text-align:center;">Dist</th>
              <th style="text-align:center;">Enviar</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    `);

    const body=wrap.find("tbody");
    const groups={};
    plan.forEach(r=>{
        (groups[r.originId]=groups[r.originId]||[]).push(r);
    });

    Object.values(groups).forEach(list=>{
        const o=list[0];
        body.append(`
          <tr>
            <td colspan="4" style="background:#e7d098;">
              <b>${o.originCoord}</b>
            </td>
          </tr>
        `);
        list.forEach(r=>{
            body.append(`
              <tr class="af_row_v23" data-o="${r.originId}" data-t="${r.targetId}">
                <td style="text-align:center;">
                  <a href="${game_data.link_base_pure}info_village&id=${r.originId}">
                    ${r.originCoord}
                  </a>
                </td>
                <td style="text-align:center;">
                  <a href="${game_data.link_base_pure}info_village&id=${r.targetId}">
                    ${r.targetCoord}
                  </a>
                </td>
                <td style="text-align:center;">${r.distance.toFixed(2)}</td>
                <td style="text-align:center;">
                  <span class="farm_icon farm_icon_a"></span>
                </td>
              </tr>
            `);
        });
    });

    $("#am_widget_Farm").first().before(wrap);

    if(window.UI && UI.InitProgressBars){
        UI.InitProgressBars();
        $("#AF_bar_v23").data("current",0).data("max",plan.length);
        UI.updateProgressBar($("#AF_bar_v23"),0,plan.length);
    }
}

function updateBar(){
    const pb=$("#AF_bar_v23");
    if(!pb.length||!window.UI||!UI.updateProgressBar)return;
    const cur=pb.data("current")+1;
    const max=pb.data("max");
    pb.data("current",cur);
    UI.updateProgressBar(pb,cur,max);
}

// =========================================
// ENVIO
// =========================================
function sendTemplateA(targetId,originId){
    return new Promise((ok,err)=>{
        try{
            const url=Accountmanager.send_units_link.replace(/village=\d+/,"village="+originId);
            const data={target:targetId,template_id:getTemplateAId(),source:originId};
            TribalWars.post(url,null,data,r=>ok(r),e=>err(e||"Falhou"));
        }catch(e){err(e);}
    });
}

// =========================================
// CICLO
// =========================================
let running=false;
let timer=null;

async function tick(){
    try{
        if(!running) return;

        status("salvando template...");
        await saveTemplateA();

        status("lendo aldeias...");
        const group=q("#af_group").value;
        const villages=await fetchVillages(group);

        status("lendo farms...");
        const farms=await fetchFarms();

        status("planejando...");
        const opts={
            maxFields:Number(q("#af_fields_v23").value||25),
            batch:Number(q("#af_batch_v23").value||10),
            gapSec:Number(q("#af_gap_v23").value||15)*60
        };

        const plan=planAttacks(villages,farms,opts);
        info(`${plan.length} ataques planejados`);
        renderPlan(plan);

        const now=nowSec();
        for(const job of plan){
            if(!running) break;
            status(`Atacando ${job.originCoord} → ${job.targetCoord}`);
            try{
                await sendTemplateA(job.targetId,job.originId);
                lastSent[job.originId+":"+job.targetId]=now;
                saveLast(lastSent);

                $(`#${PLAN_ID} tr.af_row_v23[data-o="${job.originId}"][data-t="${job.targetId}"]`).remove();
                updateBar();

                if(window.UI&&UI.SuccessMessage)
                    UI.SuccessMessage(`OK ${job.originCoord} → ${job.targetCoord}`);

                await sleep(320+Math.random()*200);
            }catch(e){
                if(window.UI&&UI.ErrorMessage) UI.ErrorMessage("Falha no envio");
            }
        }

        status("concluído");
    }catch(e){
        console.error(e);
        status("erro");
    }
}

async function start(){
    if(running) return;
    running=true;
    q("#af_start_v23").disabled=true;
    q("#af_stop_v23").disabled=false;
    status("iniciando...");
    clearPlan();
    const mins=Math.max(0.1,parseFloat(q("#af_interval_v23").value||3));
    await tick();
    timer=setInterval(tick,mins*60*1000);
}

function stop(){
    running=false;
    if(timer) clearInterval(timer);
    q("#af_start_v23").disabled=false;
    q("#af_stop_v23").disabled=true;
    status("parado");
}

// listeners
(async function(){
    const p=await buildPanel();
    q("#af_start_v23").onclick=start;
    q("#af_stop_v23").onclick=stop;
    window.AutoFarm={start,stop,__loaded:true};
})();
})();
