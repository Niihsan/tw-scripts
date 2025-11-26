(function () {
    'use strict';

    const LOG_PREFIX = '[TW Agendar Ataque]';

    function log() {
        console.log.apply(console, [LOG_PREFIX].concat(Array.from(arguments)));
    }

    // ---- Achar botão de enviar ataque (compatível com vários layouts) ----
    function getAttackButton() {
        // 1. ID clássico
        let b = document.querySelector('#troop_confirm_go');
        if (b) return b;

        // 2. Classe nova
        b = document.querySelector('.btn-confirm-attack');
        if (b) return b;

        // 3. Input com value "Enviar ataque"
        b = document.querySelector('input[type=submit][value="Enviar ataque"]');
        if (b) return b;

        // 4. Qualquer botão/input com texto "Enviar ataque"
        const all = document.querySelectorAll('button, input[type=submit]');
        for (const el of all) {
            const txt = (el.textContent || el.value || '').trim().toLowerCase();
            if (txt.includes('enviar ataque')) {
                return el;
            }
        }

        return null;
    }

    // ---- Detectar se é tela de confirmação de ataque ----
    function isConfirmScreen() {
        try {
            if (typeof game_data === 'undefined') return false;
            if (game_data.screen !== 'place') return false;
            return window.location.search.indexOf('try=confirm') !== -1;
        } catch (e) {
            return false;
        }
    }

    // ---- Ler data/hora do servidor (#serverDate e #serverTime) ----
    function getServerDateTime() {
        const dateEl = document.querySelector('#serverDate');
        const timeEl = document.querySelector('#serverTime');

        if (!dateEl || !timeEl) {
            log('Não encontrei #serverDate ou #serverTime');
            return null;
        }

        const dateStr = dateEl.textContent.trim(); // 26/11/2025 ou 26.11.2025
        const timeStr = timeEl.textContent.trim(); // 02:30:38

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

    // ---- Criar painel de agendamento ----
    function createSchedulerUI() {
        const confirmBtn = getAttackButton();

        if (!confirmBtn) {
            log('Botão de confirmar ataque não encontrado.');
            alert('Agendador: não achei o botão de confirmar ataque nesta tela.');
            return;
        }

        // Evita duplicar UI
        if (document.querySelector('#tw-attack-scheduler-box')) {
            log('UI já criada, ignorando.');
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
            '<strong>Agendar envio de ataque (hora do servidor)</strong><br>' +
            'Horário alvo (HH:MM:SS): ' +
            '<input type="text" id="tw-attack-time" placeholder="03:15:00" ' +
            'style="width:80px; font-size:11px;">' +
            '<button type="button" id="tw-attack-schedule" ' +
            'style="font-size:11px; margin-left:4px;">Agendar</button>' +
            '<div id="tw-attack-status" ' +
            'style="margin-top:4px; font-size:11px; color:#804000;">' +
            'Aguardando horário...</div>';

        // Coloca logo abaixo do botão de enviar
        confirmBtn.parentElement.appendChild(box);

        const input = box.querySelector('#tw-attack-time');
        const btn = box.querySelector('#tw-attack-schedule');
        const status = box.querySelector('#tw-attack-status');

        let timerId = null;
        let countdownInterval = null;

        btn.addEventListener('click', function () {
            // Limpa agendamentos anteriores
            if (timerId) {
                clearTimeout(timerId);
                timerId = null;
            }
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }

            const targetStr = (input.value || '').trim();
            const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(targetStr);

            if (!match) {
                alert('Formato inválido. Use HH:MM:SS (ex: 03:15:00)');
                return;
            }

            const thh = Number(match[1]);
            const tmm = Number(match[2]);
            const tss = Number(match[3]);

            const serverNow = getServerDateTime();
            if (!serverNow) {
                alert('Não foi possível ler a hora do servidor.');
                return;
            }

            // Data/horário alvo com mesmo dia do servidor
            const target = new Date(serverNow.getTime());
            target.setHours(thh, tmm, tss, 0);

            // Se já passou hoje, joga para o próximo dia
            if (target <= serverNow) {
                target.setDate(target.getDate() + 1);
            }

            const delayMs = target.getTime() - serverNow.getTime();
            if (delayMs <= 0) {
                alert('Horário alvo inválido.');
                return;
            }

            log('Agendando envio em ms:', delayMs);
            status.textContent =
                'Ataque agendado para ' + target.toLocaleString() +
                ' (hora do servidor).';

            // Contagem regressiva visual
            const start = Date.now();
            countdownInterval = setInterval(function () {
                const elapsed = Date.now() - start;
                const remaining = delayMs - elapsed;
                if (remaining <= 0) {
                    clearInterval(countdownInterval);
                    countdownInterval = null;
                    return;
                }
                const sec = Math.floor(remaining / 1000);
                const h = String(Math.floor(sec / 3600)).padStart(2, '0');
                const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
                const s = String(sec % 60).padStart(2, '0');
                status.textContent =
                    'Ataque agendado. Tempo restante: ' + h + ':' + m + ':' + s;
            }, 500);

            // Disparo na hora certa
            timerId = setTimeout(function () {
                if (countdownInterval) {
                    clearInterval(countdownInterval);
                    countdownInterval = null;
                }
                status.textContent = 'Enviando ataque AGORA...';
                log('Disparando ataque agendado.');

                const btnToClick = getAttackButton();
                if (btnToClick) {
                    btnToClick.click();
                } else {
                    alert('Agendador: botão de envio não encontrado na hora de disparar.');
                }
            }, delayMs);
        });

        log('UI de agendamento criada.');
    }

    function init() {
        if (!isConfirmScreen()) {
            alert('Agendador: esta tela não é a de CONFIRMAÇÃO de ataque.');
            return;
        }
        createSchedulerUI();
    }

    init(); // já que estamos carregando sob demanda
})();
