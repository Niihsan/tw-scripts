(function () {
    'use strict';

    const LOG_PREFIX = '[TW Agendar Chegada ATQ/APO]';

    function log() {
        console.log.apply(console, [LOG_PREFIX].concat(Array.from(arguments)));
    }

    // -------------------------------
    // BOTÃO "ENVIAR" (ataque/apoio)
    // -------------------------------
    function getConfirmButton() {
        // 1) ID clássico
        let b = document.querySelector('#troop_confirm_go');
        if (b) return b;

        // 2) Classe nova
        b = document.querySelector('.btn-confirm-attack');
        if (b) return b;

        // 3) Inputs com value "Enviar ataque" ou "Enviar apoio"
        b = document.querySelector(
            'input[type=submit][value="Enviar ataque"], input[type=submit][value="Enviar apoio"]'
        );
        if (b) return b;

        // 4) Qualquer botão/input com texto contendo "enviar ataque" ou "enviar apoio"
        const all = document.querySelectorAll('button, input[type=submit]');
        for (const el of all) {
            const txt = (el.textContent || el.value || '').trim().toLowerCase();
            if (txt.includes('enviar ataque') || txt.includes('enviar apoio')) {
                return el;
            }
        }
        return null;
    }

    // -------------------------------
    // FORMULÁRIO DE CONFIRMAÇÃO
    // (para disparar via submit, seja ATQ ou APO)
    // -------------------------------
    function getCommandForm() {
        let f = document.querySelector('form[action*="command"]');
        if (f) return f;
        f = document.querySelector('form');
        return f || null;
    }

    // -------------------------------
    // DETECTAR TELA DE CONFIRMAÇÃO
    // (ataque ou apoio)
    // -------------------------------
    function isConfirmScreen() {
        // basta ter form de comando + serverTime
        return !!getCommandForm() && !!document.querySelector('#serverTime');
    }

    // -------------------------------
    // HORA DO SERVIDOR (HH:MM:SS)
    // -------------------------------
    function getServerHMS() {
        const timeEl = document.querySelector('#serverTime');
        if (!timeEl) return null;
        const timeStr = timeEl.textContent.trim();
        const parts = timeStr.split(':');
        if (parts.length !== 3) return null;
        const hh = parseInt(parts[0], 10);
        const mm = parseInt(parts[1], 10);
        const ss = parseInt(parts[2], 10);
        if (isNaN(hh) || isNaN(mm) || isNaN(ss)) return null;
        return { hh, mm, ss };
    }

    function hmsToSec(hh, mm, ss) {
        return ((hh * 60) + mm) * 60 + ss;
    }

    function formatTime(hh, mm, ss, ms) {
        const H = String(hh).padStart(2, '0');
        const M = String(mm).padStart(2, '0');
        const S = String(ss).padStart(2, '0');
        const MS = String(ms || 0).padStart(3, '0');
        return H + ':' + M + ':' + S + '.' + MS;
    }

    // -------------------------------
    // PEGAR "Duração" DO PAINEL
    // (igual para ataque e apoio)
    // -------------------------------
    function getDurationMs() {
        const tds = document.querySelectorAll('table tr td');
        for (let i = 0; i < tds.length; i++) {
            const label = (tds[i].innerText || '').trim().toLowerCase();
            if (label.startsWith('duração') || label.startsWith('duration')) {
                const valueTd = tds[i + 1];
                if (!valueTd) break;
                const match = (valueTd.innerText || '').trim().match(/(\d{1,2}):(\d{2}):(\d{2})/);
                if (!match) break;
                const hh = parseInt(match[1], 10);
                const mm = parseInt(match[2], 10);
                const ss = parseInt(match[3], 10);
                const ms = ((hh * 60 + mm) * 60 + ss) * 1000;
                log('Duração lida:', valueTd.innerText.trim(), '=>', ms, 'ms');
                return ms;
            }
        }
        log('Não consegui ler a Duração.');
        return null;
    }

    // -------------------------------
    // PARSE HH:MM:SS.mmm (mmm opcional)
    // -------------------------------
    function parseTimeWithMs(str) {
        const m = str.match(/^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
        if (!m) return null;
        const hh = parseInt(m[1], 10);
        const mm = parseInt(m[2], 10);
        const ss = parseInt(m[3], 10);
        let ms = 0;
        if (m[4]) {
            const pad = (m[4] + '000').slice(0, 3);
            ms = parseInt(pad, 10);
        }
        return { hh, mm, ss, ms };
    }

    // -------------------------------
    // UI (ataque + apoio)
    // -------------------------------
    function createSchedulerUI() {
        const confirmBtn = getConfirmButton();
        const form = getCommandForm();

        if (!form) {
            alert('Agendador: não achei o formulário de comando nesta tela.');
            return;
        }

        if (document.querySelector('#tw-attack-scheduler-box')) {
            return; // já existe
        }

        const box = document.createElement('div');
        box.id = 'tw-attack-scheduler-box';
        box.style.border = '1px solid #804000';
        box.style.padding = '6px';
        box.style.marginTop = '6px';
        box.style.background = '#f5e4c8';
        box.style.fontSize = '11px';

        box.innerHTML =
            '<strong>Agendar por HORA DE CHEGADA (ATAQUE/APOIO - hora do servidor)</strong><br>' +
            'Chegada desejada (HH:MM:SS.mmm): ' +
            '<input type="text" id="tw-attack-time" placeholder="07:39:54.250" ' +
            'style="width:110px; font-size:11px;">' +
            '&nbsp;Offset envio (ms, negativo = mais cedo): ' +
            '<input type="text" id="tw-attack-offset" value="-600" ' +
            'style="width:60px; font-size:11px;" ' +
            'title="Ajuste fino. Ex: -600 = envia ~0,6s antes.">' +
            '<button type="button" id="tw-attack-schedule" ' +
            'style="font-size:11px; margin-left:4px;">Agendar</button>' +
            '<div id="tw-attack-status" ' +
            'style="margin-top:4px; font-size:11px; color:#804000;">' +
            'Aguardando horário...</div>';

        if (confirmBtn && confirmBtn.parentElement) {
            confirmBtn.parentElement.appendChild(box);
        } else {
            form.appendChild(box);
        }

        const inputTime = box.querySelector('#tw-attack-time');
        const inputOffset = box.querySelector('#tw-attack-offset');
        const btn = box.querySelector('#tw-attack-schedule');
        const status = box.querySelector('#tw-attack-status');

        let coarseTimeout = null;
        let fineInterval = null;
        let countdownInterval = null;
        let fired = false;

        function clearTimers() {
            if (coarseTimeout) {
                clearTimeout(coarseTimeout);
                coarseTimeout = null;
            }
            if (fineInterval) {
                clearInterval(fineInterval);
                fineInterval = null;
            }
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }
        }

        function fire() {
            if (fired) return;
            fired = true;
            clearTimers();
            status.textContent = 'Enviando comando AGORA...';
            log('Submetendo formulário de comando via submit().');
            form.submit(); // funciona tanto pra ataque quanto pra apoio
        }

        btn.addEventListener('click', function () {
            clearTimers();
            fired = false;

            const raw = (inputTime.value || '').trim();
            const parsed = parseTimeWithMs(raw);
            if (!parsed) {
                alert('Formato inválido. Use HH:MM:SS.mmm (ex: 07:39:54.250) ou sem milissegundos.');
                return;
            }

            let offsetMs = Number((inputOffset.value || '').replace(',', '.'));
            if (isNaN(offsetMs)) offsetMs = 0;

            const serverHMS = getServerHMS();
            if (!serverHMS) {
                alert('Não foi possível ler a hora do servidor.');
                return;
            }

            const durationMs = getDurationMs();
            if (durationMs == null) {
                alert('Não consegui ler a Duração (linha "Duração:" na tabela).');
                return;
            }

            const nowSec = hmsToSec(serverHMS.hh, serverHMS.mm, serverHMS.ss);

            // chegada desejada em segundos + ms (no "dia do servidor")
            const arrivalSecBase = hmsToSec(parsed.hh, parsed.mm, parsed.ss);
            let arrivalSec = arrivalSecBase;
            if (arrivalSec <= nowSec) {
                arrivalSec += 24 * 3600; // próximo dia
            }
            const arrivalMsTotal = arrivalSec * 1000 + (parsed.ms || 0);

            // envio = chegada - duração + offset
            let sendMsTotal = arrivalMsTotal - durationMs + offsetMs;

            // segundos de envio (para exibir HH:MM:SS.mmm relativos ao servidor)
            let sendSecTotal = Math.floor(sendMsTotal / 1000);
            let sendMs = ((sendMsTotal % 1000) + 1000) % 1000;

            // normaliza dentro de 0–24h (exibição)
            let sendSecDay = ((sendSecTotal % (24 * 3600)) + (24 * 3600)) % (24 * 3600);
            const sendH = Math.floor(sendSecDay / 3600);
            const sendM = Math.floor((sendSecDay % 3600) / 60);
            const sendS = sendSecDay % 60;

            // delay a partir de agora (em ms)
            const nowMsTotal = nowSec * 1000;
            let delayMs = sendMsTotal - nowMsTotal;
            while (delayMs <= 0) {
                delayMs += 24 * 3600 * 1000; // próximo dia, segurança
            }

            const arrivalStr = formatTime(parsed.hh, parsed.mm, parsed.ss, parsed.ms || 0);
            const sendStr = formatTime(sendH, sendM, sendS, sendMs);

            log('Servidor agora:', serverHMS, 'seg:', nowSec);
            log('Chegada alvo:', arrivalStr, 'Envio (srv):', sendStr, 'delayMs:', delayMs, 'offsetMs:', offsetMs);

            status.textContent =
                'Chegada alvo: ' + arrivalStr +
                ' | Envio (calculado): ' + sendStr +
                ' | Offset: ' + offsetMs + ' ms';

            // Contagem regressiva (visual)
            const baseNow = performance.now();
            countdownInterval = setInterval(function () {
                const now = performance.now();
                const elapsed = now - baseNow;
                const remaining = delayMs - elapsed;
                if (remaining <= 0) {
                    clearInterval(countdownInterval);
                    countdownInterval = null;
                    return;
                }
                const totalMs = remaining;
                const totalSec = Math.floor(totalMs / 1000);
                const ms = totalMs % 1000;
                const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
                const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
                const s = String(totalSec % 60).padStart(2, '0');
                const msStr = String(ms).padStart(3, '0');
                status.textContent =
                    'Envio em: ' + h + ':' + m + ':' + s + '.' + msStr +
                    ' | Chegada alvo: ' + arrivalStr +
                    ' | Envio calc.: ' + sendStr +
                    ' | Offset: ' + offsetMs + ' ms';
            }, 50);

            // Disparo: grosso + fino com performance.now()
            const start = performance.now();
            const remainingInitial = delayMs;

            if (remainingInitial <= 2000) {
                fineInterval = setInterval(function () {
                    if (performance.now() - start >= delayMs) {
                        fire();
                    }
                }, 5);
            } else {
                const coarseDelay = remainingInitial - 1500;
                coarseTimeout = setTimeout(function () {
                    fineInterval = setInterval(function () {
                        if (performance.now() - start >= delayMs) {
                            fire();
                        }
                    }, 5);
                }, coarseDelay);
            }
        });

        log('UI de agendamento criada (ataque/apoio).');
    }

    function init() {
        if (!isConfirmScreen()) {
            alert('Agendador: esta tela não parece a de CONFIRMAÇÃO de comando (ataque/apoio).');
            return;
        }
        createSchedulerUI();
    }

    init();
})();
