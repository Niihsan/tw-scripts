(function () {
    'use strict';

    const LOG_PREFIX = '[TW Agendar Ataque]';

    function log() {
        console.log.apply(console, [LOG_PREFIX].concat(Array.from(arguments)));
    }

    // Verifica se estamos na tela de confirmação de ataque
    function isConfirmScreen() {
        try {
            if (typeof game_data === 'undefined') return false;
            return game_data.screen === 'place' && window.location.search.includes('try=confirm');
        } catch (e) {
            return false;
        }
    }

    // Lê data/hora do servidor (#serverDate e #serverTime)
    function getServerDateTime() {
        const dateEl = document.querySelector('#serverDate');
        const timeEl = document.querySelector('#serverTime');

        if (!dateEl || !timeEl) {
            log('Não encontrei #serverDate ou #serverTime');
            return null;
        }

        const dateStr = dateEl.textContent.trim(); // ex: 26/11/2025 ou 26.11.2025
        const timeStr = timeEl.textContent.trim(); // ex: 01:23:45

        const [day, month, year] = dateStr.includes('.')
            ? dateStr.split('.')
            : dateStr.split('/');

        const [hh, mm, ss] = timeStr.split(':').map(Number);

        const now = new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hh),
            Number(mm),
            Number(ss)
        );

        return now;
    }

    function createSchedulerUI() {
        // botão padrão de confirmar ataque
        const confirmBtn =
            document.querySelector('#troop_confirm_go') ||
            document.querySelector('button.btn.attack');

        if (!confirmBtn) {
            log('Botão de confirmar ataque não encontrado.');
            alert('Agendador: não achei o botão de confirmar ataque nesta tela.');
            return;
        }

        // se já tiver UI, não duplica
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
            '<input type="text" id="tw-attack-time" style="width:80px; font-size:11px;">' +
            '<button type="button" id="tw-attack-schedule" style="font-size:11px; margin-left:4px;">' +
            'Agendar' +
            '</button>' +
            '<div id="tw-attack-status" style="margin-top:4px; font-size:11px; color:#804000;">' +
            'Aguardando horário...' +
            '</div>';

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

            const target = new Date(serverNow.getTime());
            target.setHours(thh, tmm, tss, 0);

            // se já passou, assume próximo dia
            if (target <= serverNow) {
                target.setDate(target.getDate() + 1);
            }

            const delayMs = target.getTime() - serverNow.getTime();
            if (delayMs <= 0) {
                alert('Horário alvo inválido.');
                return;
            }

            log('Agendando envio em (ms):', delayMs);
            status.textContent =
                'Ataque agendado para ' +
                target.toLocaleString() +
                ' (hora do servidor).';

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

            timerId = setTimeout(function () {
                if (countdownInterval) {
                    clearInterval(countdownInterval);
                    countdownInterval = null;
                }
                status.textContent = 'Enviando ataque AGORA...';
                log('Disparando ataque agendado.');

                const btnToClick =
                    document.querySelector('#troop_confirm_go') ||
                    document.querySelector('button.btn.attack');

                if (btnToClick) {
                    btnToClick.click();
                } else {
                    alert(
                        'Agendador: não encontrei o botão de envio na hora de disparar.'
                    );
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

    // Chamamos direto, porque o script é injetado depois da página carregar
    init();
})();
