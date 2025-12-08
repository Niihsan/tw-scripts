// ===================== CONFIG BÁSICA =====================

// Evitar rodar duas vezes (sem usar return)
if (window.recursosAInit) {
    console.log('recursosA já carregado');
} else {
    window.recursosAInit = true;
}

// Porcentagens fixas para cunhagem (mesmo padrão 28/30/25)
var woodPercentage  = 28000 / 83000;
var stonePercentage = 30000 / 83000;
var ironPercentage  = 25000 / 83000;

// Variáveis globais
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
var coordinate, targetID;

// Loop automático para os envios
var rsLoop = {
    timer: null,
    running: false,
    intervalMs: 60000 // padrão 60s
};

// ===================== TEXTOS (pt_BR) =====================

var langShinko = [
    "Enviar recursos para cunhagem de moedas", // 0
    "Insira coordenada para enviar recursos",  // 1
    "Salvar",                                  // 2
    "Criador",                                 // 3
    "Jogador",                                 // 4
    "Aldeia",                                  // 5
    "Pontos",                                  // 6
    "Enviar para",                             // 7
    "Manter % no armazém",                     // 8
    "Recalcular transporte",                   // 9
    "Enviar recursos",                         // 10
    "Origem",                                  // 11
    "Destino",                                 // 12
    "Distância",                               // 13
    "Madeira",                                 // 14
    "Argila",                                  // 15
    "Ferro",                                   // 16
    "Enviar recursos",                         // 17
    "Criado por Sophie 'Shinko to Kuma'"       // 18
];

// ===================== CSS =====================

var cssClassesSophie =
    '<style>' +
    '.sophRowA { background-color: #32353b; color: white; }' +
    '.sophRowB { background-color: #36393f; color: white; }' +
    '.sophHeader { background-color: #202225; font-weight: bold; color: white; }' +
    '</style>';

$("#contentContainer").eq(0).prepend(cssClassesSophie);
$("#mobileHeader").eq(0).prepend(cssClassesSophie);

// ===================== RESLIMIT =====================

if ("resLimit" in sessionStorage) {
    resLimit = parseInt(sessionStorage.getItem("resLimit", resLimit), 10) || 0;
} else {
    sessionStorage.setItem("resLimit", resLimit);
}

// ===================== COLETA DO OVERVIEW =====================

var URLReq;
if (game_data.player.sitter > 0) {
    URLReq = 'game.php?t=' + game_data.player.id +
        '&screen=overview_villages&mode=prod&page=-1&';
} else {
    URLReq = 'game.php?&screen=overview_villages&mode=prod&page=-1&';
}

