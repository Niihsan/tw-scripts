(function () {
    'use strict';

    // Evitar rodar duas vezes
    if (window.rsSenderInit) {
        console.log('recursosA já carregado');
        return;
    }
    window.rsSenderInit = true;

    // Estado do loop de envios automáticos
    var rsLoop = {
        timer: null,
        running: false,
        intervalMs: 30000 // padrão 30s
    };

// ─────────────────────────────────────────────────────
//   BLOCO OBRIGATÓRIO PARA EVITAR ERROS DE VARIÁVEL
// ─────────────────────────────────────────────────────

// evita rodar duas vezes
if (!window.rsSenderInit) window.rsSenderInit = true;

// porcentagens fixas para cálculo de transporte
var woodPercentage  = 28000 / 83000;
var stonePercentage = 30000 / 83000;
var ironPercentage  = 25000 / 83000;

// variáveis globais do script
var warehouseCapacity = [];
var allWoodTotals = [];
var allClayTotals = [];
var allIronTotals = [];
var availableMerchants = [];
var totalMerchants = [];
var farmSpaceUsed = [];
var farmSpaceTotal = [];
var villagesData = [];
var allWoodObjects, allClayObjects, allIronObjects, allVillages;
var totalsAndAverages = "";
var data, totalWood = 0, totalStone = 0, totalIron = 0, resLimit = 0;
var sendBack;
var totalWoodSent = 0, totalStoneSent = 0, totalIronSent = 0;

// variáveis do loop automático
var rsLoop = {
    running: false,
    timer: null,
    intervalMs: 60000
};
    }
    // percentages for coins, 83000 is how much all 3 is combined

    var backgroundColor = "#36393f";
    var borderColor = "#3e4147";
    var headerColor = "#202225";
    var titleColor = "#ffffdf";
    var langShinko = [
        "Resource sender for flag boost minting",
        "Enter coordinate to send to",
        "Save",
        "Creator",
        "Player",
        "Village",
        "Points",
        "Coordinate to send to",
        "Keep WH% behind",
        "Recalculate res/change",
        "Res sender",
        "Source village",
        "Target village",
        "Distance",
        "Wood",
        "Clay",
        "Iron",
        "Send resources",
        "Created by Sophie 'Shinko to Kuma'"
    ];
    if (game_data.locale == "en_DK") {
        langShinko = [
            "Resource sender for flag boost minting",
            "Enter coordinate to send to",
            "Save",
            "Creator",
            "Player",
            "Village",
            "Points",
            "Coordinate to send to",
            "Keep WH% behind",
            "Recalculate res/change",
            "Res sender",
            "Source village",
            "Target village",
            "Distance",
            "Wood",
            "Clay",
            "Iron",
            "Send resources",
            "Created by Sophie 'Shinko to Kuma'"
        ];
    }
    if (game_data.locale == "el_GR") {
        langShinko = [
            "Αποστολή πόρων",
            "Εισάγετε τις συντεταγμένες - στόχο",
            "Αποθήκευση",
            "Δημιουργός",
            "Παίκτης",
            "Χωριό",
            "Πόντοι",
            "Στόχος",
            "Διατήρησε το % Αποθήκης κάτω από",
            "Υπολογισμός πόρων/αλλαγή στόχου",
            "Αποστολή πόρων",
            "Προέλευση",
            "Χωριό στόχος",
            "Απόσταση",
            "Ξύλο",
            "Πηλός",
            "Σίδερο",
            "Αποστολή πόρων",
            "Δημιουργήθηκε από την Sophie 'Shinko to Kuma'"
        ];
    }
    if (game_data.locale == "nl_NL") {
        langShinko = [
            "Grondstoffen versturen voor vlagfarmen",
            "Geef coordinaat in om naar te sturen",
            "Opslaan",
            "Scripter",
            "Speler",
            "Dorp",
            "Punten",
            "Coordinaat om naar te sturen",
            "Hou WH% achter",
            "Herbereken gs/doelwit",
            "Gs versturen",
            "Oorsprong",
            "Doelwit",
            "Afstand",
            "Hout",
            "Leem",
            "Ijzer",
            "Verstuur grondstoffen",
            "Gemaakt door Sophie 'Shinko to Kuma'"
        ];
    }
    if (game_data.locale == "it_IT") {
        langShinko = [
            "Script pushing per coniare",
            "Inserire le coordinate a cui mandare risorse",
            "Salva",
            "Creatrice",
            "Giocatore",
            "Villaggio",
            "Punti",
            "Coordinate a cui mandare",
            "Conserva % magazzino",
            "Ricalcola trasporti",
            "Invia risorse",
            "Villaggio di origine",
            "Villaggio di destinazione",
            "Distanza",
            "Legno",
            "Argilla",
            "Ferro",
            "Manda risorse",
            "Creato da Sophie 'Shinko to Kuma'"
        ];
    }
    if (game_data.locale == "pt_BR") {
        langShinko = [
            "Enviar recursos para cunhagem de moedas",
            "Insira coordenada para enviar recursos",
            "Salvar",
            "Criador",
            "Jogador",
            "Aldeia",
            "Pontos",
            "Enviar para",
            "Manter % no armazém",
            "Recalcular transporte",
            "Enviar recursos",
            "Origem",
            "Destino",
            "Distância",
            "Madeira",
            "Argila",
            "Ferro",
            "Enviar recursos",
            "Criado por Sophie 'Shinko to Kuma'"
        ];
    }

    var cssClassesSophie = `
<style>
.sophRowA {
background-color: #32353b;
color: white;
}
.sophRowB {
background-color: #36393f;
color: white;
}
.sophHeader {
background-color: #202225;
font-weight: bold;
color: white;
}
</style>`;

    $("#contentContainer").eq(0).prepend(cssClassesSophie);
    $("#mobileHeader").eq(0).prepend(cssClassesSophie);

    //check if we have a limit set for the res we want to keep in the villages
    if ("resLimit" in sessionStorage) {
        console.log('resLimit ok');
        resLimit = parseInt(sessionStorage.getItem("resLimit", resLimit));
    } else {
        sessionStorage.setItem("resLimit", resLimit);
        console.log('resLimit not found, created');
    }

    //collect overview so we can get all the information necessary from all villages
    var URLReq;
    if (game_data.player.sitter > 0) {
        URLReq = `game.php?t=${game_data.player.id}&screen=overview_villages&mode=prod&page=-1&`;
    } else {
        URLReq = "game.php?&screen=overview_villages&mode=prod&page=-1&";
    }

    $.get(URLReq, function () {
        console.log("Managed to grab the page");
    }).done(function (page) {

        //different HTML for mobile devices, so have to seperate
        if ($("#mobileHeader")[0]) {
            console.log("mobile");
            allWoodObjects = $(page).find(".res.mwood,.warn_90.mwood,.warn.mwood");
            allClayObjects = $(page).find(".res.mstone,.warn_90.mstone,.warn.mstone");
            allIronObjects = $(page).find(".res.miron,.warn_90.miron,.warn.miron");
            var allWarehouses = $(page).find(".mheader.ressources");
            allVillages = $(page).find(".quickedit-vn");
            var allFarms = $(page).find(".header.population");
            var allMerchants = $(page).find('a[href*="market"]');

            // wood
            for (var i = 0; i < allWoodObjects.length; i++) {
                var n = allWoodObjects[i].textContent;
                n = n.replace(/\./g, '').replace(',', '');
                allWoodTotals.push(n);
            }
            // clay
            for (var j = 0; j < allClayObjects.length; j++) {
                var c = allClayObjects[j].textContent;
                c = c.replace(/\./g, '').replace(',', '');
                allClayTotals.push(c);
            }
            // iron
            for (var k = 0; k < allIronObjects.length; k++) {
                var ir = allIronObjects[k].textContent;
                ir = ir.replace(/\./g, '').replace(',', '');
                allIronTotals.push(ir);
            }
            // warehouse
            for (var w = 0; w < allVillages.length; w++) {
                warehouseCapacity.push(allWarehouses[w].parentElement.innerText);
            }
            // merchants
            for (var m = 0; m < allVillages.length; m++) {
                for (var j2 = 1; j2 < allMerchants.length; j2++) {
                    availableMerchants.push(allMerchants[j2].innerText);
                }
                totalMerchants.push("999");
            }
            // farm
            for (var f = 0; f < allVillages.length; f++) {
                farmSpaceUsed.push(allFarms[f].parentElement.innerText.match(/(\d*)\/(\d*)/)[1]);
                farmSpaceTotal.push(allFarms[f].parentElement.innerText.match(/(\d*)\/(\d*)/)[2]);
            }

        } else {
            console.log("desktop");
            allWoodObjects = $(page).find(".res.wood,.warn_90.wood,.warn.wood");
            allClayObjects = $(page).find(".res.stone,.warn_90.stone,.warn.stone");
            allIronObjects = $(page).find(".res.iron,.warn_90.iron,.warn.iron");
            allVillages = $(page).find(".quickedit-vn");

            for (var i2 = 0; i2 < allWoodObjects.length; i2++) {
                var n2 = allWoodObjects[i2].textContent;
                n2 = n2.replace(/\./g, '').replace(',', '');
                allWoodTotals.push(n2);
            }
            for (var j3 = 0; j3 < allClayObjects.length; j3++) {
                var c2 = allClayObjects[j3].textContent;
                c2 = c2.replace(/\./g, '').replace(',', '');
                allClayTotals.push(c2);
            }
            for (var k2 = 0; k2 < allIronObjects.length; k2++) {
                var ir2 = allIronObjects[k2].textContent;
                ir2 = ir2.replace(/\./g, '').replace(',', '');
                allIronTotals.push(ir2);
            }

            for (var w2 = 0; w2 < allVillages.length; w2++) {
                warehouseCapacity.push(allIronObjects[w2].parentElement.nextElementSibling.innerHTML);
            }

            for (var m2 = 0; m2 < allVillages.length; m2++) {
                availableMerchants.push(allIronObjects[m2].parentElement.nextElementSibling.nextElementSibling.innerText.match(/(\d*)\/(\d*)/)[1]);
                totalMerchants.push(allIronObjects[m2].parentElement.nextElementSibling.nextElementSibling.innerText.match(/(\d*)\/(\d*)/)[2]);
            }

            for (var f2 = 0; f2 < allVillages.length; f2++) {
                farmSpaceUsed.push(allIronObjects[f2].parentElement.nextElementSibling.nextElementSibling.nextElementSibling.innerText.match(/(\d*)\/(\d*)/)[1]);
                farmSpaceTotal.push(allIronObjects[f2].parentElement.nextElementSibling.nextElementSibling.nextElementSibling.innerText.match(/(\d*)\/(\d*)/)[2]);
            }
        }

        // unify data
        for (var idx = 0; idx < allVillages.length; idx++) {
            villagesData.push({
                "id": allVillages[idx].dataset.id,
                "url": allVillages[idx].children[0].children[0].href,
                "coord": allVillages[idx].innerText.trim().match(/\d+\|\d+/)[0],
                "name": allVillages[idx].innerText.trim(),
                "wood": allWoodTotals[idx],
                "stone": allClayTotals[idx],
                "iron": allIronTotals[idx],
                "availableMerchants": availableMerchants[idx],
                "totalMerchants": totalMerchants[idx],
                "warehouseCapacity": warehouseCapacity[idx],
                "farmSpaceUsed": farmSpaceUsed[idx],
                "farmSpaceTotal": farmSpaceTotal[idx]
            });
        }

    });

    //ask user what coordinate they want to send resources to
    askCoordinate();

    function createList() {
        // remove listas antigas
        if ($("#sendResources")[0]) {
            $("#sendResources")[0].remove();
            $("#resourceSender")[0].remove();
        }

        // UI de configuração
        var htmlString = `
            <div id="resourceSender">
                <table id="Settings" width="600">
                    <thead>
                        <tr>
                            <td class="sophHeader">${langShinko[7]}</td>
                            <td class="sophHeader">${langShinko[8]}</td>
                            <td class="sophHeader"></td>
                            <td class="sophHeader"></td>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="sophRowA">
                                <input type="text" id="coordinateTarget" name="coordinateTarget" size="20">
                            </td>
                            <td class="sophRowA" align="right">
                                <input type="text" id="resPercent" name="resPercent" size="1">% 
                            </td>
                            <td class="sophRowA">
                                <button type="button" id="button" class="btn-confirm-yes">${langShinko[2]}</button>
                            </td>
                            <td class="sophRowA">
                                <button type="button" id="sendRes" class="btn" name="sendRes" onclick="reDo()">${langShinko[9]}</button>
                            </td>
                        </tr>
                        <!-- Controles do LOOP -->
                        <tr>
                            <td class="sophRowB" colspan="2">
                                Loop (segundos entre envios):
                                <input type="number" id="rsLoopDelay" min="1" value="30" style="width:60px;">
                            </td>
                            <td class="sophRowB">
                                <button type="button" id="rsLoopToggle" class="btn">Iniciar loop</button>
                            </td>
                            <td class="sophRowB">
                                <span id="rsLoopStatus" style="color:red;">Loop parado</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <br>
            </div>`.trim();

        var uiDiv = document.createElement('div');
        uiDiv.innerHTML = htmlString;

        // cabeçalho da lista
        var htmlCode = `
            <div id="sendResources" border="0">
                <table id="tableSend" width="100%">
                    <tbody id="appendHere">
                        <tr>
                            <td class="sophHeader" colspan="7" width="550" style="text-align:center">${langShinko[10]}</td>
                        </tr>
                        <tr>
                            <td class="sophHeader" width="25%" style="text-align:center">${langShinko[11]}</td>
                            <td class="sophHeader" width="25%" style="text-align:center">${langShinko[12]}</td>
                            <td class="sophHeader" width="5%" style="text-align:center">${langShinko[13]}</td>
                            <td class="sophHeader" width="10%" style="text-align:center">${langShinko[14]}</td>
                            <td class="sophHeader" width="10%" style="text-align:center">${langShinko[15]}</td>
                            <td class="sophHeader" width="10%" style="text-align:center">${langShinko[16]}</td>
                            <td class="sophHeader" width="15%">
                                <font size="1">${langShinko[18]}</font>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>`;

        $("#mobileHeader").eq(0).append(htmlCode);
        $("#contentContainer").eq(0).prepend(htmlCode);
        $("#mobileHeader").prepend(uiDiv.firstChild);
        $("#contentContainer").prepend(uiDiv.firstChild);

        $("#resPercent")[0].value = resLimit;
        $("#coordinateTarget")[0].value = coordinate || '';

        // salvar coord + reslimit
        $('#button').off('click').on('click', function () {
            var m = $("#coordinateTarget")[0].value.match(/\d+\|\d+/);
            if (m) {
                coordinate = m[0];
                sessionStorage.setItem("coordinate", coordinate);
            }
            resLimit = $("#resPercent")[0].value;
            sessionStorage.setItem("resLimit", resLimit);
        });

        // bloco com info do alvo
        $("#resourceSender").eq(0).prepend(`
            <table id="playerTarget" width="600">
                <tbody>
                    <tr>
                        <td class="sophHeader" rowspan="3"><img src="${sendBack[2]}"></td>
                        <td class="sophHeader">${langShinko[4]}:</td>
                        <td class="sophRowA">${sendBack[3]}</td>
                        <td class="sophHeader"><span class="icon header wood"></span></td>
                        <td class="sophRowB" id="woodSent"></td>
                    </tr>
                    <tr>
                        <td class="sophHeader">${langShinko[5]}:</td>
                        <td class="sophRowB">${sendBack[1]}</td>
                        <td class="sophHeader"><span class="icon header stone"></span></td>
                        <td class="sophRowA" id="stoneSent"></td>
                    </tr>
                    <tr>
                        <td class="sophHeader">${langShinko[6]}:</td>
                        <td class="sophRowA">${sendBack[4]}</td>
                        <td class="sophHeader"><span class="icon header iron"></span></td>
                        <td class="sophRowB" id="ironSent"></td>
                    </tr>
                </tbody>
            </table>`);

        // linhas das aldeias
        var listHTML = "";
        for (var i = 0; i < villagesData.length; i++) {
            var tempRow = (i % 2 === 0) ? (" id='" + i + "' class='sophRowB'") : (" id='" + i + "' class='sophRowA'");
            var res = calculateResAmounts(
                villagesData[i].wood,
                villagesData[i].stone,
                villagesData[i].iron,
                villagesData[i].warehouseCapacity,
                villagesData[i].availableMerchants
            );
            if (res.wood + res.stone + res.iron !== 0 && villagesData[i].id != sendBack[0]) {
                listHTML += `
                    <tr ${tempRow} height="40">
                        <td><a href="${villagesData[i].url}" style="color:#40D0E0;">${villagesData[i].name}</a></td>
                        <td><a href="#" style="color:#40D0E0;">${sendBack[1]}</a></td>
                        <td>${checkDistance(sendBack[5], sendBack[6], villagesData[i].coord.substring(0, 3), villagesData[i].coord.substring(4, 7))}</td>
                        <td width="50" style="text-align:center">${res.wood}<span class="icon header wood"></span></td>
                        <td width="50" style="text-align:center">${res.stone}<span class="icon header stone"></span></td>
                        <td width="50" style="text-align:center">${res.iron}<span class="icon header iron"></span></td>
                        <td style="text-align:center">
                            <input type="button"
                                   class="btn evt-confirm-btn btn-confirm-yes"
                                   id="sendResources"
                                   value="${langShinko[17]}"
                                   onclick="sendResource(${villagesData[i].id},${sendBack[0]},${res.wood},${res.stone},${res.iron},${i})">
                        </td>
                    </tr>`;
            }
        }
        $("#appendHere").eq(0).append(listHTML);

        sortTableTest(2);
        formatTable();

        // foco primeiro botão
        $(":button,#sendResources")[3].focus();

        // ligar botão do loop
        $('#rsLoopToggle').off('click').on('click', function (e) {
            e.preventDefault();
            if (rsLoop.running) {
                stopResLoop();
            } else {
                startResLoop();
            }
        });
    }

    // ====== LOOP ======

    function findNextSendButton() {
        var $btns = $('input#sendResources.btn.evt-confirm-btn.btn-confirm-yes:enabled');
        if ($btns.length > 0) return $btns.first()[0];
        return null;
    }

    function rsLoopTick() {
        var btn = findNextSendButton();
        if (!btn) {
            stopResLoop();
            alert("Finished sending (nenhum botão 'Enviar recursos' restante).");
            return;
        }
        btn.click();
    }

    function startResLoop() {
        var delayInput = document.getElementById('rsLoopDelay');
        var secs = 30;
        if (delayInput) {
            var v = parseInt(delayInput.value, 10);
            if (!isNaN(v) && v > 0) secs = v;
        }
        if (secs < 1) secs = 1;

        rsLoop.intervalMs = secs * 1000;

        if (rsLoop.timer) clearInterval(rsLoop.timer);
        rsLoop.timer = setInterval(rsLoopTick, rsLoop.intervalMs);
        rsLoop.running = true;

        var st = document.getElementById('rsLoopStatus');
        var bt = document.getElementById('rsLoopToggle');
        if (st) {
            st.textContent = 'Loop rodando a cada ' + secs + 's';
            st.style.color = 'green';
        }
        if (bt) bt.textContent = 'Parar loop';

        rsLoopTick(); // já manda o primeiro
    }

    function stopResLoop() {
        if (rsLoop.timer) {
            clearInterval(rsLoop.timer);
            rsLoop.timer = null;
        }
        rsLoop.running = false;

        var st = document.getElementById('rsLoopStatus');
        var bt = document.getElementById('rsLoopToggle');
        if (st) {
            st.textContent = 'Loop parado';
            st.style.color = 'red';
        }
        if (bt) bt.textContent = 'Iniciar loop';
    }

    // ====== RESTO FUNÇÕES ORIGINAIS ======

    window.sendResource = function (sourceID, targetID, woodAmount, stoneAmount, ironAmount, rowNr) {
        $(':button[id^="sendResources"]').prop('disabled', true);
        setTimeout(function () {
            $("#" + rowNr)[0].remove();
            $(':button[id^="sendResources"]').prop('disabled', false);
            $(":button,#sendResources")[3].focus();
            if ($("#tableSend tr").length <= 2) {
                alert("Finished sending!");
                if ($(".btn-pp").length > 0) {
                    $(".btn-pp").remove();
                }
                throw Error("Done.");
            }
        }, 200);
        var e = { "target_id": targetID, "wood": woodAmount, "stone": stoneAmount, "iron": ironAmount };
        TribalWars.post("market", {
            ajaxaction: "map_send", village: sourceID
        }, e, function (resp) {
            Dialog.close();
            UI.SuccessMessage(resp.message);
            console.log(resp.message);
            totalWoodSent += woodAmount;
            totalStoneSent += stoneAmount;
            totalIronSent += ironAmount;
            $("#woodSent").eq(0).text(numberWithCommas(totalWoodSent));
            $("#stoneSent").eq(0).text(numberWithCommas(totalStoneSent));
            $("#ironSent").eq(0).text(numberWithCommas(totalIronSent));
        }, false);
    };

    function numberWithCommas(x) {
        x = x.toString();
        var pattern = /(-?\d+)(\d{3})/;
        while (pattern.test(x)) x = x.replace(pattern, "$1.$2");
        return x;
    }

    function checkDistance(x1, y1, x2, y2) {
        var a = x1 - x2;
        var b = y1 - y2;
        var distance = Math.round(Math.hypot(a, b));
        return distance;
    }

    function askCoordinate() {
        var content = `<div style="max-width:1000px;">
    <h2 class="popup_box_header">
       <center><u>
          <font color="darkgreen">${langShinko[0]}</font>
          </u>
       </center>
    </h2>
    <hr>
    <p>
    <center>
       <font color="maroon"><b>${langShinko[1]}</b></font>
    </center>
    </p>
    <center>
       <table>
          <tr>
             <td>
                <center>
                   <input type="text" id="coordinateTargetFirstTime" name="coordinateTargetFirstTime" size="20">
                </center>
             </td>
          </tr>
          <tr></tr>
          <tr>
             <td>
                <center>
                   <input type="button"
                      class="btn evt-cancel-btn btn-confirm-yes" id="saveCoord"
                      value="${langShinko[2]}">
                </center>
             </td>
          </tr>
          <tr></tr>
       </table>
    </center>
    <br>
    <hr>
    <center>
       <img id="sophieImg" class="tooltip-delayed"
       title="<font color=darkgreen>Sophie -Shinko to Kuma-</font>"
       src="https://dl.dropboxusercontent.com/s/bxoyga8wa6yuuz4/sophie2.gif"
       style="cursor:help; position: relative">
    </center>
    <br>
    <center>
       <p>${langShinko[3]}:
          <a href="https://shinko-to-kuma.my-free.website/"
             title="Sophie profile" target="_blank">Sophie "Shinko
          to Kuma"</a>
       </p>
    </center>
 </div>`;
        Dialog.show('Supportfilter', content);
        if (game_data.locale == "ar_AE") {
            $("#sophieImg").attr("src", "https://media2.giphy.com/media/qYr8p3Dzbet5S/giphy.gif");
        }
        $("#saveCoord").off('click').on('click', function () {
            var m = $("#coordinateTargetFirstTime")[0].value.match(/\d+\|\d+/);
            if (m) {
                coordinate = m[0];
                sessionStorage.setItem("coordinate", coordinate);
                var close_this = document.getElementsByClassName('popup_box_close');
                if (close_this[0]) close_this[0].click();
                targetID = coordToId(coordinate);
            } else {
                alert("Coordenada inválida.");
            }
        });
    }

    function calculateResAmounts(wood, stone, iron, warehouse, merchants) {
        var merchantCarry = merchants * 1000;
        var leaveBehindRes = Math.floor(warehouse / 100 * resLimit);
        var localWood = wood - leaveBehindRes;
        var localStone = stone - leaveBehindRes;
        var localIron = iron - leaveBehindRes;
        localWood = Math.max(0, localWood);
        localStone = Math.max(0, localStone);
        localIron = Math.max(0, localIron);

        var merchantWood = (merchantCarry * woodPercentage);
        var merchantStone = (merchantCarry * stonePercentage);
        var merchantIron = (merchantCarry * ironPercentage);

        var perc = 1;
        if (merchantWood > localWood) {
            perc = localWood / merchantWood;
            merchantWood *= perc;
            merchantStone *= perc;
            merchantIron *= perc;
        }
        if (merchantStone > localStone) {
            perc = localStone / merchantStone;
            merchantWood *= perc;
            merchantStone *= perc;
            merchantIron *= perc;
        }
        if (merchantIron > localIron) {
            perc = localIron / merchantIron;
            merchantWood *= perc;
            merchantStone *= perc;
            merchantIron *= perc;
        }
        return {
            "wood": Math.floor(merchantWood),
            "stone": Math.floor(merchantStone),
            "iron": Math.floor(merchantIron)
        };
    }

    function compareDates(x) {
        var start = x,
            end = new Date(),
            diff = new Date(end - start),
            hours = diff / 1000 / 60 / 60;
        console.log("checked " + hours + " ago for village list");
        return hours;
    }

    function coordToId(coordinate) {
        var sitterID;
        if (game_data.player.sitter > 0) {
            sitterID = `game.php?t=${game_data.player.id}&screen=api&ajax=target_selection&input=${coordinate}&type=coord`;
        } else {
            sitterID = '/game.php?&screen=api&ajax=target_selection&input=' + coordinate + '&type=coord';
        }
        var dataLocal;
        $.get(sitterID, function (json) {
            if (parseFloat(game_data.majorVersion) > 8.217) dataLocal = json;
            else dataLocal = JSON.parse(json);
        }).done(function () {
            console.log(dataLocal);
            sendBack = [
                dataLocal.villages[0].id,
                dataLocal.villages[0].name,
                dataLocal.villages[0].image,
                dataLocal.villages[0].player_name,
                dataLocal.villages[0].points,
                dataLocal.villages[0].x,
                dataLocal.villages[0].y
            ];
            createList();
        });
    }

    window.reDo = function () {
        if (!coordinate) {
            alert("Defina a coordenada primeiro.");
            return;
        }
        coordToId(coordinate);
    };

    function formatTable() {
        var tableRows = $("#table tr");
        for (var i = 1; i < tableRows.length; i++) {
            if (i % 2 === 0) {
                $("#table tr")[i].className = "sophRowB";
            } else {
                $("#table tr")[i].className = "sophRowA";
            }
        }
    }

    function sortTableTest(n) {
        var table = document.getElementById("tableSend");
        var switching = true, dir = "asc", switchcount = 0;

        while (switching) {
            switching = false;
            var rows = table.rows;
            for (var i = 2; i < (rows.length - 1); i++) {
                var shouldSwitch = false;
                var x = rows[i].getElementsByTagName("td")[n];
                var y = rows[i + 1].getElementsByTagName("td")[n];
                if (dir === "asc") {
                    if (Number(x.innerHTML) > Number(y.innerHTML)) {
                        shouldSwitch = true;
                        break;
                    }
                } else if (dir === "desc") {
                    if (Number(x.innerHTML) < Number(y.innerHTML)) {
                        shouldSwitch = true;
                        break;
                    }
                }
            }
            if (shouldSwitch) {
                rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
                switching = true;
                switchcount++;
            } else {
                if (switchcount === 0 && dir === "asc") {
                    dir = "desc";
                    switching = true;
                }
            }
        }
    }

})();
