// TW – Painel de Cunhagem de Moedas (Academia)
// Cunha sempre o MÁXIMO possível e repete a cada X minutos,
// mostrando no painel o novo total de moedas e o novo "máx" sem recarregar a página.

(function () {
    'use strict';

    // Evita inicializar duas vezes
    if (window.twCoinPanelInit) return;
    window.twCoinPanelInit = true;

    var d = document;

    // estado global para guardar info vinda da última resposta
    window.twCoinState = window.twCoinState || {
        maxOverride: null,
        lastTotal: null
    };

    function q(sel, ctx) {
        return (ctx || d).querySelector(sel);
    }

    function log() {
        try {
            console.log.apply(console, arguments);
        } catch (e) {}
    }

    // ---------- helpers DOM da página atual ----------

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

    // pega o número entre parênteses no mesmo <td> do input (ex: "(4)")
    function getMaxCoinsFromDOM(form) {
        if (!form) return null;
        var input = getCoinInput(form);
        if (!input) return null;

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

        // fallback: qualquer "(n)" no form
        var mAll = (form.textContent || '').match(/\((\d+)\)/);
        if (mAll) {
            var nAll = parseInt(mAll[1], 10);
            if (!isNaN(nAll)) return nAll;
        }

        return null;
    }

    // usa override se existir, senão lê do DOM
    function getMaxCoins(form) {
        if (
            window.twCoinState &&
            typeof window.twCoinState.maxOverride === 'number'
        ) {
            return window.twCoinState.maxOverride;
        }
        return getMaxCoinsFromDOM(form);
    }

    // ---------- parse da resposta HTML do servidor ----------

    function updateStateFromHtml(html) {
        // novo total de moedas: procura "Moedas de ouro ... Total: </td><td>415"
        var totalMatch = html.match(
            /Moedas de ouro[\s\S]*?Total:\s*<\/td>\s*<td[^>]*>(\d+)<\/td>/i
        );
        if (totalMatch) {
            window.twCoinState.lastTotal = parseInt(totalMatch[1], 10);
        }

        // novo "máx": algum "(n)" perto de "Cunhar moedas de ouro" ou de "Cunhar"
        var maxMatch =
            html.match(/Cunhar moedas de ouro[\s\S]*?\((\d+)\)/i) ||
            html.match(/\((\d+)\)\s*Cunhar/i);
        if (maxMatch) {
            window.twCoinState.maxOverride = parseInt(maxMatch[1], 10);
        }

        var st = d.getElementById('twCoinStatus');
        if (st) {
            var parts = [];
            if (window.twCoinState.lastTotal != null) {
                parts.push('Total: ' + window.twCoinState.lastTotal);
            }
            if (window.twCoinState.maxOverride != null) {
                parts.push('Máx atual: ' + window.twCoinState.maxOverride);
            }
            if (parts.length) {
                st.textContent = 'Última cunhagem OK. ' + parts.join(' | ');
                st.style.color = 'green';
            }
        }
    }

    // ---------- envio da cunhagem via fetch ----------

    function sendMintRequest(form) {
        if (!form) return;

        var action = form.action || window.location.href;
        var method = (form.method || 'POST').toUpperCase();
        if (method !== 'POST') method = 'POST';

        var fd = new FormData(form);

        // simula o clique no botão "coin"
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
                return resp.text().then(function (html) {
                    log('Cunhagem requisitada. Status:', resp.status);
                    updateStateFromHtml(html);
                });
            })
            .catch(function (err) {
                console.error('Erro ao enviar cunhagem:', err);
                alert('Erro ao enviar cunhagem (veja console).');
            });
    }

    // ---------- cunhar máximo agora ----------

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

        var maxCoins = getMaxCoins(form);
        if (maxCoins == null) {
            log('Não foi possível detectar o máximo de moedas.');
            alert(
                'Script: não achei o número máximo de moedas no HTML. Verifique se há um "(n)" ao lado do campo.'
            );
            return;
        }
        if (maxCoins <= 0) {
            log('Máx detectado = 0 – sem moedas para cunhar agora.');
            return;
        }

        coinInput.value = String(maxCoins);
        log('Cunhando máximo detectado:', maxCoins);

        sendMintRequest(form);
    }

    // ---------- loop ----------

    if (!window.twCoinLoop) {
        window.twCoinLoop = {
            timer: null,
            delayMs: 10 * 60 * 1000
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
            st.textContent =
                'Loop rodando a cada ' + minutes + ' minuto(s). Aguardando próxima cunhagem...';
            st.style.color = 'green';
        }
        if (bt) {
            bt.textContent = 'Parar loop';
        }

        // cunha uma vez imediatamente
        tryMintMax();
    }

    // ---------- painel ----------

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
