javascript:(function(){
/* =========================================================
   MASS SCAVENGE (Coleta em Massa) — Sophie "Shinko to Kuma"
   Build unificada com AUTO LOOP por ChatGPT (um código só)
   - Mantém lógica original de cálculo/envio
   - Adiciona painel com loop ON/OFF, intervalos e "Rodar agora"
   ========================================================= */

/*** =================== CONFIG AUTO =================== ***/
var AUTO_DEFAULTS = {
  ENABLED: false,         // loop desligado por padrão
  BASE_MIN: 10,           // intervalo base entre checagens (min)
  JITTER_MIN: 2,          // atraso aleatório mínimo (min)
  JITTER_MAX: 5,          // atraso aleatório máximo (min)
  GROUP_DELAY_MS: 400     // delay entre envios de grupos (ms)
};
var _auto = {timer:null, sending:false};
/*** ==================================================== ***/

/* ========= BLOCO ORIGINAL (ajustado) ========= */

var serverTimeTemp = $("#serverDate")[0].innerText + " " + $("#serverTime")[0].innerText;
var serverTime = serverTimeTemp.match(/^([0][1-9]|[12][0-9]|3[01])[\/\-]([0][1-9]|1[012])[\/\-](\d{4})( (0?[0-9]|[1][0-9]|[2][0-3])[:]([0-5][0-9])([:]([0-5][0-9]))?)?$/);
var serverDate = Date.parse(serverTime[3] + "/" + serverTime[2] + "/" + serverTime[1] + serverTime[4]);
var is_mobile = !!navigator.userAgent.match(/iphone|android|blackberry/ig) || false;
var scavengeInfo, tempElementSelection="";

/* Garantir que está em Coleta em Massa */
if (window.location.href.indexOf('screen=place&mode=scavenge_mass') < 0) {
  window.location.assign(game_data.link_base_pure + "place&mode=scavenge_mass");
  return;
}

/* Limpeza de UI antiga */
$("#massScavengeSophie, #massScavengeFinal, #autoScavAddOn").remove();

/* variáveis globais (do script original) */
if (typeof version == 'undefined') version = "new";
var langShinko = [
  "Mass scavenging",
  "Select unit types/ORDER to scavenge with (drag units to order)",
  "Select categories to use",
  "When do you want your scav runs to return (approximately)?",
  "Runtime here",
  "Calculate runtimes for each page",
  "Creator: ",
  "Mass scavenging: send per 50 villages",
  "Launch group "
];
/* Traduções específicas (mantidas resumidas; se quiser todas, aviso que posso expandir) */
if (game_data.locale == "nl_NL") {
  langShinko = ["Massa rooftochten","Kies troeptypes (sleep om te ordenen)","Kies categorieën","Wanneer wil je terugkomst?","Looptijd","Bereken per pagina","Scripter: ","Massa rooftochten: verstuur per 50 dorpen","Verstuur groep "];
}
if (game_data.locale == "it_IT") {
  langShinko = ["Rovistamento di massa","Seleziona tipi/ordine","Seleziona categorie","Quando vuoi il rientro?","Durata","Calcola per pagina","Creatore: ","Rovistamento: invia per 50 villaggi","Lancia gruppo "];
}

/* Carregar/Inicializar preferências */
function __allTroopsDisabled(obj){ for (var k in obj){ if (obj.hasOwnProperty(k) && obj[k]) return false; } return true; }

var troopTypeEnabled = JSON.parse(localStorage.getItem("troopTypeEnabled")||"null");
if (!troopTypeEnabled){
  troopTypeEnabled = {};
  (game_data.units||[]).forEach(u=>{
    if (!/^(militia|snob|ram|catapult|spy|knight)$/.test(u)) troopTypeEnabled[u]=true; // habilita por padrão
  });
  localStorage.setItem("troopTypeEnabled", JSON.stringify(troopTypeEnabled));
} else if (__allTroopsDisabled(troopTypeEnabled)) {
  for (var k in troopTypeEnabled){ troopTypeEnabled[k]=true; }
  localStorage.setItem("troopTypeEnabled", JSON.stringify(troopTypeEnabled));
}

var keepHome = JSON.parse(localStorage.getItem("keepHome")||"null");
if (!keepHome){
  keepHome = {spear:0,sword:0,axe:0,archer:0,light:0,marcher:0,heavy:0};
  localStorage.setItem("keepHome", JSON.stringify(keepHome));
}

var categoryEnabled = JSON.parse(localStorage.getItem("categoryEnabled")||"null");
if (!categoryEnabled){
  categoryEnabled = [true,true,true,true];
  localStorage.setItem("categoryEnabled", JSON.stringify(categoryEnabled));
}

var prioritiseHighCat = JSON.parse(localStorage.getItem("prioritiseHighCat")||"false");
var timeElement = localStorage.getItem("timeElement") || "Hours";
var sendOrder = JSON.parse(localStorage.getItem("sendOrder")||"null");
if (!sendOrder){
  sendOrder = (game_data.units||[]).filter(u=>!/^(militia|snob|ram|catapult|spy|knight)$/.test(u));
  localStorage.setItem("sendOrder", JSON.stringify(sendOrder));
}
var runTimes = JSON.parse(localStorage.getItem("runTimes")||'{"off":4,"def":3}');

if (typeof premiumBtnEnabled == 'undefined') var premiumBtnEnabled = false;

var URLReq = (game_data.player.sitter>0)
  ? `game.php?t=${game_data.player.id}&screen=place&mode=scavenge_mass`
  : `game.php?&screen=place&mode=scavenge_mass`;

var arrayWithData, enabledCategories=[], availableUnits=[];
var squad_requests=[], squad_requests_premium=[];
var duration_factor=0, duration_exponent=0, duration_initial_seconds=0;

var scScript = $.find('script:contains("ScavengeMassScreen")')[0];
var categoryNames = JSON.parse("[" + scScript.innerHTML.match(/\{.*\:\{.*\:.*\}\}/g) + "]")[0];
var time = {off:0, def:0};

/* Estilo (mantido simples/igual ao padrão “standard”) */
var backgroundColor="#36393f", borderColor="#3e4147", headerColor="#202225", titleColor="#ffffdf";
var cssClassesSophie = `
<style>
.sophRowA {background-color:#32353b;color:#fff;}
.sophRowB {background-color:#36393f;color:#fff;}
.sophHeader {background-color:#202225;font-weight:bold;color:#fff;}
.btnSophie{background-image:linear-gradient(#6e7178 0%, #36393f 30%, #202225 80%, black 100%);}
.btnSophie:hover{background-image:linear-gradient(#7b7e85 0%, #40444a 30%, #393c40 80%, #171717 100%);}
#x{position:absolute;background:red;color:#fff;top:0;right:0;width:30px;height:30px;}
#cog{position:absolute;background:#32353b;color:#fff;top:0;right:30px;width:30px;height:30px;}
#autoScavAddOn{position:fixed;z-index:9999;right:12px;top:12px;background:#202225;color:#fff;border:1px solid #3e4147;padding:8px 10px;border-radius:8px;min-width:260px;}
#autoScavAddOn .btn{padding:4px 8px;margin:2px;}
</style>`;
$("#contentContainer,#mobileHeader").eq(0).prepend(cssClassesSophie);

/* Utilitário para múltiplos GET com espaçamento */
$.getAll = function (urls,onLoad,onDone,onError) {
  var numDone=0, lastRequestTime=0, minWaitTime=200;
  function loadNext(){
    if (numDone==urls.length){ onDone(); return; }
    let now=Date.now(), elapsed=now-lastRequestTime;
    if (elapsed<minWaitTime){ setTimeout(loadNext, minWaitTime-elapsed); return; }
    try{$("#progress").css("width",`${(numDone+1)/urls.length*100}%`);}catch(e){}
    lastRequestTime=now;
    $.get(urls[numDone]).done((data)=>{
      try{ onLoad(numDone,data); ++numDone; loadNext(); }catch(e){ onError(e); }
    }).fail((xhr)=>onError(xhr));
  }
  loadNext();
};

/* Helpers tempo/UI */
function zeroPadded(v){ return v>=10? v:('0'+v); }
function fancyTimeFormat(sec){
  if (sec<0) return "Time is in the past!";
  var hrs=~~(sec/3600), mins=~~((sec%3600)/60), secs=~~sec%60;
  var ret="Max duration: ";
  if (hrs>0) ret+= hrs+":"+(mins<10?"0":""); else ret+="0:"+(mins<10?"0":"");
  ret+= mins+":"+(secs<10?"0":"")+secs;
  return ret;
}
function setTimeToField(hr){ var d=Date.parse(new Date(serverDate))+hr*1000*3600; d=new Date(d); return zeroPadded(d.getHours())+":"+zeroPadded(d.getMinutes()); }
function setDayToField(hr){ var d=Date.parse(new Date(serverDate))+hr*1000*3600; d=new Date(d); return d.getFullYear()+"-"+zeroPadded(d.getMonth()+1)+"-"+zeroPadded(d.getDate()); }

/* Montar UI inicial (igual base) */
function buildBaseUI(){
  var html = `
<div id="massScavengeSophie" class="ui-widget-content" style="width:600px;background-color:${backgroundColor};cursor:move;z-index:50;">
  <button class="btn" id ="cog" onclick="settings()">⚙️</button>
  <button class="btn" id = "x" onclick="closeWindow('massScavengeSophie')">X</button>
  <table class="vis" border="1" style="width: 100%;background-color:${backgroundColor};border-color:${borderColor}">
    <tr>
      <td colspan="10" style="text-align:center;background-color:${headerColor}">
        <h3><center style="margin:10px"><u><font color="${titleColor}">${langShinko[0]}</font></u></center></h3>
      </td>
    </tr>
    <tr><td style="text-align:center;background-color:${headerColor}" colspan="15">
      <h3><center style="margin:10px"><u><font color="${titleColor}">${langShinko[1]}</font></u></center></h3>
    </td></tr>
    <tr id="imgRow"></tr>
  </table>
  <hr>
  <table class="vis" border="1" style="width:100%;background-color:${backgroundColor};border-color:${borderColor}">
    <tbody>
      <tr><td style="text-align:center;background-color:${headerColor}" colspan="4">
        <h3><center style="margin:10px"><u><font color="${titleColor}">${langShinko[2]}</font></u></center></h3>
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
      <center style="margin:10px"><font color="${titleColor}">${langShinko[3]}</font></center>
    </td></tr>
    <tr id="runtimes" style="text-align:center;background-color:${headerColor}">
      <td style="background-color:${headerColor};"></td>
      <td style="padding:10px;"><font color="${titleColor}">Off villages</font></td>
      <td style="padding:10px;"><font color="${titleColor}">Def villages</font></td>
    </tr>
    <tr>
      <td style="width:22px;background-color:${backgroundColor};padding:5px;"><input type="radio" id="timeSelectorDate" name="timeSelector"></td>
      <td style="text-align:center;background-color:${backgroundColor};padding:5px;"><input type="date" id="offDay" value="${setDayToField(runTimes.off)}"><input type="time" id="offTime" value="${setTimeToField(runTimes.off)}"></td>
      <td style="text-align:center;background-color:${backgroundColor};padding:5px;"><input type="date" id="defDay" value="${setDayToField(runTimes.def)}"><input type="time" id="defTime" value="${setTimeToField(runTimes.def)}"></td>
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
    <tr><td style="text-align:center;background-color:${headerColor};padding:5px;"><font color="${titleColor}">Balanced over all categories</font></td>
        <td style="text-align:center;background-color:${headerColor};padding:5px;"><font color="${titleColor}">Priority on filling higher categories</font></td>
    </tr>
    <tr>
      <td style="text-align:center;background-color:${backgroundColor};padding:5px;"><input type="radio" id="settingPriorityBalanced" name="prio"></td>
      <td style="text-align:center;background-color:${backgroundColor};padding:5px;"><input type="radio" id="settingPriorityPriority" name="prio"></td>
    </tr>
    <tr>
      <td style="text-align:center;background-color:${backgroundColor};padding:5px;"><font color="${titleColor}">Settings bugged?</font></td>
      <td style="text-align:center;background-color:${backgroundColor};padding:5px;"><input type="button" class="btn btnSophie" id="reset" value="Reset settings"></td>
    </tr>
  </table>
  <hr>
  <center><input type="button" class="btn btnSophie" id="sendMass" value="${langShinko[5]}"></center>
  <hr>
  <center><img id="sophieImg" title="Sophie -Shinko to Kuma-" src="https://dl.dropboxusercontent.com/s/bxoyga8wa6yuuz4/sophie2.gif" style="cursor:help;position:relative"></center>
  <br>
  <center><p><font color="${titleColor}">${langShinko[6]} </font><a href="https://shinko-to-kuma.my-free.website/" target="_blank">Sophie "Shinko to Kuma"</a></p></center>
</div>`;
  $(".maincell,#mobileContent").eq(0).prepend(html);
  if (!is_mobile){ $("#massScavengeSophie").css("position","fixed").draggable(); }
  if (game_data.locale=="ar_AE"){ $("#sophieImg").attr("src","https://media2.giphy.com/media/qYr8p3Dzbet5S/giphy.gif"); }

  $("#offDisplay").text(fancyTimeFormat(runTimes.off*3600));
  $("#defDisplay").text(fancyTimeFormat(runTimes.def*3600));
  if (timeElement=="Date"){ $("#timeSelectorDate").prop("checked",true); selectType("Date"); updateTimers(); }
  else { $("#timeSelectorHours").prop("checked",true); selectType("Hours"); updateTimers(); }

  $("#offDay,#defDay,#offTime,#defTime").on("input", updateTimers);
  $(".runTime_off,.runTime_def").on("input", updateTimers);
  $("#timeSelectorDate").on("input", function(){ selectType('Date'); updateTimers(); });
  $("#timeSelectorHours").on("input", function(){ selectType('Hours'); updateTimers(); });

  /* unidades + ordem arrastável */
  for (var i=0;i<sendOrder.length;i++){
    $("#imgRow").append(
      `<td align="center" style="background-color:${backgroundColor}">
        <table class="vis" border="1" style="width:100%">
          <tbody>
            <tr><td style="text-align:center;background-color:${headerColor};padding:5px;">
              <img src="https://dsen.innogamescdn.com/asset/cf2959e7/graphic/unit/unit_${sendOrder[i]}.png" title="${sendOrder[i]}">
            </td></tr>
            <tr><td align="center" style="background-color:${backgroundColor};padding:5px;">
              <input type="checkbox" id="${sendOrder[i]}">
            </td></tr>
            <tr><td style="text-align:center;background-color:#202225;padding:5px;"><font color="#ffffdf">Backup</font></td></tr>
            <tr><td align="center" style="background-color:${backgroundColor};padding:5px;">
              <input type="text" id="${sendOrder[i]}Backup" value="${keepHome[sendOrder[i]]||0}" size="5">
            </td></tr>
          </tbody>
        </table>
      </td>`
    );
  }
  $("#imgRow").sortable({axis:"x",revert:100,containment:"parent",forceHelperSize:true,delay:100,scroll:false}).disableSelection();

  if (prioritiseHighCat) $("#settingPriorityPriority").prop("checked",true);
  else $("#settingPriorityBalanced").prop("checked",true);

  enableCorrectTroopTypes();

  $("#sendMass").on("click", readyToSend);
  $("#reset").on("click", resetSettings);
}

/* Seleção/Timers */
function updateTimers(){
  if ($("#timeSelectorDate")[0].checked){
    $("#offDisplay").text(fancyTimeFormat((Date.parse($("#offDay").val().replace(/-/g,"/")+" "+$("#offTime").val())-serverDate)/1000));
    $("#defDisplay").text(fancyTimeFormat((Date.parse($("#defDay").val().replace(/-/g,"/")+" "+$("#defTime").val())-serverDate)/1000));
  } else {
    $("#offDisplay").text(fancyTimeFormat($(".runTime_off").val()*3600));
    $("#defDisplay").text(fancyTimeFormat($(".runTime_def").val()*3600));
  }
}
function selectType(type){
  switch(type){
    case 'Hours':
      if ($("#timeSelectorDate")[0].checked){
        $("#offDay,#defDay,#offTime,#defTime").prop("disabled",false);
        $(".runTime_off,.runTime_def").prop("disabled",true);
      } else {
        $("#offDay,#defDay,#offTime,#defTime").prop("disabled",true);
        $(".runTime_off,.runTime_def").prop("disabled",false);
      }
      break;
    case 'Date':
      if ($("#timeSelectorHours")[0].checked){
        $("#offDay,#defDay,#offTime,#defTime").prop("disabled",true);
        $(".runTime_off,.runTime_def").prop("disabled",false);
      } else {
        $("#offDay,#defDay,#offTime,#defTime").prop("disabled",false);
        $(".runTime_off,.runTime_def").prop("disabled",true);
      }
      break;
  }
}

/* Aplicar checks salvos */
function enableCorrectTroopTypes(){
  (game_data.units||[]).forEach(u=>{
    if (!/^(militia|snob|ram|catapult|spy)$/.test(u)){
      if (troopTypeEnabled[u]) $(`#${u}`).prop("checked", true);
    }
  });
  for (var i=0;i<categoryEnabled.length;i++){
    if (categoryEnabled[i]) $(`#category${i+1}`).prop("checked", true);
  }
}

/* Reset */
function resetSettings(){
  ["troopTypeEnabled","categoryEnabled","prioritiseHighCat","sendOrder","runTimes","keepHome"].forEach(k=>localStorage.removeItem(k));
  UI.BanneredRewardMessage("Settings reset");
  window.location.reload();
}
function closeWindow(id){ $("#"+id).remove(); }
function settings(){ alert("coming soon!"); }

/* Cálculo/Envio do original (mantido) */
var squads={}, squads_premium={};
function readyToSend(){
  if (!$("#settingPriorityPriority")[0].checked && !$("#settingPriorityBalanced")[0].checked){
    alert("You have not chosen how you want to split your troops!");
    throw Error("didn't choose type");
  }
  if (!$("#category1").is(":checked") && !$("#category2").is(":checked") && !$("#category3").is(":checked") && !$("#category4").is(":checked")){
    alert("You have not chosen which categories you want to use!");
    throw Error("didn't choose category");
  }
  sendOrder.forEach(u=>{ troopTypeEnabled[u] = $(`#${u}`).is(":checked"); });
  sendOrder.forEach(u=>{ keepHome[u] = +($(`#${u}Backup`).val()||0); });

  enabledCategories = [$("#category1").is(":checked"),$("#category2").is(":checked"),$("#category3").is(":checked"),$("#category4").is(":checked")];

  if ($("#timeSelectorDate")[0].checked){
    localStorage.setItem("timeElement","Date");
    time.off = Date.parse($("#offDay").val().replace(/-/g,"/")+" "+$("#offTime").val());
    time.def = Date.parse($("#defDay").val().replace(/-/g,"/")+" "+$("#defTime").val());
    time.off = (time.off - serverDate)/1000/3600;
    time.def = (time.def - serverDate)/1000/3600;
  } else {
    localStorage.setItem("timeElement","Hours");
    time.off = +$('.runTime_off').val();
    time.def = +$('.runTime_def').val();
  }
  if ($("#settingPriorityPriority")[0].checked) prioritiseHighCat=true; else prioritiseHighCat=false;

  sendOrder = $("#imgRow :checkbox").map(function(){return this.id;}).get();

  localStorage.setItem("troopTypeEnabled", JSON.stringify(troopTypeEnabled));
  localStorage.setItem("keepHome", JSON.stringify(keepHome));
  localStorage.setItem("categoryEnabled", JSON.stringify(enabledCategories));
  localStorage.setItem("prioritiseHighCat", JSON.stringify(prioritiseHighCat));
  localStorage.setItem("sendOrder", JSON.stringify(sendOrder));
  localStorage.setItem("runTimes", JSON.stringify(time));

  getData();
}

var duration_factor=0,duration_exponent=0,duration_initial_seconds=0;
function getData(){
  $("#massScavengeSophie").remove();
  var URLs=[];
  $.get(URLReq, function (data) {
    var $d=$(data);
    var last = $d.find(".paged-nav-item").last();
    var amountOfPages = last.length>0 ? parseInt(last[0].href.match(/page=(\d+)/)[1]) : 0;
    for (var i=0;i<=amountOfPages;i++){
      URLs.push(URLReq+"&page="+i);
      var tempData = JSON.parse($d.find('script:contains("ScavengeMassScreen")').html().match(/\{.*\:\{.*\:.*\}\}/g)[0]);
      duration_exponent = tempData[1].duration_exponent;
      duration_factor = tempData[1].duration_factor;
      duration_initial_seconds = tempData[1].duration_initial_seconds;
    }
  })
  .done(function(){
    arrayWithData = "[";
    $.getAll(URLs,
      (i,data)=>{
        var s = $(data).find('script:contains("ScavengeMassScreen")').html().match(/\{.*\:\{.*\:.*\}\}/g)[2];
        arrayWithData += s + ",";
      },
      ()=>{
        arrayWithData = arrayWithData.slice(0,-1)+"]";
        scavengeInfo = JSON.parse(arrayWithData);

        squad_requests=[]; squad_requests_premium=[];
        for (var i=0;i<scavengeInfo.length;i++) calculateHaulCategories(scavengeInfo[i]);

        // Split por 200
        squads={}; squads_premium={};
        var per200=0, group=0; squads[group]=[]; squads_premium[group]=[];
        for (var k=0;k<squad_requests.length;k++){
          if (per200==200){ group++; squads[group]=[]; squads_premium[group]=[]; per200=0; }
          per200++; squads[group].push(squad_requests[k]); squads_premium[group].push(squad_requests_premium[k]);
        }

        // UI final
        var html = `<div id="massScavengeFinal" class="ui-widget-content" style="position:fixed;background-color:${backgroundColor};cursor:move;z-index:50;">
        <button class="btn" id="x" onclick="closeWindow('massScavengeFinal')">X</button>
        <table class="vis" border="1" style="width:100%;background-color:${backgroundColor};border-color:${borderColor}">
          <tr><td colspan="10" style="text-align:center;background-color:${headerColor}">
            <h3><center style="margin:10px"><u><font color="${titleColor}">${langShinko[7]}</font></u></center></h3>
          </td></tr>`;
        for (var s=0; s<Object.keys(squads).length; s++){
          html += `<tr id="sendRow${s}" style="text-align:center;background-color:${backgroundColor}">
            <td><center><input type="button" class="btn btnSophie" onclick="sendGroup(${s},false)" value="${langShinko[8]}${s+1}"></center></td>
            <td><center><input type="button" class="btn btn-pp btn-send-premium" onclick="sendGroup(${s},true)" value="${langShinko[8]}${s+1} WITH PREMIUM" style="display:${premiumBtnEnabled?'':'none'}"></center></td>
          </tr>`;
        }
        html += `</table></div>`;
        $(".maincell,#mobileContent").eq(0).prepend(html);
        if(!is_mobile) $("#massScavengeFinal").draggable();

        /* AUTO: se loop estiver ON, dispara envio automático */
        if (__loop.enabled()) __loop.autoSendAllGroups();
      },
      (err)=>console.error(err)
    );
  });
}

function sendGroup(groupNr, usePremium){
  var temp = usePremium ? squads_premium[groupNr] : squads[groupNr];
  $(':button[id^="sendMass"],:button[id^="sendMassPremium"]').prop('disabled', true);
  TribalWars.post('scavenge_api',{ajaxaction:'send_squads'},{ "squad_requests": temp }, function () {
    UI.SuccessMessage("Group sent successfully");
  }, !1);
  setTimeout(function(){
    $(`#sendRow${groupNr}`).remove();
    $(':button[id^="sendMass"],:button[id^="sendMassPremium"]').prop('disabled', false);
    try{$("#sendMass")[0].focus();}catch(e){}
  }, 200);
}

var totalLoot=0,totalHaul=0,haulCategoryRate={};
function calculateHaulCategories(data){
  if (!data.has_rally_point) return;
  var troopsAllowed={};
  for (var k in troopTypeEnabled){
    if (troopTypeEnabled[k]){
      var v = (data.unit_counts_home[k]||0) - (keepHome[k]||0);
      troopsAllowed[k] = v>0?v:0;
    }
  }
  var unitType = {spear:'def',sword:'def',axe:'off',archer:'def',light:'off',marcher:'off',heavy:'def'};
  var typeCount = {off:0,def:0};
  for (var p in troopsAllowed) typeCount[unitType[p]] += troopsAllowed[p];

  totalLoot=0;
  for (var k in troopsAllowed){
    var carry = {spear:25,sword:15,axe:10,archer:10,light:80,marcher:50,heavy:50,knight:100}[k]||0;
    totalLoot += troopsAllowed[k] * (data.unit_carry_factor * carry);
  }
  if (totalLoot==0) return;

  var tHrs = (typeCount.off>typeCount.def) ? time.off : time.def;
  var haul = parseInt(((tHrs*3600)/duration_factor - duration_initial_seconds)**(1/duration_exponent)/100)**(1/2);

  haulCategoryRate={};
  haulCategoryRate[1] = (data.options[1].is_locked||data.options[1].scavenging_squad)?0: haul/0.1;
  haulCategoryRate[2] = (data.options[2].is_locked||data.options[2].scavenging_squad)?0: haul/0.25;
  haulCategoryRate[3] = (data.options[3].is_locked||data.options[3].scavenging_squad)?0: haul/0.50;
  haulCategoryRate[4] = (data.options[4].is_locked||data.options[4].scavenging_squad)?0: haul/0.75;

  for (var i=0;i<enabledCategories.length;i++) if (!enabledCategories[i]) haulCategoryRate[i+1]=0;

  totalHaul = (haulCategoryRate[1]||0)+(haulCategoryRate[2]||0)+(haulCategoryRate[3]||0)+(haulCategoryRate[4]||0);

  var unitsReadyForSend = calculateUnitsPerVillage(troopsAllowed);

  for (var k=0; k<Object.keys(unitsReadyForSend).length; k++){
    var candidate_squad = {"unit_counts": unitsReadyForSend[k], "carry_max": 9999999999};
    if (!data.options[k+1].is_locked){
      squad_requests.push({"village_id": data.village_id, "candidate_squad": candidate_squad, "option_id": k+1, "use_premium": false});
      squad_requests_premium.push({"village_id": data.village_id, "candidate_squad": candidate_squad, "option_id": k+1, "use_premium": true});
    }
  }
}

function calculateUnitsPerVillage(troopsAllowed){
  var unitHaul = {spear:25,sword:15,axe:10,archer:10,light:80,marcher:50,heavy:50,knight:100};
  var unitsReadyForSend={0:{},1:{},2:{},3:{}};

  if (totalLoot > totalHaul){
    if (version!="old"){
      for (var j=3;j>=0;j--){
        var reach = haulCategoryRate[j+1]||0;
        sendOrder.forEach(unit=>{
          if (troopsAllowed.hasOwnProperty(unit) && reach>0){
            var need = Math.floor(reach / (unitHaul[unit]||1));
            if (need > troopsAllowed[unit]){
              unitsReadyForSend[j][unit]=troopsAllowed[unit];
              reach -= troopsAllowed[unit]*(unitHaul[unit]||0);
              troopsAllowed[unit]=0;
            } else {
              unitsReadyForSend[j][unit]=need;
              reach = 0;
              troopsAllowed[unit] -= need;
            }
          }
        });
      }
    } else {
      for (var j=0;j<4;j++){
        for (var key in troopsAllowed){
          unitsReadyForSend[j][key] = Math.floor((haulCategoryRate[j+1]*(troopsAllowed[key]/totalLoot)));
        }
      }
    }
  } else {
    var troopNumber=0; for (var key in troopsAllowed) troopNumber+=troopsAllowed[key];
    if (!prioritiseHighCat && troopNumber>130){
      for (var j=0;j<4;j++){
        for (var key in troopsAllowed){
          unitsReadyForSend[j][key] = Math.floor((totalLoot/totalHaul*(haulCategoryRate[j+1]||0)) * (troopsAllowed[key]/totalLoot));
        }
      }
    } else {
      for (var j=3;j>=0;j--){
        var reach = haulCategoryRate[j+1]||0;
        sendOrder.forEach(unit=>{
          if (troopsAllowed.hasOwnProperty(unit) && reach>0){
            var need = Math.floor(reach / (unitHaul[unit]||1));
            if (need > troopsAllowed[unit]){
              unitsReadyForSend[j][unit]=troopsAllowed[unit];
              reach -= troopsAllowed[unit]*(unitHaul[unit]||0);
              troopsAllowed[unit]=0;
            } else {
              unitsReadyForSend[j][unit]=need;
              reach=0;
              troopsAllowed[unit]-=need;
            }
          }
        });
      }
    }
  }
  return unitsReadyForSend;
}

/* ========== PAINEL AUTO LOOP (integrado) ========== */
var LS = {
  enabled:'autoScav_loop_enabled',
  base:'autoScav_base_min',
  jmin:'autoScav_jitter_min',
  jmax:'autoScav_jitter_max',
  gdelay:'autoScav_group_delay'
};
function lsNum(k, d){ var v=localStorage.getItem(k); v=(v==null?d:v); v=Number(v); return Number.isFinite(v)?v:d; }
function lsBool(k,d){ var v=localStorage.getItem(k); if(v==null) return d; return v==='1' || v===true || v==='true'; }
function lsSet(k,v){ localStorage.setItem(k,String(v)); }

var __loop = (function(){
  var enabled = lsBool(LS.enabled, AUTO_DEFAULTS.ENABLED);
  var baseMin = lsNum(LS.base, AUTO_DEFAULTS.BASE_MIN);
  var jMin = lsNum(LS.jmin, AUTO_DEFAULTS.JITTER_MIN);
  var jMax = lsNum(LS.jmax, AUTO_DEFAULTS.JITTER_MAX);
  var gDelay = lsNum(LS.gdelay, AUTO_DEFAULTS.GROUP_DELAY_MS);

  function nextDelayMs(){
    var base = Math.max(1, baseMin)*60_000;
    var a = Math.max(0, jMin)*60_000;
    var b = Math.max(a, jMax)*60_000;
    var jitter = Math.floor(Math.random()*(b-a+1))+a;
    return base + jitter;
  }
  function fmtNext(ms){
    if(!ms) return "-";
    var d=new Date(Date.now()+ms), hh=("0"+d.getHours()).slice(-2), mm=("0"+d.getMinutes()).slice(-2);
    return `${hh}:${mm}`;
  }
  function schedule(){
    if (!enabled){ $("#nextRun").text("-"); return; }
    clearTimeout(_auto.timer);
    var ms = nextDelayMs();
    _auto.timer = setTimeout(runCycleNow, ms);
    $("#nextRun").text(fmtNext(ms));
  }
  function start(){ enabled=true; lsSet(LS.enabled,1); refreshPanel(); schedule(); UI.SuccessMessage("Loop iniciado."); }
  function stop(){ enabled=false; lsSet(LS.enabled,0); clearTimeout(_auto.timer); $("#nextRun").text("-"); refreshPanel(); UI.SuccessMessage("Loop parado."); }
  function enabledGetter(){ return enabled; }

  function setBase(v){ baseMin=v; lsSet(LS.base,v); refreshPanel(); schedule(); }
  function setJitter(a,b){ jMin=a; jMax=b; lsSet(LS.jmin,a); lsSet(LS.jmax,b); refreshPanel(); schedule(); }
  function setGDelay(ms){ gDelay=ms; lsSet(LS.gdelay,ms); refreshPanel(); }

  function refreshPanel(){
    $("#loopState").text(enabled?"ON":"OFF");
    $("#baseVal").text(baseMin);
    $("#jitterVal").text(`${jMin}..${jMax}`);
    $("#delayVal").text(gDelay);
    $("#btnToggleLoop").text(enabled?"Parar loop":"Iniciar loop");
  }

  function autoSendAllGroups(){
    if (_auto.sending) return;
    if (!squads || !Object.keys(squads).length){ schedule(); return; }
    _auto.sending = true;
    var idx=0, total=Object.keys(squads).length;
    (function step(){
      if (idx>=total){ _auto.sending=false; schedule(); return; }
      try{ sendGroup(idx,false); }catch(e){}
      idx++;
      setTimeout(step, Math.max(150, gDelay));
    })();
  }

  function runCycleNow(){
    // remove UI final antiga e refaz getData (que monta e calcula)
    $("#massScavengeFinal").remove();
    try{ getData(); }catch(e){ UI.ErrorMessage("getData() não encontrado."); }
  }

  /* montar painel */
  $("#autoScavAddOn").remove();
  var panel = $(
`<div id="autoScavAddOn">
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
  $("body").append(panel);
  try{ $("#autoScavAddOn").draggable(); }catch(e){}

  $("#btnToggleLoop").on("click", ()=> enabled?stop():start() );
  $("#btnRunNow").on("click", runCycleNow);
  $("#btnSetBase").on("click", function(){
    var v = prompt("Intervalo base entre checagens (minutos):", baseMin);
    if (v===null) return;
    var n=Number(v); if(!Number.isFinite(n)||n<1){ alert("Valor inválido (>=1)."); return; }
    setBase(Math.floor(n));
  });
  $("#btnSetJitter").on("click", function(){
    var v = prompt("Atraso aleatório adicional (min..máx), ex: 2-7", `${jMin}-${jMax}`);
    if (v===null) return;
    var m = String(v).replace(/\s+/g,'').match(/^(\d+)\-(\d+)$/);
    if(!m){ alert("Formato inválido. Use min-max (ex: 2-7)"); return; }
    var a=Number(m[1]), b=Number(m[2]); if(!Number.isFinite(a)||!Number.isFinite(b)){ alert("Números inválidos."); return; }
    if (b<a){ var t=a;a=b;b=t; }
    setJitter(Math.floor(a), Math.floor(b));
  });
  $("#btnSetGroupDelay").on("click", function(){
    var v = prompt("Delay entre envio de grupos (ms):", gDelay);
    if (v===null) return;
    var n=Number(v); if(!Number.isFinite(n)||n<100){ alert("Use número >= 100 ms."); return; }
    setGDelay(Math.floor(n));
  });

  refreshPanel();

  /* Observa quando a UI final surge para auto enviar */
  new MutationObserver(()=>{
    if (document.getElementById("massScavengeFinal") && enabled){
      autoSendAllGroups();
    }
  }).observe(document.body, {childList:true,subtree:true});

  return {
    enabled: enabledGetter,
    autoSendAllGroups:autoSendAllGroups,
    schedule:schedule,
    runNow:runCycleNow
  };
})();

/* Inicializar UI base */
buildBaseUI();

/* ================== FIM ================== */
})();
