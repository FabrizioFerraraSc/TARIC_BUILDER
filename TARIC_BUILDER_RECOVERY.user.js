// ==UserScript==
// @name         TARIC BUILDER V1 - Recovery Companion
// @namespace    fabry-aida-crawler
// @version      1.1.0-recovery
// @description  Recovery sicuro, watchdog e ripristino backup per TARIC BUILDER V1 senza azzerare i dati.
// @match        https://aidaonline7.adm.gov.it/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const STATE_KEY = 'TARIC_BUILDER_V1_STATE';
    const DATA_KEY = 'TARIC_BUILDER_V1_DATA';
    const MAP_KEY = 'TARIC_BUILDER_V1_MAP';
    const PANEL_ID = 'taric-builder-recovery-panel';
    const WATCHDOG_MS = 120000;

    let lastSignature = '';
    let lastChangeAt = Date.now();

    const clean = v => String(v || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const digits = v => String(v || '').replace(/\D/g, '');

    function read(key, fallback = null) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            console.error('[TARIC RECOVERY] read', key, e);
            return fallback;
        }
    }

    function write(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function state() {
        return read(STATE_KEY, {});
    }

    function isDetailPage() {
        const t = clean(document.body?.innerText).toLowerCase();
        return t.includes('inizio validità') && t.includes('fine validità');
    }

    function isListPage() {
        if (isDetailPage()) return false;
        return [...document.querySelectorAll('table')].some(table => {
            const t = clean(table.innerText).toLowerCase();
            return t.includes('codice') && t.includes('descrizione');
        });
    }

    function currentListSubchapter(wanted) {
        if (!wanted || !isListPage()) return false;
        const text = digits(document.body?.innerText || '');
        return text.includes(wanted);
    }

    function findAidaBack() {
        return [...document.querySelectorAll('input,button,a')].find(el =>
            clean(el.value || el.innerText || el.textContent).toLowerCase() === 'indietro'
        );
    }

    function pauseCore(reason) {
        const s = state();
        if (!s || !s.startedAt) return;
        s.running = false;
        s.paused = true;
        s.phase = reason || 'recovery: pausa sicurezza';
        write(STATE_KEY, s);
    }

    function armRecovery() {
        const s = state();
        if (!s || !s.startedAt) {
            alert('Nessun checkpoint V1 trovato.');
            return;
        }
        const code = s.activeSubchapter || '';
        if (!/^\d{4}$/.test(code)) {
            alert('Checkpoint senza sottocapitolo attivo valido.');
            return;
        }

        // Non tocchiamo dettagli/tabelle/completedSubchapters.
        s.running = false;
        s.paused = true;
        s.stack = [];
        s.nav = 'load-subchapter';
        s.currentCode = '';
        s.currentDescription = '';
        s.phase = 'RECOVERY ARMATO: torna alla lista ' + code;
        write(STATE_KEY, s);
        updatePanel();

        if (currentListSubchapter(code)) {
            resumeFromList();
            return;
        }

        const back = findAidaBack();
        if (back) {
            back.click();
            return;
        }

        alert('Recovery armato per ' + code + '. Torna manualmente alla lista del sottocapitolo ' + code + ', poi premi RIPARTI DA LISTA.');
    }

    function resumeFromList() {
        const s = state();
        const code = s?.activeSubchapter || '';
        if (!/^\d{4}$/.test(code)) {
            alert('Checkpoint non valido.');
            return;
        }
        if (!currentListSubchapter(code)) {
            alert('Non sei ancora sulla lista di ' + code + '. Apri quella lista e riprova.');
            return;
        }

        s.running = true;
        s.paused = false;
        s.stack = [];
        s.nav = 'load-subchapter';
        s.currentCode = '';
        s.currentDescription = '';
        s.phase = 'recovery lista ' + code;
        write(STATE_KEY, s);
        updatePanel();
        // Il core V1 rilegge localStorage nel proprio timer e ricostruisce lo stack dalla lista.
        setTimeout(() => location.reload(), 300);
    }

    function importBackup(file) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const backup = JSON.parse(reader.result);
                if (!backup?.state || !backup?.data || !backup?.map?.subchapters?.length) {
                    throw new Error('Formato backup TARIC V1 non riconosciuto');
                }
                const restoredState = backup.state;
                restoredState.running = false;
                restoredState.paused = true;
                restoredState.phase = 'backup ripristinato - pronto al recovery';
                write(MAP_KEY, backup.map);
                write(DATA_KEY, backup.data);
                write(STATE_KEY, restoredState);
                alert('Backup ripristinato. Sottocapitolo: ' + (restoredState.activeSubchapter || '-') + '. Ora usa RECUPERA CHECKPOINT.');
                location.reload();
            } catch (e) {
                console.error(e);
                alert('Backup non valido: ' + e.message);
            }
        };
        reader.readAsText(file);
    }

    function chooseBackup() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = () => input.files?.[0] && importBackup(input.files[0]);
        input.click();
    }

    function signature(s) {
        const data = read(DATA_KEY, { details: {}, tables: {} }) || { details: {}, tables: {} };
        return [
            s?.subchapterIndex,
            s?.activeSubchapter,
            s?.nav,
            s?.currentCode,
            Object.keys(data.details || {}).length,
            Object.keys(data.tables || {}).length
        ].join('|');
    }

    function watchdog() {
        const s = state();
        if (!s?.running || s.paused) {
            lastSignature = signature(s);
            lastChangeAt = Date.now();
            updatePanel();
            return;
        }
        const sig = signature(s);
        if (sig !== lastSignature) {
            lastSignature = sig;
            lastChangeAt = Date.now();
            updatePanel();
            return;
        }
        if (Date.now() - lastChangeAt >= WATCHDOG_MS) {
            pauseCore('WATCHDOG: nessun progresso da 2 minuti');
            lastChangeAt = Date.now();
            updatePanel();
            alert('TARIC Builder sembra bloccato. L’ho messo in pausa senza cancellare nulla. Usa RECUPERA CHECKPOINT.');
        }
    }

    function button(text, fn) {
        const b = document.createElement('button');
        b.textContent = text;
        Object.assign(b.style, {
            width: '100%', padding: '9px', marginTop: '7px', cursor: 'pointer',
            border: '1px solid #52738a', borderRadius: '5px', background: '#17364a', color: '#fff', fontWeight: '700'
        });
        b.onclick = fn;
        return b;
    }

    function updatePanel() {
        const p = document.getElementById(PANEL_ID);
        if (!p) return;
        const s = state();
        const d = read(DATA_KEY, { details: {}, tables: {} });
        const age = Math.max(0, Math.floor((Date.now() - lastChangeAt) / 1000));
        p.querySelector('.status').innerHTML =
            '<b>RECOVERY V1.1</b><br>' +
            'Checkpoint: ' + (s?.activeSubchapter || '-') + '<br>' +
            'Indice: ' + (s?.subchapterIndex ?? '-') + '<br>' +
            'Dettagli: ' + Object.keys(d?.details || {}).length + '<br>' +
            'Tabelle: ' + Object.keys(d?.tables || {}).length + '<br>' +
            'Nav: ' + (s?.nav || '-') + '<br>' +
            'Core: ' + (s?.running && !s?.paused ? 'IN ESECUZIONE' : 'PAUSA') + '<br>' +
            'Ultimo progresso: ' + age + 's';
    }

    function createPanel() {
        if (document.getElementById(PANEL_ID)) return;
        const p = document.createElement('div');
        p.id = PANEL_ID;
        Object.assign(p.style, {
            position: 'fixed', left: '12px', bottom: '12px', zIndex: 2147483647,
            width: '250px', padding: '12px', background: '#102737', color: '#fff',
            border: '1px solid #52738a', borderRadius: '8px', font: '13px Arial', boxShadow: '0 2px 10px #0008'
        });
        const status = document.createElement('div');
        status.className = 'status';
        p.append(status,
            button('RECUPERA CHECKPOINT', armRecovery),
            button('RIPARTI DA LISTA', resumeFromList),
            button('IMPORTA BACKUP JSON', chooseBackup)
        );
        document.body.appendChild(p);
        updatePanel();
    }

    window.addEventListener('load', () => {
        createPanel();
        lastSignature = signature(state());
        lastChangeAt = Date.now();
        updatePanel();
    });

    setInterval(watchdog, 5000);
})();
