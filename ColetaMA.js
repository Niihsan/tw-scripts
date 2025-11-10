/* =========================================================
   ColetaMA.js – Mass Scavenge + Modo Automático estável
   - Manual: igual ao original (Calculate → “Launch group …”).
   - Automático: envia direto via API, sem UI de launch.
   - Loop só inicia DEPOIS do “Calculate runtimes for each page”.
   - Jitter com failsafe e saneamento (evita 554h e afins).
   ========================================================= */
(function(){
  "use strict";

  /* =============== CONFIG E CHAVES DE STORAGE =============== */
  var AUTO_DEFAULTS = { ENABLED:false, BASE_MIN:10, JITTER_MIN:2, JITTER_MAX:5, GROUP_DELAY_MS:400 };
  var LS = {
    enabled:'autoScav_loop_enabled',
    base:'autoScav_base_min',
    jmin:'autoScav_jitter_min',
    jmax:'autoScav_jitter_max',
    gdelay:'autoScav_group_delay'
  };
  function lsNum(k, d){ var v=localStorage.getItem(k); if(v==null) return d; v=Number(v); return Number.isFinite(v)?v:d; }
  function lsBool(k,d){ var v=localStorage.getItem(k); if(v==null) return d; return v==='1'||v===true||v==='true'; }
  function lsSet(k,v){ localStorage.setItem(k,String(v)); }

  /* =============== ESTADOS =============== */
  var _state = { hasCalculated:false };
  var _auto  = { timer:null, ticker:null, sending:false, loading:false, lastFetchAt:0, nextAt:0 };
  const FETCH_THROTTLE_MS = 15000;

  /* =============== GARANTE TELA CORRETA =============== */
  try{
    if (location.href.indexOf('screen=place&mode=scavenge_mass')<0){
      window.location.assign(game_data.link_base_pure+"place&mode=scavenge_mass");
      return;
    }
  }catch(e){}

  $("#massScavengeSophie, #autoScavAddOn").remove();

  /* =============== HORA SERVIDOR (UI original) =============== */
  var serverTimeTemp = $("#serverDate")[0].innerText + " " + $("#serverTime")[0].innerText;
  var serverTime = serverTimeTemp.match(/^([0][1-9]|[12][0-9]|3[01])[\/\-]([0][1-9]|1[012])[\/\-](\d{4})( (0?[0-9]|[1][0-9]|[2][0-3])[:]([0-5][0-9])([:]([0-5][0-9]))?)?$/);
  var serverDate = Date.parse(serverTime[3]+"/"+serverTime[2]+"/"+serverTime[1]+serverTime[4]);
  var is_mobile = !!navigator.userAgent.match(/iphone|android|blackberry/ig);
  if (typeof window.version==='undefined') window.version="new";

  /* =============== PREFERÊNCIAS DO USUÁRIO =============== */
  var troopTypeEnabled = JSON.parse(localStorage.getItem("troopTypeEnabled")||"null");
  if(!troopTypeEnabled){
    troopTypeEnabled={}; (game_data.units||[]).forEach(u=>{ if(!/^(militia|snob|ram|catapult|spy|knight)$/.test(u)) troopTypeEnabled[u]=true; });
    localStorage.setItem("troopTypeEnabled", JSON.stringify(troopTypeEnabled));
  } else {
    var any=false; for (var k in troopTypeEnabled){ if(troopTypeEnabled[k]){any=true;break;} }
    if(!any){ for (var k2 in troopTypeEnabled) troopTypeEnabled[k2]=true; localStorage.setItem("troopTypeEnabled", JSON.stringify(troopTypeEnabled)); }
  }
  var keepHome = JSON.parse(localStorage.getItem("keepHome")||"null") || {spear:0,sword:0,axe:0,archer:0,light:0,marcher:0,heavy:0};
  localStorage.setItem("keepHome", JSON.stringify(keepHome));

  var categoryEnabled = JSON.parse(localStorage.getItem("categoryEnabled")||"null") || [true,true,true,true];
  localStorage.setItem("categoryEnabled", JSON.stringify(categoryEnabled));

  var prioritiseHighCat = JSON.parse(localStorage.getItem("prioritiseHighCat")||"false");
  var timeElement = localStorage.getItem("timeElement")||"Hours";

  var sendOrder = JSON.parse(localStorage.getItem("sendOrder")||"null");
  if(!sendOrder){
    sendOrder=(game_data.units||[]).filter(u=>!/^(militia|snob|ram|catapult|spy|knight)$/.test(u));
    localStorage.setItem("sendOrder", JSON.stringify(sendOrder));
  }

  var runTimes = JSON.parse(localStorage.getItem("runTimes")||'{"off":4,"def":3}');
  if (typeof window.premiumBtnEnabled==='undefined') window.premiumBtnEnabled=false;

  var URLReq = (game_data.player&&game_data.player.sitter>0)
    ? `game.php?t=${game_data.player.id}&screen=place&mode=scavenge_mass`
    : `game.php?&screen=place&mode=scavenge_mass`;

  var URLReqBase = URLReq;

  /* =============== DADOS MUNDO =============== */
  var scScript = $.find('script:contains("ScavengeMassScreen")')[0];
  var categoryNames = JSON.parse("[" + scScript.innerHTML.match(/\{.*\:\{.*\:.*\}\}/g) + "]")[0];
  var duration_factor=0, duration_exponent=0, duration_initial_seconds=0;

  /* =============== CSS básico =============== */
  var backgroundColor="#36393f", borderColor="#3e4147", headerColor="#202225", titleColor="#ffffdf";
  $("#contentContainer,#mobileHeader").eq(0).prepend(`
    <style>
      .btnSophie{background-image:linear-gradient(#6e7178 0%, #36393f 30%, #202225 80%, black 100%);}
      .btnSophie:hover{background-image:linear-gradient(#7b7e85 0%, #40444a 30%, #393c40 80%, #171717 100%);}
      #autoScavAddOn{position:fixed;z-index:9999;right:12px;top:12px;background:#202225;color:#fff;border:1px solid #3e4147;padding:8px 10px;border-radius:8px;min-width:260px;}
      #autoScavAddOn .btn{padding:4px 8px;margin:2px;}
    </style>
  `);

  /* =============== UTILS =============== */
  $.getAll = function(urls,onLoad,onDone,onError){
    var i=0,last=0,gap=200;
    (function next(){
      if(i>=urls.length){ onDone(); return; }
      var now=Date.now(), dt=now-last;
      if(dt<gap){ setTimeout(next, gap-dt); return; }
      last=now;
      $.get(urls[i]).done(function(data){
        try{ onLoad(i,data); i++; next(); }catch(e){ onError(e); }
      }).fail(onError);
    })();
  };
  function zp(v){return v>=10?v:("0"+v);}
  function fancy(sec){
    if(sec<0) return "Time is in the past!";
    var h=~~(sec/3600), m=~~((sec%3600)/60), s=~~sec%60;
    return "Max duration: "+(h>0?h:0)+":"+zp(m)+":"+zp(s);
  }
  function timeField(hr){ var d=Date.parse(new Date(serverDate))+hr*3600e3; d=new Date(d); return zp(d.getHours())+":"+zp(d.getMinutes()); }
  function dayField(hr){  var d=Date.parse(new Date(serverDate))+hr*3600e3; d=new Date(d); return d.getFullYear()+"-"+zp(d.getMonth()+1)+"-"+zp(d.getDate()); }
  function hasUnits(obj){ for(var k in obj){ if(Number(obj[k])>0) return true; } return false; }

  /* =============== UI PRINCIPAL (manual) =============== */
  function buildBaseUI(){
    var html=`
<div id="massScavengeSophie" class="ui-widget-content" style="width:600px;background-color:${backgroundColor};cursor:move;z-index:50;">
  <button class="btn" id="x" onclick="$('#massScavengeSophie').remove()">X</button>
  <table class="vis" border="1" style="width:100%;background-color:${backgroundColor};border-color:${borderColor}">
    <tr><td colspan="10" style="text-align:center;background-color:${headerColor}">
      <h3><center style="margin:10px"><u><font color="${titleColor}">Mass scavenging</font></u></center></h3>
    </td></tr>
    <tr><td style="text-align:center;background-color:${headerColor}" colspan="15">
      <h3><center style="margin:10px"><u><font color="${titleColor}">Select unit types/ORDER to scavenge with (drag units to order)</font></u></center></h3>
    </td></tr>
    <tr id="imgRow"></tr>
  </table>
  <hr>
  <table class="vis" border="1" style="width:100%;background-color:${backgroundColor};border-color:${borderColor}">
    <tbody>
      <tr><td style="text-align:center;background-color:${headerColor}" colspan="4">
        <h3><center style="margin:10px"><u><font color="${titleColor}">Select categories to use</font></u></center></h3>
      </td></tr>
      <tr id="categories" style="text-align:center;background-color:${headerColor}">
        <td style="padding:10px;"><font color="${titleColor}">${categoryNames[1].name}</font></td>
        <td style="padding:10px;"><font color="${titleColor}">${categoryNames[2].name}</font></td>
        <td style="padding:10px;"><font color="${titleColor}">${categoryNames[3].name}</font></td>
        <td style="padding:10px;"><font color="${titleColor}">${categoryNames[4].name}</font></td>
      </tr>
      <tr>
        <td style="text-align:center;background-color:${backgroundColor}"><input type="checkbox" id="category1"></td>
        <td style="text-align:center;background-color:${backgroundColor}"><input type="checkbox" id="category2"></td>
        <td style="text-align:center;background-color:${backgroundColor}"><input type="checkbox" id="category3"></td>
        <td style="text-align:center;background-color:${backgroundColor}"><input type="checkbox" id="category4"></td>
      </tr>
    </tbody>
  </table>
  <hr>
  <table class="vis" border="1" style="width:100%;background-color:${backgroundColor};border-color:${borderColor}">
    <tr><td colspan="3" style="text-align:center;background-color:${headerColor}">
      <center style="margin:10px"><font color="${titleColor}">When do you want your scav runs to return (approximately)?</font></center>
    </td></tr>
    <tr id="runtimes" style="text-align:center;background-color:${headerColor}">
      <td></td>
      <td style="padding:10px;"><font color="${titleColor}">Off villages</font></td>
      <td style="padding:10px;"><font color="${titleColor}">Def villages</font></td>
    </tr>
    <tr>
      <td style="width:22px;background-color:${backgroundColor};padding:5px;"><input type="radio" id="timeSelectorDate" name="timeSelector"></td>
      <td style="text-align:center;background-color:${backgroundColor};padding:5px;"><input type="date" id="offDay" value="${dayField(runTimes.off)}"><input type="time" id="offTime" value="${timeField(runTimes.off)}"></td>
      <td style="text-align:center;background-color:${backgroundColor};padding:5px;"><input type="date" id="defDay" value="${dayField(runTimes.def)}"><input type="time" id="defTime" value="${timeField(runTimes.def)}"></td>
    </tr>
    <tr>
      <td style="width:22px;background-color:${backgroundColor};padding:5px;"><input type="radio" id="timeSelectorHours" name="timeSelector"></td>
      <td style="text-align:center;background-color:${backgroundColor};padding:5px;"><input type="text" class="runTime_off" style="background-color:${backgroundColor};color:${titleColor};" value="${runTimes.off}" onclick="this.select();"></td>
      <td style="text-align:center;background-color:${backgroundColor};padding:5px;"><input type="text" class="runTime_def" style="background-color:${backgroundColor};color:${titleColor};" value="${runTimes.def}" onclick="this.select();"></td>
    </tr>
    <tr>
      <td></td>
      <td style="text-align:center;background-color:${backgroundColor};padding:5px;"><font color="${titleColor}"><span id="offDisplay"></span></font></td>
      <td style="text-align:center;background-color:${backgroundColor};padding:5px;"><font color="${titleColor}"><span id="defDisplay"></span></font></td>
    </tr>
  </table>
  <hr>
  <table class="vis" border="1" style="width:100%;background-color:${backgroundColor};border-color:${borderColor}">
    <tr><td colspan="2" style="text-align:center;background-color:${headerColor}">
      <center style="margin:10px"><font color="${titleColor}">Which setting?</font></center>
    </td></tr>
    <tr>
      <td style="text-align:center;background-color:${headerColor};padding:5px;"><font color="${titleColor}">Balanced over all categories</font></td>
      <td style="text-align:center;background-color:${headerColor};padding:5px;"><font color="${titleColor}">Priority on filling higher categories</font></td>
    </tr>
    <tr>
      <td style="text-align:center;background-color:${backgroundColor};padding:5px;"><input type="radio" id="settingPriorityBalanced" name="prio"></td>
      <td style="text-align:center;background-color:${backgroundColor};padding:5px;"><input type="radio" id="settingPriorityPriority" name="prio"></td>
    </tr>
  </table>
  <hr>
  <center><input type="button" class="btn btnSophie" id="sendMass" value="Calculate runtimes for each page"></center>
  <hr>
</div>`;
    $(".maincell,#mobileContent").eq(0).prepend(html);
    if(!is_mobile) $("#massScavengeSophie").css("position","fixed").draggable();

    // blocos de unidades
    for(var i=0;i<sendOrder.length;i++){
      $("#imgRow").append(
`<td align="center" style="background-color:${backgroundColor}">
  <table class="vis" border="1" style="width:100%"><tbody>
    <tr><td style="text-align:center;background-color:${headerColor};padding:5px;">
      <img src="https://dsen.innogamescdn.com/asset/cf2959e7/graphic/unit/unit_${sendOrder[i]}.png" title="${sendOrder[i]}">
    </td></tr>
    <tr><td align="center" style="background-color:${backgroundColor};padding:5px;"><input type="checkbox" id="${sendOrder[i]}"></td></tr>
    <tr><td style="text-align:center;background-color:#202225;padding:5px;"><font color="#ffffdf">Backup</font></td></tr>
    <tr><td align="center" style="background-color:${backgroundColor};padding:5px;"><input type="text" id="${sendOrder[i]}Backup" value="${keepHome[sendOrder[i]]||0}" size="5"></td></tr>
  </tbody></table>
</td>`
      );
    }
    $("#imgRow").sortable({axis:"x",revert:100,containment:"parent",forceHelperSize:true,delay:100,scroll:false}).disableSelection();

    (prioritiseHighCat?$("#settingPriorityPriority"):$("#settingPriorityBalanced")).prop("checked",true);
    $("#offDisplay").text(fancy(runTimes.off*3600)); $("#defDisplay").text(fancy(runTimes.def*3600));
    if(timeElement=="Date"){ $("#timeSelectorDate").prop("checked",true); selectType("Date"); updateTimers(); }
    else { $("#timeSelectorHours").prop("checked",true); selectType("Hours"); updateTimers(); }

    $("#offDay,#defDay,#offTime,#defTime").on("input", updateTimers);
    $(".runTime_off,.runTime_def").on("input", updateTimers);
    $("#timeSelectorDate").on("input", function(){ selectType('Date'); updateTimers(); });
    $("#timeSelectorHours").on("input", function(){ selectType('Hours'); updateTimers(); });

    $("#sendMass").on("click", readyToSend);
  }
  function updateTimers(){
    if($("#timeSelectorDate")[0].checked){
      $("#offDisplay").text(fancy((Date.parse($("#offDay").val().replace(/-/g,"/")+" "+$("#offTime").val())-serverDate)/1000));
      $("#defDisplay").text(fancy((Date.parse($("#defDay").val().replace(/-/g,"/")+" "+$("#defTime").val())-serverDate)/1000));
    } else {
      $("#offDisplay").text(fancy($(".runTime_off").val()*3600));
      $("#defDisplay").text(fancy($(".runTime_def").val()*3600));
    }
  }
  function selectType(type){
    if(type==='Hours'){
      if($("#timeSelectorDate")[0].checked){ $("#offDay,#defDay,#offTime,#defTime").prop("disabled",false); $(".runTime_off,.runTime_def").prop("disabled",true); }
      else { $("#offDay,#defDay,#offTime,#defTime").prop("disabled",true); $(".runTime_off,.runTime_def").prop("disabled",false); }
    }else{
      if($("#timeSelectorHours")[0].checked){ $("#offDay,#defDay,#offTime,#defTime").prop("disabled",true); $(".runTime_off,.runTime_def").prop("disabled",false); }
      else { $("#offDay,#defDay,#offTime,#defTime").prop("disabled",false); $(".runTime_off,.runTime_def").prop("disabled",true); }
    }
  }
  function enableCorrectTroopTypes(){
    (game_data.units||[]).forEach(u=>{
      if(!/^(militia|snob|ram|catapult|spy)$/.test(u)){ if(troopTypeEnabled[u]) $(`#${u}`).prop("checked",true); }
    });
    for(var i=0;i<categoryEnabled.length;i++) if(categoryEnabled[i]) $(`#category${i+1}`).prop("checked",true);
  }

  /* =============== “CALCULATE” → GERA GRUPOS =============== */
  var squads={}, squads_premium={}, squad_requests=[], squad_requests_premium=[];
  var totalLoot=0,totalHaul=0,haulCategoryRate={}; var scavengeInfo;

  function readyToSend(){
    if(!$("#settingPriorityPriority")[0].checked && !$("#settingPriorityBalanced")[0].checked){ alert("Choose how to split troops!"); return; }
    if(!$("#category1").is(":checked") && !$("#category2").is(":checked") && !$("#category3").is(":checked") && !$("#category4").is(":checked")){ alert("Choose categories!"); return; }

    // salvar escolhas
    sendOrder.forEach(u=>{ troopTypeEnabled[u]=$(`#${u}`).is(":checked"); keepHome[u]=+($(`#${u}Backup`).val()||0); });
    var enabledCategories=[ $("#category1").is(":checked"), $("#category2").is(":checked"), $("#category3").is(":checked"), $("#category4").is(":checked") ];
    if($("#timeSelectorDate")[0].checked){
      localStorage.setItem("timeElement","Date");
      var off=Date.parse($("#offDay").val().replace(/-/g,"/")+" "+$("#offTime").val());
      var def=Date.parse($("#defDay").val().replace(/-/g,"/")+" "+$("#defTime").val());
      runTimes.off=(off-serverDate)/1000/3600; runTimes.def=(def-serverDate)/1000/3600;
    }else{
      localStorage.setItem("timeElement","Hours");
      runTimes.off=+$('.runTime_off').val(); runTimes.def=+$('.runTime_def').val();
    }
    prioritiseHighCat=!!$("#settingPriorityPriority")[0].checked;
    sendOrder=$("#imgRow :checkbox").map(function(){return this.id;}).get();

    localStorage.setItem("troopTypeEnabled", JSON.stringify(troopTypeEnabled));
    localStorage.setItem("keepHome", JSON.stringify(keepHome));
    localStorage.setItem("categoryEnabled", JSON.stringify(enabledCategories));
    localStorage.setItem("prioritiseHighCat", JSON.stringify(prioritiseHighCat));
    localStorage.setItem("sendOrder", JSON.stringify(sendOrder));
    localStorage.setItem("runTimes", JSON.stringify(runTimes));

    _state.hasCalculated=true; // <<— só a partir daqui o loop pode iniciar
    throttledGetData();
  }

  /* =============== BUSCA DADOS (todas páginas) =============== */
  function throttledGetData(){
    var now=Date.now();
    if(_auto.loading) return;
    if(now-_auto.lastFetchAt<FETCH_THROTTLE_MS){ if(loop.enabled()) loop.schedule(); return; }
    _auto.lastFetchAt=now; getData();
  }
  function getData(){
    if(_auto.loading) return; _auto.loading=true;
    var URLs=[];
    $.get(URLReqBase, function (data) {
      var $d=$(data), last=$d.find(".paged-nav-item").last();
      var amount = last.length? parseInt(last[0].href.match(/page=(\d+)/)[1]) : 0;
      for(var i=0;i<=amount;i++){
        URLs.push(URLReqBase+"&page="+i);
        var temp = JSON.parse($d.find('script:contains("ScavengeMassScreen")').html().match(/\{.*\:\{.*\:.*\}\}/g)[0]);
        duration_exponent=temp[1].duration_exponent; duration_factor=temp[1].duration_factor; duration_initial_seconds=temp[1].duration_initial_seconds;
      }
    }).done(function(){
      var arrayWithData="["; 
      $.getAll(URLs,
        (i,data)=>{ var inside=$(data).find('script:contains("ScavengeMassScreen")').html().match(/\{.*\:\{.*\:.*\}\}/g)[2]; arrayWithData+=inside+","; },
        ()=>{
          arrayWithData=arrayWithData.slice(0,-1)+"]"; scavengeInfo=JSON.parse(arrayWithData);
          squad_requests=[]; squad_requests_premium=[];
          for(var i=0;i<scavengeInfo.length;i++) calculateHaulCategories(scavengeInfo[i]);

          // split por 200
          squads={}; squads_premium={}; var per200=0, group=0; squads[group]=[]; squads_premium[group]=[];
          for(var k=0;k<squad_requests.length;k++){
            if(per200==200){ group++; squads[group]=[]; squads_premium[group]=[]; per200=0; }
            per200++; squads[group].push(squad_requests[k]); squads_premium[group].push(squad_requests_premium[k]);
          }

          _auto.loading=false;

          if(loop.enabled()){
            if(!hasAnyGroup(squads)){ try{UI.InfoMessage("Sem coletas disponíveis. Checarei novamente mais tarde.");}catch(e){} loop.schedule(); return; }
            sendAllGroupsDirect(squads);
            return;
          }
          renderManualLaunchUI(); // manual
        },
        (err)=>{ console.error(err); _auto.loading=false; if(loop.enabled()) loop.schedule(); }
      );
    });
  }
  function hasAnyGroup(map){ var ks=Object.keys(map); if(!ks.length) return false; for(var i=0;i<ks.length;i++){ if(map[ks[i]].length) return true; } return false; }

  /* =============== CÁLCULO POR VILA =============== */
  function calculateHaulCategories(data){
    if(!data.has_rally_point) return;

    var troopsAllowed={}, keep=keepHome;
    for(var k in troopTypeEnabled){
      if(troopTypeEnabled[k]){
        var v=(data.unit_counts_home[k]||0)-(keep[k]||0); troopsAllowed[k]=v>0?v:0;
      }
    }
    var unitType={spear:'def',sword:'def',axe:'off',archer:'def',light:'off',marcher:'off',heavy:'def'};
    var typeCount={off:0,def:0}; for(var p in troopsAllowed){ typeCount[unitType[p]]+=troopsAllowed[p]; }

    var carryRef={spear:25,sword:15,axe:10,archer:10,light:80,marcher:50,heavy:50,knight:100};
    var totalCarry=0; for(var kk in troopsAllowed){ totalCarry+=troopsAllowed[kk]*(data.unit_carry_factor*(carryRef[kk]||0)); }
    if(totalCarry<=0) return;

    var tHrs=(typeCount.off>typeCount.def)?runTimes.off:runTimes.def;
    var haul=parseInt(((tHrs*3600)/duration_factor - duration_initial_seconds)**(1/duration_exponent)/100)**(1/2);

    haulCategoryRate={};
    haulCategoryRate[1]=(data.options[1].is_locked||data.options[1].scavenging_squad)?0: haul/0.1;
    haulCategoryRate[2]=(data.options[2].is_locked||data.options[2].scavenging_squad)?0: haul/0.25;
    haulCategoryRate[3]=(data.options[3].is_locked||data.options[3].scavenging_squad)?0: haul/0.50;
    haulCategoryRate[4]=(data.options[4].is_locked||data.options[4].scavenging_squad)?0: haul/0.75;

    for(var i=0;i<categoryEnabled.length;i++) if(!categoryEnabled[i]) haulCategoryRate[i+1]=0;

    totalLoot=totalCarry;
    totalHaul=(haulCategoryRate[1]||0)+(haulCategoryRate[2]||0)+(haulCategoryRate[3]||0)+(haulCategoryRate[4]||0);

    var unitsReadyForSend = calculateUnitsPerVillage(troopsAllowed, haulCategoryRate, totalLoot, totalHaul);

    for(var k=0;k<4;k++){
      var optIdx=k+1, opt=data.options[optIdx];
      var candidate={ unit_counts: unitsReadyForSend[k]||{}, carry_max: 9999999999 };
      var catEnabled = !!categoryEnabled[k];
      var haulForCat = (haulCategoryRate[optIdx]||0);
      var canUse = opt && opt.is_locked===false && opt.scavenging_squad==null && catEnabled && haulForCat>0 && hasUnits(candidate.unit_counts);
      if(canUse){
        squad_requests.push({ village_id:data.village_id, candidate_squad:candidate, option_id:optIdx, use_premium:false });
        squad_requests_premium.push({ village_id:data.village_id, candidate_squad:candidate, option_id:optIdx, use_premium:true });
      }
    }
  }
  function calculateUnitsPerVillage(troopsAllowed, haulCategoryRate, totalLoot, totalHaul){
    var unitHaul={spear:25,sword:15,axe:10,archer:10,light:80,marcher:50,heavy:50,knight:100};
    var out={0:{},1:{},2:{},3:{}};
    if(totalLoot>totalHaul){
      if(version!="old"){
        for(var j=3;j>=0;j--){
          var reach=haulCategoryRate[j+1]||0;
          sendOrder.forEach(unit=>{
            if(troopsAllowed.hasOwnProperty(unit)&&reach>0){
              var need=Math.floor(reach/(unitHaul[unit]||1));
              if(need>troopsAllowed[unit]){ out[j][unit]=troopsAllowed[unit]; reach-=troopsAllowed[unit]*(unitHaul[unit]||0); troopsAllowed[unit]=0; }
              else { out[j][unit]=need; reach=0; troopsAllowed[unit]-=need; }
            }
          });
        }
      }else{
        for(var j=0;j<4;j++){ for(var key in troopsAllowed){ out[j][key]=Math.floor((haulCategoryRate[j+1]*(troopsAllowed[key]/totalLoot))); } }
      }
    }else{
      var troopN=0; for(var key in troopsAllowed) troopN+=troopsAllowed[key];
      if(!prioritiseHighCat && troopN>130){
        for(var j=0;j<4;j++){ for(var key in troopsAllowed){ out[j][key]=Math.floor((totalLoot/totalHaul*(haulCategoryRate[j+1]||0))*(troopsAllowed[key]/totalLoot)); } }
      }else{
        for(var j=3;j>=0;j--){
          var reach=haulCategoryRate[j+1]||0;
          sendOrder.forEach(unit=>{
            if(troopsAllowed.hasOwnProperty(unit)&&reach>0){
              var need=Math.floor(reach/(unitHaul[unit]||1));
              if(need>troopsAllowed[unit]){ out[j][unit]=troopsAllowed[unit]; reach-=troopsAllowed[unit]*(unitHaul[unit]||0); troopsAllowed[unit]=0; }
              else { out[j][unit]=need; reach=0; troopsAllowed[unit]-=need; }
            }
          });
        }
      }
    }
    return out;
  }

  /* =============== ENVIO DIRETO (AUTO) =============== */
  function sendAllGroupsDirect(groupMap){
    if(_auto.sending) return; _auto.sending=true;
    var keys=Object.keys(groupMap).sort((a,b)=>Number(a)-Number(b)), idx=0;
    function step(){
      if(idx>=keys.length){ _auto.sending=false; try{UI.SuccessMessage("Coletas enviadas (auto).");}catch(e){} loop.schedule(); return; }
      var arr=groupMap[keys[idx]]||[]; if(!arr.length){ idx++; step(); return; }
      TribalWars.post('scavenge_api',{ajaxaction:'send_squads'},{squad_requests:arr}, function(){try{UI.SuccessMessage("Grupo (auto) enviado.");}catch(e){}}, !1);
      idx++; setTimeout(step, loop.getGroupDelay());
    }
    step();
  }

  /* =============== UI “Launch group …” (manual) =============== */
  function renderManualLaunchUI(){
    $("#massScavengeFinal").remove();
    var html=`<div id="massScavengeFinal" class="ui-widget-content" style="position:fixed;background-color:${backgroundColor};cursor:move;z-index:50;">
      <button class="btn" id="x" onclick="$('#massScavengeFinal').remove()">X</button>
      <table class="vis" border="1" style="width:100%;background-color:${backgroundColor};border-color:${borderColor}">
        <tr><td colspan="10" style="text-align:center;background-color:${headerColor}">
          <h3><center style="margin:10px"><u><font color="${titleColor}">Mass scavenging: send per 50 villages</font></u></center></h3>
        </td></tr>`;
    for(var s=0;s<Object.keys(squads).length;s++){
      html+=`<tr id="sendRow${s}" style="text-align:center;background-color:${backgroundColor}">
        <td><center><input type="button" class="btn btnSophie" onclick="sendGroup(${s},false)" value="Launch group ${s+1}"></center></td>
        <td><center><input type="button" class="btn btn-pp btn-send-premium" onclick="sendGroup(${s},true)" value="Launch group ${s+1} WITH PREMIUM" style="display:${premiumBtnEnabled?'':'none'}"></center></td>
      </tr>`;
    }
    html+=`</table></div>`;
    $(".maincell,#mobileContent").eq(0).prepend(html);
    if(!is_mobile) $("#massScavengeFinal").draggable();
  }
  function sendGroup(groupNr, usePremium){
    var temp=(usePremium?squads_premium[groupNr]:squads[groupNr])||[];
    if(!temp.length){ $("#sendRow"+groupNr).remove(); return; }
    $(':button[id^="sendMass"],:button[id^="sendMassPremium"]').prop('disabled',true);
    TribalWars.post('scavenge_api',{ajaxaction:'send_squads'},{squad_requests:temp}, function(){try{UI.SuccessMessage("Group sent successfully");}catch(e){}}, !1);
    setTimeout(function(){ $(`#sendRow${groupNr}`).remove(); $(':button[id^="sendMass"],:button[id^="sendMassPremium"]').prop('disabled',false); },200);
  }
  window.sendGroup=sendGroup;

  /* =============== LOOP / SCHEDULER (com FAILSAFE) =============== */
  var loop=(function(){
    // saneamento de prefs antigas/corrompidas
    (function sanitize(){
      var b=lsNum(LS.base, AUTO_DEFAULTS.BASE_MIN);
      var a=lsNum(LS.jmin, AUTO_DEFAULTS.JITTER_MIN);
      var c=lsNum(LS.jmax, AUTO_DEFAULTS.JITTER_MAX);
      if(!Number.isFinite(b)||b<1) lsSet(LS.base, AUTO_DEFAULTS.BASE_MIN);
      if(!Number.isFinite(a)||a<0) lsSet(LS.jmin, AUTO_DEFAULTS.JITTER_MIN);
      if(!Number.isFinite(c)||c<a) lsSet(LS.jmax, Math.max(AUTO_DEFAULTS.JITTER_MIN, AUTO_DEFAULTS.JITTER_MAX));
    })();

    var enabled = lsBool(LS.enabled, AUTO_DEFAULTS.ENABLED);
    var baseMin = lsNum(LS.base, AUTO_DEFAULTS.BASE_MIN);
    var jMin    = lsNum(LS.jmin, AUTO_DEFAULTS.JITTER_MIN);
    var jMax    = lsNum(LS.jmax, AUTO_DEFAULTS.JITTER_MAX);
    var gDelay  = lsNum(LS.gdelay, AUTO_DEFAULTS.GROUP_DELAY_MS);

    function nextDelayMs(){
      // base e jitter sempre em MINUTOS
      var base = Math.max(1, baseMin)*60000;
      var a = Math.max(0, jMin)*60000;
      var b = Math.max(a, jMax)*60000;

      // FAILSAFE: máximo de 12h de jitter total
      var MAX_JITTER_MS = 12*60*60000;
      if (!Number.isFinite(a) || !Number.isFinite(b) || (b - a) > MAX_JITTER_MS || b>MAX_JITTER_MS){
        a = AUTO_DEFAULTS.JITTER_MIN*60000;
        b = AUTO_DEFAULTS.JITTER_MAX*60000;
      }

      var jitter = Math.floor(Math.random()*(b-a+1))+a;
      return base + jitter;
    }

    function updateCountdown(){
      var el=$("#nextRun"); if(!el.length) return;
      if(!_auto.nextAt){ el.text("-"); return; }
      var ms=_auto.nextAt - Date.now();
      if(ms<=0){ el.text("agora"); return; }
      var t=~~(ms/1000), hh=~~(t/3600), mm=~~((t%3600)/60), ss=t%60;
      var pad=n=>(n<10?"0"+n:""+n);
      el.text(hh>0? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`);
    }
    function startTicker(){ if(_auto.ticker) return; _auto.ticker=setInterval(updateCountdown,1000); updateCountdown(); }
    function stopTicker(){ if(_auto.ticker){ clearInterval(_auto.ticker); _auto.ticker=null; } }

    function schedule(){
      if(!enabled){ clearTimeout(_auto.timer); _auto.timer=null; _auto.nextAt=0; stopTicker(); try{$("#nextRun").text("-");}catch(e){} return; }
      if(_auto.timer){ startTicker(); return; }
      var ms=nextDelayMs(); _auto.nextAt=Date.now()+ms; _auto.timer=setTimeout(runNow, ms); startTicker();
    }
    function runNow(){
      clearTimeout(_auto.timer); _auto.timer=null;
      if(enabled) throttledGetData(); else throttledGetData(); // permite “Rodar agora”
    }
    function start(){
      if(!_state.hasCalculated){ alert('Antes de iniciar o loop, clique em "Calculate runtimes for each page".'); return; }
      enabled=true; lsSet(LS.enabled,1); refreshPanel(); schedule(); try{UI.SuccessMessage("Loop iniciado.");}catch(e){}
    }
    function stop(){ enabled=false; lsSet(LS.enabled,0); clearTimeout(_auto.timer); _auto.timer=null; _auto.nextAt=0; stopTicker(); refreshPanel(); try{UI.SuccessMessage("Loop parado.");}catch(e){} }
    function setBase(v){ baseMin=v; lsSet(LS.base,v); refreshPanel(); schedule(); }
    function setJitter(a,b){ jMin=a; jMax=b; lsSet(LS.jmin,a); lsSet(LS.jmax,b); refreshPanel(); schedule(); }
    function setGDelay(ms){ gDelay=ms; lsSet(LS.gdelay,ms); refreshPanel(); }

    function refreshPanel(){
      try{
        $("#loopState").text(enabled?"ON":"OFF");
        $("#baseVal").text(baseMin);
        $("#jitterVal").text(`${jMin}..${jMax}`);
        $("#delayVal").text(gDelay);
        $("#btnToggleLoop").text(enabled?"Parar loop":"Iniciar loop");
      }catch(e){}
    }

    // painel flutuante
    $("#autoScavAddOn").remove();
    var panel=$(`
<div id="autoScavAddOn" class="ui-widget-content">
  <div style="font-weight:600;margin-bottom:6px;">Auto Coleta em Massa</div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
    <button id="btnToggleLoop" class="btn"></button>
    <button id="btnRunNow" class="btn">Rodar agora</button>
  </div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
    <button id="btnSetBase" class="btn">Intervalo base (min)</button>
    <button id="btnSetJitter" class="btn">Atraso aleatório (min..máx)</button>
  </div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
    <button id="btnSetGroupDelay" class="btn">Delay entre grupos (ms)</button>
  </div>
  <div id="autoScavStatus" style="font-size:12px;opacity:.9;line-height:1.35;">
    <div>Loop: <b id="loopState"></b></div>
    <div>Base: <b id="baseVal"></b> min | Rand: <b id="jitterVal"></b> min</div>
    <div>Delay grupos: <b id="delayVal"></b> ms</div>
    <div>Próxima execução: <b id="nextRun">-</b></div>
  </div>
</div>`);
    $("body").append(panel); try{$("#autoScavAddOn").draggable();}catch(e){}
    $("#btnToggleLoop").on("click", ()=> enabled?stop():start());
    $("#btnRunNow").on("click", runNow);
    $("#btnSetBase").on("click", function(){
      var v=prompt("Intervalo base entre checagens (minutos):", baseMin); if(v===null) return;
      var n=Number(v); if(!Number.isFinite(n)||n<1){ alert("Valor inválido (>=1)."); return; } setBase(Math.floor(n));
    });
    $("#btnSetJitter").on("click", function(){
      var v=prompt("Atraso aleatório adicional (min..máx), ex: 2-5", `${jMin}-${jMax}`); if(v===null) return;
      var m=String(v).replace(/\s+/g,'').match(/^(\d+)\-(\d+)$/); if(!m){ alert("Formato inválido. Use min-max (ex: 2-5)"); return; }
      var a=Number(m[1]), b=Number(m[2]); if(!Number.isFinite(a)||!Number.isFinite(b)){ alert("Números inválidos."); return; }
      if(b<a){ var t=a;a=b;b=t; }
      // failsafe: limitar jitter individual a 12h
      if(b>720) b=720; setJitter(Math.floor(a), Math.floor(b));
    });
    $("#btnSetGroupDelay").on("click", function(){
      var v=prompt("Delay entre envio de grupos (ms):", gDelay); if(v===null) return;
      var n=Number(v); if(!Number.isFinite(n)||n<100){ alert("Use número >= 100 ms."); return; } setGDelay(Math.floor(n));
    });

    refreshPanel();
    if(!enabled) try{$("#nextRun").text("-");}catch(e){}
    return { enabled:()=>enabled, schedule, runNow, getGroupDelay:()=>gDelay };
  })();

  /* =============== INICIALIZAÇÃO =============== */
  function build(){
    buildBaseUI(); enableCorrectTroopTypes();
  }
  build();

})();