$.get(URLReq, function () {
    console.log('Overview capturado');
}).done(function (page) {

    // só desktop (é o seu caso)
    allWoodObjects = $(page).find('.res.wood,.warn_90.wood,.warn.wood');
    allClayObjects = $(page).find('.res.stone,.warn_90.stone,.warn.stone');
    allIronObjects = $(page).find('.res.iron,.warn_90.iron,.warn.iron');
    allVillages = $(page).find('.quickedit-vn');

    // wood
    for (var i = 0; i < allWoodObjects.length; i++) {
        var n = allWoodObjects[i].textContent;
        n = n.replace(/\./g, '').replace(',', '');
        allWoodTotals.push(parseInt(n, 10) || 0);
    }
    // clay
    for (var j = 0; j < allClayObjects.length; j++) {
        var c = allClayObjects[j].textContent;
        c = c.replace(/\./g, '').replace(',', '');
        allClayTotals.push(parseInt(c, 10) || 0);
    }
    // iron
    for (var k = 0; k < allIronObjects.length; k++) {
        var ir = allIronObjects[k].textContent;
        ir = ir.replace(/\./g, '').replace(',', '');
        allIronTotals.push(parseInt(ir, 10) || 0);
    }

    // capacidade armazém
    for (var w = 0; w < allVillages.length; w++) {
        var wh = allIronObjects[w].parentElement.nextElementSibling.innerHTML;
        wh = wh.replace(/\./g, '').replace(',', '');
        warehouseCapacity.push(parseInt(wh, 10) || 0);
    }

    // mercadores
    for (var m = 0; m < allVillages.length; m++) {
        var merchText =
            allIronObjects[m].parentElement.nextElementSibling.nextElementSibling.innerText;
        var mMatch = merchText.match(/(\d+)\s*\/\s*(\d+)/);
        if (mMatch) {
            availableMerchants.push(parseInt(mMatch[1], 10) || 0);
            totalMerchants.push(parseInt(mMatch[2], 10) || 0);
        } else {
            availableMerchants.push(0);
            totalMerchants.push(0);
        }
    }

    // população (não precisamos muito, mas deixo igual)
    for (var f = 0; f < allVillages.length; f++) {
        var farmText =
            allIronObjects[f].parentElement.nextElementSibling.nextElementSibling.nextElementSibling.innerText;
        var fMatch = farmText.match(/(\d+)\s*\/\s*(\d+)/);
        if (fMatch) {
            farmSpaceUsed.push(parseInt(fMatch[1], 10) || 0);
            farmSpaceTotal.push(parseInt(fMatch[2], 10) || 0);
        } else {
            farmSpaceUsed.push(0);
            farmSpaceTotal.push(0);
        }
    }

    // monta array principal
    for (var idx = 0; idx < allVillages.length; idx++) {
        var coordMatch = allVillages[idx].innerText.trim().match(/\d+\|\d+/);
        villagesData.push({
            id: allVillages[idx].dataset.id,
            url: allVillages[idx].children[0].children[0].href,
            coord: coordMatch ? coordMatch[0] : '',
            name: allVillages[idx].innerText.trim(),
            wood: allWoodTotals[idx],
            stone: allClayTotals[idx],
            iron: allIronTotals[idx],
            availableMerchants: availableMerchants[idx],
            totalMerchants: totalMerchants[idx],
            warehouseCapacity: warehouseCapacity[idx],
            farmSpaceUsed: farmSpaceUsed[idx],
            farmSpaceTotal: farmSpaceTotal[idx]
        });
    }

    // só depois de ter villagesData pronta, perguntar coordenada
    askCoordinate();
});

// ===================== UI / POPUP COORD =====================

function askCoordinate() {
    var content =
        '<div style="max-width:1000px;">' +
        '<h2 class="popup_box_header">' +
        '<center><u><font color="darkgreen">' + langShinko[0] + '</font></u></center>' +
        '</h2><hr>' +
        '<p><center><font color="maroon"><b>' + langShinko[1] + '</b></font></center></p>' +
        '<center><table>' +
        '<tr><td><center>' +
        '<input type="text" id="coordinateTargetFirstTime" size="20">' +
        '</center></td></tr>' +
        '<tr><td><center>' +
        '<input type="button" class="btn evt-cancel-btn btn-confirm-yes" id="saveCoord" value="' + langShinko[2] + '">' +
        '</center></td></tr>' +
        '</table></center>' +
        '<br><hr>' +
        '<center><p>' + langShinko[3] + ': ' +
        '<a href="https://shinko-to-kuma.my-free.website/" target="_blank">Sophie "Shinko to Kuma"</a>' +
        '</p></center>' +
        '</div>';

    Dialog.show('recursosA', content);

    $('#saveCoord').off('click').on('click', function () {
        var val = $('#coordinateTargetFirstTime').val();
        var m = val.match(/\d+\|\d+/);
        if (!m) {
            alert('Coordenada inválida');
            return;
        }
        coordinate = m[0];
        sessionStorage.setItem('coordinate', coordinate);
        var closeBtn = document.getElementsByClassName('popup_box_close');
        if (closeBtn[0]) closeBtn[0].click();
        coordToId(coordinate);
    });
}

