(function () {
    'use strict';

    const LOG_PREFIX = '[TW Agendar Chegada]';

    function log() {
        console.log.apply(console, [LOG_PREFIX].concat(Array.from(arguments)));
    }

    // -------------------------------
    // BOTÃO "ENVIAR ATAQUE"
    // -------------------------------
    function getAttackButton() {
        // 1) ID clássico
        let b = document.querySelector('#troop_confirm_go');
        if (b) return b;

        // 2) Classe nova
        b = document.querySelector('.btn-confirm-attack');
        if (b) return b;

        // 3) Input com value exato
        b = document.querySelector('input[type=submit][value="Enviar ataque"]');
        if (b) return b;

        // 4) Qualquer botão/input com texto "Enviar ataque"
        const all = document.querySelectorAll('button, input[type=submit]');
        for (const el of all) {
            const txt = (el.textContent || el.value || '').trim().toLowerCase();
            if (txt.includes('enviar ataque')) return el;
        }
        return null;
    }

    // -------------------------------
    // DETECTAR TELA DE CONFIRMAÇÃO
    // (funciona mesmo com popup do mapa)
    // -------------------------------
    function isConfirmScreen() {
        if (!getAttackButton()) return false;
        const txt = (document.body.innerText || '').toLowerCase();
        return txt.includes('confirmar ataque') || txt.includes('confirm attack');
    }

    // -------------------------------
    // HORA DO SERVIDOR
    // -------------------------------
    function getServerDateTime() {
        const dateEl = document.querySelector('#serverDate');
        const timeEl = document.querySelector('#serverTime');

        if (!dateEl || !timeEl) {
            log('Não encontrei #serverDate ou #serverTime');
            return null;
        }

        const dateStr = dateEl.textContent.trim(); // 26/11/2025 ou 26.11.2025
        const timeStr = timeEl.textContent.trim(); // 02:39:54

        const [day, month, year] = dateStr.includes('.')
            ? dateStr.split('.')
            : dateStr.split('/');

        const [hh, mm, ss] = timeStr.split(':').map(Number);

        return new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hh),
            Number(mm),
            Number(ss)
        );
    }

    // -------------------------------
    // PEGAR "Duração" DO PAINEL
    // -------------------------------
    function getDurationMs() {
        const tds = document.querySelectorAll('table tr td');
        for (let i = 0; i < tds.length; i++) {
            const label = tds[i].innerText.trim().toLowerCase();
            if (label.startsWith('duração') || label.startsWith('duration')) {
                const valueTd = tds[i + 1];
                if (!valueTd) break;
                const m = valueTd.innerText.trim().match(/(\d{1,2}):(\d{2}):(\d{2})/);
                if (!m) break;
                const hh = parseInt(m[1], 10);
                const mm = parseInt(m[2], 10);
                const ss = parseInt(m[3], 10);
                const ms = ((hh * 60 + mm) * 60 + ss) * 1000;
                log('Duração lida:', valueTd.innerText.trim(), '=>', ms, 'ms');
                return ms;
            }
        }
        log('Não consegui ler a Duração.');
        return null;
    }

    // -------------------------------
    // PARSE HH:MM:SS.mmm
    // (mmm opcional)
    // -------------------------------
    function parseTimeWithMs(str) {
        const m = str.match(/^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
        if (!m) return null;
        const hh = parseInt(m[1], 10);
        const mm = parseInt(m[2], 10);
        const ss = parseInt(m[3], 10);
        let ms = 0;
        if (m[4]) {
            // normalizar para 3 dígitos
            const pad = (m[4] + '000').slice(0, 3);
            ms = parseInt(pad, 10);
        }
        return { hh, mm, ss, ms };
    }

    // -------------------------------
    // UI
    // -------------------------------
    function createSchedulerUI() {
        const confirmBtn = getAttackButton();
        if (!confirmBtn) {
            alert('Agendador: não achei o botão de enviar ataque nesta tela.');
            return;
        }

        if (document.querySelector('#tw-attack-scheduler-box')) {
            // Já existe
            return;
        }

        const box = document.createElement('div');
        box.id = 'tw-attack-scheduler-box';
        box.style.border = '1px solid #804000';
        box.style.padding = '6px';
        box.style.marginTop = '6px';
        box.style.background = '#f5e4c8';
        box.style.fontSize = '11px';

        box.innerHTML =
            '<strong>Agendar por HORA DE CHEGADA (hora do servidor)</strong><br>' +
            'Chegada desejada (HH:MM:SS.mmm): ' +
            '<input type="text" id="tw-attack-time" placeholder="07:39:54.250" ' +
            'style="width:110px; font-size:11px;">' +
            '<button type="button" id="tw-attack-schedule" ' +
            'style="font-size:11px; margin-left:4px;">Agendar</button>' +
            '<div id="tw-attack-status" ' +
            'style="margin-top:4px; font-size:11px; color:#804000;">' +
            'Aguardando horário...</div>';

        confirmBtn.parentElement.appendChild(box);

        const input = box.querySelector('#tw-attack-time');
        const btn = box.querySelector('#tw-attack-schedule');
        const status = box.querySelector('#tw-attack-status');

        let timerId = null;
        let countdownInterval = null;

        btn.addEventListener('click', function () {
            if (timerId) {
                clearTimeout(timerId);
                timerId = null;
            }
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }

            const raw = (input.value || '').trim();
            const parsed = parseTimeWithMs(raw);
            if (!parsed) {
                alert('Formato inválido. Use HH:MM:SS.mmm (ex: 07:39:54.250) ou sem milissegundos.');
                return;
            }

            const serverNow = getServerDateTime();
            if (!serverNow) {
                alert('Não foi possível ler a hora do servidor.');
                return;
            }

            const durationMs = getDurationMs();
            if (durationMs == null) {
                alert('Não consegui ler a Duração do ataque na tabela.');
                return;
            }

            // Chegada desejada: mesmo dia do servidor, horário escolhido
            const targetArrival = new Date(serverNow.getTime());
            targetArrival.setHours(parsed.hh, parsed.mm, parsed.ss, parsed.ms);

            // Se chegou antes da hora atual, assume próximo dia
            if (targetArrival <= serverNow) {
                targetArrival.setDate(targetArrival.getDate() + 1);
            }

            const sendTimeMs = targetArrival.getTime() - durationMs;
            const sendTime = new Date(sendTimeMs);

            if (sendTime <= serverNow) {
                alert('Essa chegada é impossível: a hora de envio já passou.');
                return;
            }

            const delayMs = sendTimeMs - serverNow.getTime();

            log('Chegada desejada:', targetArrival.toString());
            log('Envio programado:', sendTime.toString(), 'em', delayMs, 'ms');

            status.textContent =
                'Chegada: ' + targetArrival.toLocaleString() +
                ' | Envio: ' + sendTime.toLocaleTimeString() +
                ' (programado)';

            // Contagem regressiva até o ENVIO
            const start = Date.now();
            countdownInterval = setInterval(function () {
                const elapsed = Date.now() - start;
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
                    ' | Chegada: ' + targetArrival.toLocaleTimeString();
            }, 50);

            // Disparo na hora do ENVIO
            timerId = setTimeout(function () {
                if (countdownInterval) {
                    clearInterval(countdownInterval);
                    countdownInterval = null;
                }
                status.textContent = 'Enviando ataque AGORA...';
                log('Disparando ataque.');

                const btnSend = getAttackButton();
                if (btnSend) {
                    btnSend.click();
                } else {
                    alert('Agendador: botão de envio não encontrado na hora de disparar.');
                }
            }, delayMs);
        });

        log('UI de agendamento criada.');
    }

    function init() {
        if (!isConfirmScreen()) {
            alert('Agendador: esta tela não parece a de CONFIRMAÇÃO de ataque.');
            return;
        }
        createSchedulerUI();
    }

    init(); // chamado quando o script é carregado via quickbar
})();
