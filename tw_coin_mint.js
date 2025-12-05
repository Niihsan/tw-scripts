// TW – Painel de Cunhagem de Moedas (Academia)
// Cunha sempre o MÁXIMO possível (ex: "(4) Cunhar") e repete a cada X minutos.

(function () {
    'use strict';

    // Evitar inicializar duas vezes na mesma página
    if (window.twCoinPanelInit) return;
    window.twCoinPanelInit = true;

    var d = document;

    function q(sel, ctx) {
        return (ctx || d).querySelector(sel);
    }

    function log() {
        try {
            console.log.apply(console, arguments);
        } catch (e) {}
    }

    // Procura o formulário de cunhagem
    function getCoinForm() {
        var form = q('form[action*="mode=coin"]') ||
                   q('form[action*="coin"]') ||
                   q('form') ||
                   d.forms[0];
        return form || null;
    }

    // Procura o input de quantidade de moedas
    function getCoinInput(form) {
        if (!form) return null;
        return form.querySelector('input[name="coin"],input[name="coin_count"],input[type="number"],input[type="text"]');
    }

    // Lê o MÁXIMO de moedas possível a partir do texto "(4) Cunhar"
    function getMaxCoinsFromPage(form) {
        if (!form) return null;
        var els = form.querySelectorAll('td, span, a, button, strong, label, div');
        for (var i = 0; i < els.length; i++) {
            var txt = (els[i].textContent || '').trim();
            if (!txt) continue;

            // formatos: "(4) Cunhar" ou "Cunhar (4)"
            var m = txt.match(/\((\d+)\)\s*Cunhar/i) || txt.match(/Cunhar\s*\((\d+)\)/i);
            if (m) {
                var n = parseInt(m[1], 10);
                if (!isNaN(n)) return n;
            }
        }
        return null;
    }

    // Envia a requisição de cunhagem via fetch, sem recarregar a página
    function sendMintRequest(form) {
        if (!form) return;

        var action = form.action || window.location.href;
        var method = (form.method || 'POST').toUpperCase();
        if (method !== 'POST') method = 'POST';

        var fd = new FormData(form);

        fetch(action, {
            method: method,
            body: fd,
            credentials: 'same-origin'
        }).then(function (resp) {
            log('Cunhagem requisitada. Status:', resp.status);
        }).catch(function (err) {
            console.error('Erro ao enviar cunhagem:', err);
        });
    }

    // Tenta cunhar o MÁXIMO possível neste exato momento
    function tryMintMax() {
        if (location.href.indexOf('screen=snob') === -1) {
            log('Fora da Academia (screen=snob); parando loop se existir.');
            stopLoop();
            return;
        }

        var form = getCoinForm();
        if (!form) {
            log('Formulário de cunhagem não encontrado.');
            return;
        }

        var coinInput = getCoinInput(form);
        if (!coinInput) {
            log('Input de moedas não encontrado.');
            return;
        }

        // Lê o máximo a partir de "(4) Cunhar"
        var maxCoins = getMaxCoinsFromPage(form);
        if (maxCoins === null) {
            log('Não foi possível detectar o máximo de moedas na página.');
            return;
        }
        if (maxCoins <= 0) {
            log('Máximo detectado é 0 – sem moedas para cunhar.');
            return;
        }

        // Seta o input exatamente com o máximo detectado (ex: 4)
        coinInput.value = String(maxCoins);
        log('Cunhando máximo detectado:', maxCoins);

        // Envia a requisição via fetch (sem recarregar a página)
        sendMintRequest(form);
    }

    // Controle do loop
    if (!window.twCoinLoop) {
        window.twCoinLoop = {
            timer: null,
            delayMs: 10 * 60 * 1000 // padrão: 10 minutos
        };
    }

    function stopLoop() {
        if (window.twCoinLoop.timer) {
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
        stopLoop();

        var delayInput = d.getElementById('twCoinDelayMin');
        var minutes = 10; // padrão
        if (delayInput) {
            var v = parseFloat(delayInput.value.replace(',', '.'));
            if (!isNaN(v) && v > 0) {
                minutes = v;
            }
        }

        var ms = minutes * 60 * 1000;
        window.twCoinLoop.delayMs = ms;
        window.twCoinLoop.timer = setInterval(tryMintMax, ms);

        var st = d.getElementById('twCoinStatus');
        var bt = d.getElementById('twCoinStartStop');
        if (st) {
            st.textContent = 'Loop rodando a cada ' + minutes + ' minuto(s)';
            st.style.color = 'green';
        }
        if (bt) {
            bt.textContent = 'Parar loop';
        }

        // Já tenta cunhar uma vez agora
        tryMintMax();
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
                'Delay checagem (min): ' +
                '<input id="twCoinDelayMin" type="number" min="0.1" step="0.1" value="10" style="width:60px;">' +
            '</div>' +
            '<div style="margin-bottom:4px;">' +
                '<button id="twCoinMintOnce" style="margin-right:4px;">Cunhar AGORA (máx)</button>' +
                '<button id="twCoinStartStop">Iniciar loop</button>' +
            '</div>' +
            '<div id="twCoinStatus" style="font-weight:bold;color:red;">Loop parado</div>';

        d.body.appendChild(panel);

        d.getElementById('twCoinMintOnce').onclick = function (e) {
            e.preventDefault();
            tryMintMax();
        };

        d.getElementById('twCoinStartStop').onclick = function (e) {
            e.preventDefault();
            if (window.twCoinLoop.timer) {
                stopLoop();
            } else {
                startLoop();
            }
        };
    }

    if (d.readyState === 'complete' || d.readyState === 'interactive') {
        createPanel();
    } else {
        d.addEventListener('DOMContentLoaded', createPanel);
    }

})();
