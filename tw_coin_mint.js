// TW – Painel de Cunhagem de Moedas (Academia)
// Cunha sempre o MÁXIMO possível (número entre parênteses ao lado do campo)
// e repete a cada X minutos sem recarregar a página.

(function () {
    'use strict';

    // Evitar inicializar duas vezes
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

    // ---- helpers de DOM ----

    function getCoinForm() {
        return (
            q('form[action*="mode=coin"]') ||
            q('form[action*="coin"]') ||
            q('form') ||
            d.forms[0] ||
            null
        );
    }

    function getCoinInput(form) {
        if (!form) return null;
        return form.querySelector(
            'input[name="coin"],input[name="coin_count"],input[type="number"],input[type="text"]'
        );
    }

    function getCoinButton(form) {
        if (!form) return null;
        return (
            form.querySelector('input[type="submit"][name="coin"]') ||
            form.querySelector('input[type="submit"][name]') ||
            form.querySelector('button[type="submit"]')
        );
    }

    // pega o número entre parênteses no mesmo <td> do input
    function getMaxCoinsFromPage(form) {
        if (!form) return null;
        var input = getCoinInput(form);
        if (!input) return null;

        // normalmente o input fica dentro de um <td> junto com "(4)" e o botão
        var node = input.parentNode;
        for (var depth = 0; depth < 3 && node; depth++) {
            if (node.textContent) {
                var m = node.textContent.match(/\((\d+)\)/);
                if (m) {
                    var n = parseInt(m[1], 10);
                    if (!isNaN(n)) return n;
                }
            }
            node = node.parentNode;
        }

        // fallback: procura qualquer "(n)" no form todo
        var mAll = (form.textContent || '').match(/\((\d+)\)/);
        if (mAll) {
            var nAll = parseInt(mAll[1], 10);
            if (!isNaN(nAll)) return nAll;
        }

        return null;
    }

    // envia POST via fetch simulando clique no botão de cunhar
    function sendMintRequest(form) {
        if (!form) return;

        var action = form.action || window.location.href;
        var method = (form.method || 'POST').toUpperCase();
        if (method !== 'POST') method = 'POST';

        var fd = new FormData(form);

        // garante que o botão "coin" vá no POST
        var btn = getCoinButton(form);
        if (btn && btn.name) {
            fd.append(btn.name, btn.value || '1');
        }

        fetch(action, {
            method: method,
            body: fd,
            credentials: 'same-origin'
        })
            .then(function (resp) {
                log('Cunhagem requisitada. Status:', resp.status);
                // opcional: avisar visualmente
                var st = d.getElementById('twCoinStatus');
                if (st) {
                    st.textContent = 'Cunhagem enviada (status ' + resp.status + '). Recarregue depois para ver o saldo.';
                }
            })
            .catch(function (err) {
                console.error('Erro ao enviar cunhagem:', err);
                alert('Erro ao enviar cunhagem (veja console).');
            });
    }

    // Tenta cunhar o máximo possível neste momento
    function tryMintMax() {
        if (location.href.indexOf('screen=snob') === -1) {
            log('Fora da Academia (screen=snob); parando loop.');
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

        var maxCoins = getMaxCoinsFromPage(form);
        if (maxCoins === null) {
            log('Não foi possível detectar o máximo de moedas na página.');
            alert('Script: não achei o número entre parênteses ao lado do campo (ex: (4)).');
            return;
        }
        if (maxCoins <= 0) {
            log('Máximo detectado é 0 – sem moedas para cunhar.');
            return;
        }

        coinInput.value = String(maxCoins);
        log('Cunhando máximo detectado:', maxCoins);

        sendMintRequest(form);
    }

    // ---- controle do loop ----

    if (!window.twCoinLoop) {
        window.twCoinLoop = {
            timer: null,
            delayMs: 10 * 60 * 1000 // 10 minutos padrão
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
        var minutes = 10;
        if (delayInput) {
            var v = parseFloat(delayInput.value.replace(',', '.'));
            if (!isNaN(v) && v > 0) minutes = v;
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

        // cunha já uma vez agora
        tryMintMax();
    }

    // ---- painel ----

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