// ===================== BUSCA ID DA COORD =====================

function coordToId(coordinate) {
    var sitterID;
    if (game_data.player.sitter > 0) {
        sitterID = 'game.php?t=' + game_data.player.id +
            '&screen=api&ajax=target_selection&input=' + coordinate + '&type=coord';
    } else {
        sitterID = 'game.php?&screen=api&ajax=target_selection&input=' + coordinate + '&type=coord';
    }

    $.get(sitterID, function (json) {
        var localData;
        if (parseFloat(game_data.majorVersion) > 8.217) localData = json;
        else localData = JSON.parse(json);

        sendBack = [
            localData.villages[0].id,
            localData.villages[0].name,
            localData.villages[0].image,
            localData.villages[0].player_name,
            localData.villages[0].points,
            localData.villages[0].x,
            localData.villages[0].y
        ];
        createList();
    });
}

// ===================== CÁLCULO DE RECURSOS =====================

function calculateResAmounts(wood, stone, iron, warehouse, merchants) {
    var merchantCarry = merchants * 1000;

    // quanto queremos deixar no armazém
    var leaveBehindRes = Math.floor(warehouse / 100 * resLimit);

    var localWood = Math.max(0, wood - leaveBehindRes);
    var localStone = Math.max(0, stone - leaveBehindRes);
    var localIron = Math.max(0, iron - leaveBehindRes);

    var merchantWood = merchantCarry * woodPercentage;
    var merchantStone = merchantCarry * stonePercentage;
    var merchantIron = merchantCarry * ironPercentage;

    var perc = 1;
    if (merchantWood > localWood && merchantWood > 0) {
        perc = localWood / merchantWood;
        merchantWood *= perc; merchantStone *= perc; merchantIron *= perc;
    }
    if (merchantStone > localStone && merchantStone > 0) {
        perc = localStone / merchantStone;
        merchantWood *= perc; merchantStone *= perc; merchantIron *= perc;
    }
    if (merchantIron > localIron && merchantIron > 0) {
        perc = localIron / merchantIron;
        merchantWood *= perc; merchantStone *= perc; merchantIron *= perc;
    }

    return {
        wood: Math.floor(merchantWood),
        stone: Math.floor(merchantStone),
        iron: Math.floor(merchantIron)
    };
}

function checkDistance(x1, y1, x2, y2) {
    var a = x1 - x2;
    var b = y1 - y2;
    return Math.round(Math.hypot(a, b));
}

function numberWithCommas(x) {
    x = x.toString();
    var pattern = /(-?\d+)(\d{3})/;
    while (pattern.test(x)) {
        x = x.replace(pattern, '$1.$2');
    }
    return x;
}

// ===================== CRIA LISTA E UI PRINCIPAL =====================

