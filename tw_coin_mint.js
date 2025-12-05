// TW – Painel de Cunhagem de Moedas (Academia)
// Versão "externa" para carregar pela barra de acesso rápido

(function () {
    'use strict';

    // Evitar inicializar duas vezes
    if (window.twCoinPanelInit) return;
    window.twCoinPanelInit = true;

    var d = document;

    function q(sel, ctx) {
        return (ctx || d).querySelector(sel);
    }

    function clickMax(form) {
        var list = form.querySelectorAll('a,span,button');
        for (var i = 0; i < list.length; i++) {
            var t = (list[i].textContent || '').trim().toLowerCase();
            if (t === 'máx' || t === 'max' || t.indexOf('máximo') >= 0) {
                list[i].click();
                return true;
            }
        }
        return false;
    }

    function tryMint() {
        if (location.href.indexOf('screen=snob') === -1) {
            console.log('Fora da academia; parando loop.');
            stopLoop();
            return;
        }

        var form = q('form') || d.forms[0];
        if (!form) {
            console.log('Formulário de cunhagem não encontrado.');
            return;
        }

        // tenta usar "máx" se existir
        clickMax(form);

        var coinInput = form.querySelector('input[name="coin"],input[name="coin_count"],input[type="number"],input[type="text"]');
        if (coinInput) {
            var v = parseInt(coinInput.value, 10);
            if (!v || v <= 0 || isNaN(v)) {
                console.log('Sem moedas para cunhar (campo vazio ou zero).');
                return;
            }
        }

        var btn = form.querySelector('input[type="submit"][name="coin"],input[type="submit"],button[type="submit"]');
        if (!btn) {
            console.log('Botão de cunhagem não encontrado.');
            return;
        }

        btn.click();
    }

    function stopLoop() {
        if (window.twCoinLoop && window.twCoinLoop.timer) {
            clearInterval(window.twCoinLoop.timer);
            window.twCoinLoop.timer = null;
        }
        var st = d.getElementById('twCoinStatus');
        var bt = d.getElementById('twCoinStartStop');
        if (st) {
            st.textContent = 'Loop parado';
            st.style.color = 'red';
        }
        if (bt) {
            bt.textContent = 'Iniciar loop';
        }
    }

    function startLoop() {
        if (!window.twCoinLoop) window.twCoinLoop = { timer: null, delay: 30000 };

        stopLoop();

        var delayInput = d.getElementById('twCoinDelay');
        var ms = 30000;
        if (delayInput) {
            var v = parseInt(delayInput.value, 10);
            if (v && v > 0) ms = v * 1000;
        }

        window.twCoinLoop.delay = ms;
        window.twCoinLoop.timer = setInterval(tryMint, ms);

        var st = d.getElementById('twCoinStatus');
        var bt = d.getElementById('twCoinStartStop');
        if (st) {
            st.textContent = 'Loop rodando a cada ' + (ms / 1000) + 's';
            st.style.color = 'green';
        }
        if (bt) {
            bt.textContent = 'Parar loop';
        }

        // Já tenta cunhar uma vez na hora que inicia
        tryMint();
    }

    function createPanel() {
        if (location.href.indexOf('screen=snob') === -1) {
            alert('Abra a Academia (screen=snob) na aba de cunhagem de moedas.');
            return;
        }

        if (d.getElementById('twCoinPanel')) return;

        var panel = d.createElement('div');
        panel.id = 'twCoinPanel';
        panel.style.position = 'fixed';
        panel.style.top = '100px';
        panel.style.right = '10px';
        panel.style.zIndex = '99999';
        panel.style.background = '#f4e4c8';
        panel.style.border = '1px solid #c1a264';
        panel.style.padding = '6px';
        panel.style.fontSize = '11px';
        panel.style.boxShadow = '0 0 6px rgba(0,0,0,0.4)';

        panel.innerHTML =
            '<div style="font-weight:bold;margin-bottom:4px;text-align:center;">Cunhagem de Moedas</div>' +
            '<div style="margin-bottom:4px;">' +
                'Delay checagem (s): ' +
                '<input id="twCoinDelay" type="number" min="5" value="30" style="width:50px;">' +
            '</div>' +
            '<div style="margin-bottom:4px;">' +
                '<button id="twCoinMintOnce" style="margin-right:4px;">Cunhar agora</button>' +
                '<button id="twCoinStartStop">Iniciar loop</button>' +
            '</div>' +
            '<div id="twCoinStatus" style="font-weight:bold;color:red;">Loop parado</div>';

        d.body.appendChild(panel);

        d.getElementById('twCoinMintOnce').onclick = function (e) {
            e.preventDefault();
            tryMint();
        };

        d.getElementById('twCoinStartStop').onclick = function (e) {
            e.preventDefault();
            if (window.twCoinLoop && window.twCoinLoop.timer) {
                stopLoop();
            } else {
                startLoop();
            }
        };
    }

    // Inicializa painel
    if (d.readyState === 'complete' || d.readyState === 'interactive') {
        createPanel();
    } else {
        d.addEventListener('DOMContentLoaded', createPanel);
    }

})();