function createList() {
    // remove UI antiga
    if ($('#sendResources')[0]) $('#sendResources').remove();
    if ($('#resourceSender')[0]) $('#resourceSender').remove();

    // cabeçalho e controles
    var htmlSettings =
        '<div id="resourceSender">' +
        '<table id="Settings" width="700">' +
        '<thead>' +
        '<tr>' +
        '<td class="sophHeader">' + langShinko[7] + '</td>' +
        '<td class="sophHeader">' + langShinko[8] + '</td>' +
        '<td class="sophHeader"></td>' +
        '<td class="sophHeader"></td>' +
        '</tr>' +
        '</thead>' +
        '<tbody>' +
        '<tr>' +
        '<td class="sophRowA">' +
        '<input type="text" id="coordinateTarget" size="20">' +
        '</td>' +
        '<td class="sophRowA" align="right">' +
        '<input type="text" id="resPercent" size="3">%' +
        '</td>' +
        '<td class="sophRowA">' +
        '<button type="button" id="btnSaveCoord" class="btn-confirm-yes">' + langShinko[2] + '</button>' +
        '</td>' +
        '<td class="sophRowA">' +
        '<button type="button" id="btnRecalc" class="btn">' + langShinko[9] + '</button>' +
        '</td>' +
        '</tr>' +
        // linha do loop
        '<tr>' +
        '<td class="sophRowB" colspan="2">' +
        'Loop (segundos entre envios): ' +
        '<input type="number" id="rsLoopDelay" min="1" value="60" style="width:60px;">' +
        '</td>' +
        '<td class="sophRowB">' +
        '<button type="button" id="rsLoopToggle" class="btn">Iniciar loop</button>' +
        '</td>' +
        '<td class="sophRowB">' +
        '<span id="rsLoopStatus" style="color:red;">Loop parado</span>' +
        '</td>' +
        '</tr>' +
        '</tbody>' +
        '</table><br>' +
        '</div>';

    var htmlTable =
        '<div id="sendResources" border="0">' +
        '<table id="tableSend" width="100%">' +
        '<tbody id="appendHere">' +
        '<tr>' +
        '<td class="sophHeader" colspan="7" style="text-align:center">' + langShinko[10] + '</td>' +
        '</tr>' +
        '<tr>' +
        '<td class="sophHeader" style="text-align:center">' + langShinko[11] + '</td>' +
        '<td class="sophHeader" style="text-align:center">' + langShinko[12] + '</td>' +
        '<td class="sophHeader" style="text-align:center">' + langShinko[13] + '</td>' +
        '<td class="sophHeader" style="text-align:center">' + langShinko[14] + '</td>' +
        '<td class="sophHeader" style="text-align:center">' + langShinko[15] + '</td>' +
        '<td class="sophHeader" style="text-align:center">' + langShinko[16] + '</td>' +
        '<td class="sophHeader" style="text-align:center"><font size="1">' + langShinko[18] + '</font></td>' +
        '</tr>' +
        '</tbody>' +
        '</table>' +
        '</div>';

    $("#contentContainer").eq(0).prepend(htmlTable);
    $("#contentContainer").eq(0).prepend(htmlSettings);

    $('#resPercent').val(resLimit);
    $('#coordinateTarget').val(coordinate || '');

    // Info do alvo
    $('#resourceSender').prepend(
        '<table id="playerTarget" width="700">' +
        '<tbody>' +
        '<tr>' +
        '<td class="sophHeader" rowspan="3"><img src="' + sendBack[2] + '"></td>' +
        '<td class="sophHeader">' + langShinko[4] + ':</td>' +
        '<td class="sophRowA">' + sendBack[3] + '</td>' +
        '<td class="sophHeader"><span class="icon header wood"></span></td>' +
        '<td class="sophRowB" id="woodSent"></td>' +
        '</tr>' +
        '<tr>' +
        '<td class="sophHeader">' + langShinko[5] + ':</td>' +
        '<td class="sophRowB">' + sendBack[1] + '</td>' +
        '<td class="sophHeader"><span class="icon header stone"></span></td>' +
        '<td class="sophRowA" id="stoneSent"></td>' +
        '</tr>' +
        '<tr>' +
        '<td class="sophHeader">' + langShinko[6] + ':</td>' +
        '<td class="sophRowA">' + sendBack[4] + '</td>' +
        '<td class="sophHeader"><span class="icon header iron"></span></td>' +
        '<td class="sophRowB" id="ironSent"></td>' +
        '</tr>' +
        '</tbody>' +
        '</table>'
    );

    // Monta linhas das aldeias
    var listHTML = '';
    for (var i = 0; i < villagesData.length; i++) {
        if (villagesData[i].id == sendBack[0]) continue;

        var res = calculateResAmounts(
            villagesData[i].wood,
            villagesData[i].stone,
            villagesData[i].iron,
            villagesData[i].warehouseCapacity,
            villagesData[i].availableMerchants
        );

        if (res.wood + res.stone + res.iron === 0) continue;

        var rowClass = (i % 2 === 0) ? 'sophRowB' : 'sophRowA';
        listHTML +=
            '<tr id="row_' + i + '" class="' + rowClass + '" height="40">' +
            '<td><a href="' + villagesData[i].url + '" style="color:#40D0E0;">' + villagesData[i].name + '</a></td>' +
            '<td><a href="#" style="color:#40D0E0;">' + sendBack[1] + '</a></td>' +
            '<td>' + checkDistance(sendBack[5], sendBack[6],
                villagesData[i].coord.substring(0, 3),
                villagesData[i].coord.substring(4, 7)) + '</td>' +
            '<td style="text-align:center">' + res.wood + '<span class="icon header wood"></span></td>' +
            '<td style="text-align:center">' + res.stone + '<span class="icon header stone"></span></td>' +
            '<td style="text-align:center">' + res.iron + '<span class="icon header iron"></span></td>' +
            '<td style="text-align:center">' +
            '<input type="button" class="btn evt-confirm-btn btn-confirm-yes rs-send-btn" ' +
            'value="' + langShinko[17] + '" ' +
            'onclick="sendResource(' + villagesData[i].id + ',' + sendBack[0] + ',' +
            res.wood + ',' + res.stone + ',' + res.iron + ',\'row_' + i + '\')">' +
            '</td>' +
            '</tr>';
    }
    $('#appendHere').append(listHTML);

    // Botão salvar coordenada / reslimit
    $('#btnSaveCoord').off('click').on('click', function () {
        var val = $('#coordinateTarget').val();
        var m = val.match(/\d+\|\d+/);
        if (m) {
            coordinate = m[0];
            sessionStorage.setItem('coordinate', coordinate);
        }
        resLimit = parseInt($('#resPercent').val(), 10) || 0;
        sessionStorage.setItem('resLimit', resLimit);
        alert('Config salva.');
    });

    // Botão recalc (recarrega a lista usando mesma coord)
    $('#btnRecalc').off('click').on('click', function () {
        coordToId(coordinate);
    });

    // Botão loop
    $('#rsLoopToggle').off('click').on('click', function () {
        if (rsLoop.running) {
            stopResLoop();
        } else {
            startResLoop();
        }
    });
}

// ===================== LOOP =====================

function findNextSendButton() {
    var $btns = $('.rs-send-btn:enabled');
    if ($btns.length > 0) return $btns.first()[0];
    return null;
}

function rsLoopTick() {
    var btn = findNextSendButton();
    if (!btn) {
        stopResLoop();
        alert('Terminou: nenhuma aldeia restante para enviar.');
        return;
    }
    btn.click();
}

function startResLoop() {
    var delayInput = document.getElementById('rsLoopDelay');
    var secs = 60;
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

    // manda o primeiro imediatamente
    rsLoopTick();
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

// ===================== ENVIO DE RECURSOS =====================

function sendResource(sourceID, targetID, woodAmount, stoneAmount, ironAmount, rowId) {
    $('.rs-send-btn').prop('disabled', true);

    setTimeout(function () {
        $('#' + rowId).remove();
        $('.rs-send-btn').prop('disabled', false);
        if ($('#tableSend tr').length <= 2) {
            stopResLoop();
            alert('Finished sending!');
        }
    }, 200);

    var payload = {
        target_id: targetID,
        wood: woodAmount,
        stone: stoneAmount,
        iron: ironAmount
    };

    TribalWars.post('market', {
        ajaxaction: 'map_send',
        village: sourceID
    }, payload, function (resp) {
        Dialog.close();
        UI.SuccessMessage(resp.message);
        console.log(resp.message);

        totalWoodSent += woodAmount;
        totalStoneSent += stoneAmount;
        totalIronSent += ironAmount;
        $('#woodSent').text(numberWithCommas(totalWoodSent));
        $('#stoneSent').text(numberWithCommas(totalStoneSent));
        $('#ironSent').text(numberWithCommas(totalIronSent));
    }, false);
}
