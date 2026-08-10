// ==UserScript==
// @name         TARIC BUILDER V1.1 - Direct Detail Patch
// @namespace    fabry-aida-crawler
// @version      1.1.0
// @description  Gestisce sottocapitoli TARIC che aprono direttamente un dettaglio (es. 0501 -> 05010000 00) senza pagina elenco.
// @match        https://aidaonline7.adm.gov.it/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const STATE_KEY = 'TARIC_BUILDER_V1_STATE';
    const DATA_KEY = 'TARIC_BUILDER_V1_DATA';
    const MAP_KEY = 'TARIC_BUILDER_V1_MAP';
    const PANEL_ID = 'taric-builder-direct-detail-panel';

    const clean = v => String(v || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const digits = v => String(v || '').replace(/\D/g, '');

    function read(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            console.error('[TARIC DIRECT DETAIL] read failed', key, e);
            return fallback;
        }
    }

    function write(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function bodyText() {
        return clean(document.body?.innerText || '');
    }

    function isDetailPage() {
        const t = bodyText().toLowerCase();
        return t.includes('inizio validità') && t.includes('fine validità');
    }

    function valueAfterLabel(text, label, valuePattern) {
        const match = text.match(new RegExp(label + '\\s*:?\\s*' + valuePattern, 'i'));
        return match ? clean(match[1]) : '';
    }

    function supplementaryUnit() {
        for (const row of document.querySelectorAll('tr')) {
            const cells = [...row.querySelectorAll(':scope > td, :scope > th')].map(c => clean(c.innerText));
            const i = cells.findIndex(v => {
                const x = v.toLowerCase();
                return x.includes('unità supplementare') || x.includes('unita supplementare');
            });
            if (i >= 0 && cells[i + 1]) return cells[i + 1];
        }
        return '';
    }

    function descriptionFromPage(text) {
        const textarea = document.querySelector('textarea');
        if (textarea) {
            const v = clean(textarea.value || textarea.innerText || textarea.textContent);
            if (v) return v;
        }

        const codePos = text.toLowerCase().indexOf('codice:');
        if (codePos >= 0) {
            return clean(text.slice(codePos)
                .replace(/Codice\s*:?\s*[0-9 ]+/i, ' ')
                .replace(/Inizio validità\s*:?\s*\d{2}\/\d{2}\/\d{4}/i, ' ')
                .replace(/Fine validità\s*:?\s*\d{2}\/\d{2}\/\d{4}/i, ' ')
                .replace(/Numero trattini\s*:?\s*\d{1,2}/i, ' ')
                .replace(/Unit[aà] supplementare\s*:?\s*\S*/i, ' '));
        }
        return '';
    }

    function findAidaBack() {
        return [...document.querySelectorAll('input,button,a')].find(el =>
            clean(el.value || el.innerText || el.textContent).toLowerCase() === 'indietro'
        ) || null;
    }

    function inspect() {
        const state = read(STATE_KEY, {});
        if (!isDetailPage()) return { ok: false, reason: 'non-detail', state };

        const sub = digits(state.activeSubchapter || '');
        if (!/^\d{4}$/.test(sub)) return { ok: false, reason: 'checkpoint', state };

        const text = bodyText();
        let code = digits(valueAfterLabel(text, 'Codice', '([0-9 ]{8,14})'));
        if (!(code.length === 8 || code.length === 10)) {
            const m = text.match(/\b\d{4}\s*\d{4}(?:\s*\d{2})?\b/);
            code = digits(m?.[0] || '');
        }

        if (!(code.length === 8 || code.length === 10) || !code.startsWith(sub)) {
            return { ok: false, reason: 'code-mismatch', state, code, sub };
        }

        const directState = state.nav === 'load-subchapter' && (!state.stack || state.stack.length === 0);
        return { ok: directState, reason: directState ? 'direct-detail' : 'normal-detail', state, code, sub, text };
    }

    function handleDirectDetail() {
        const info = inspect();
        if (!info.ok) {
            alert('Questa pagina non sembra un direct-detail recuperabile. Stato: ' + info.reason + '.');
            return;
        }

        const state = info.state;
        const data = read(DATA_KEY, { details: {}, tables: {} });
        const map = read(MAP_KEY, { chapters: [], subchapters: [] });
        const text = info.text;
        const code = info.code;
        const sub = info.sub;

        data.details = data.details || {};
        data.tables = data.tables || {};

        if (!data.details[code]) {
            data.details[code] = {
                code,
                chapter: code.slice(0, 2),
                subchapter: sub,
                description: descriptionFromPage(text),
                pathCodes: code.slice(0, 2) + ' > ' + sub,
                pathDescriptions: 'Capitolo ' + code.slice(0, 2) + ' > Sottocapitolo ' + sub,
                validFrom: valueAfterLabel(text, 'Inizio validità', '(\\d{2}\\/\\d{2}\\/\\d{4})'),
                validTo: valueAfterLabel(text, 'Fine validità', '(\\d{2}\\/\\d{2}\\/\\d{4})'),
                dashCount: valueAfterLabel(text, 'Numero trattini', '(\\d{1,2})'),
                supplementaryUnit: supplementaryUnit(),
                extractedAt: new Date().toLocaleString('it-IT'),
                directDetail: true
            };
        }

        state.completedSubchapters = state.completedSubchapters || {};
        state.completedSubchapters[sub] = {
            completedAt: Date.now(),
            detailsTotal: Object.values(data.details).filter(d => d.subchapter === sub).length,
            directDetail: true
        };
        state.visitedPages = state.visitedPages || {};
        state.visitedPages[sub] = true;

        let nextIndex = Number(state.subchapterIndex || 0) + 1;
        const list = map.subchapters || [];
        while (nextIndex < list.length && state.completedSubchapters[list[nextIndex]]) nextIndex++;

        if (nextIndex >= list.length) {
            state.running = false;
            state.paused = false;
            state.completedAt = Date.now();
            state.phase = 'completato';
            state.nav = '';
            state.stack = [];
            state.currentCode = '';
            state.currentDescription = '';
            write(DATA_KEY, data);
            write(STATE_KEY, state);
            alert('Direct-detail salvato. La coda TARIC risulta completata.');
            location.reload();
            return;
        }

        state.subchapterIndex = nextIndex;
        state.activeSubchapter = list[nextIndex];
        state.stack = [];
        state.nav = 'back-to-subchapter-form';
        state.phase = 'direct-detail ' + sub + ' salvato; ritorno per ' + state.activeSubchapter;
        state.currentCode = '';
        state.currentDescription = '';
        state.running = true;
        state.paused = false;

        write(DATA_KEY, data);
        write(STATE_KEY, state);
        updatePanel();

        const back = findAidaBack();
        if (back) {
            setTimeout(() => back.click(), 250);
        } else {
            alert('Dettaglio ' + code + ' salvato e checkpoint avanzato a ' + state.activeSubchapter + '. Non trovo Indietro AIDA: torna manualmente alla ricerca e la V1 riprenderà.');
        }
    }

    function updatePanel() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        const info = inspect();
        const state = info.state || {};
        const data = read(DATA_KEY, { details: {}, tables: {} });
        panel.querySelector('.status').innerHTML =
            '<b>DIRECT DETAIL V1.1</b><br>' +
            'Checkpoint: ' + (state.activeSubchapter || '-') + '<br>' +
            'Pagina: ' + (isDetailPage() ? (info.code || 'dettaglio') : 'non dettaglio') + '<br>' +
            'Modalità: ' + (info.ok ? 'DIRECT-DETAIL RILEVATO' : info.reason) + '<br>' +
            'Dettagli salvati: ' + Object.keys(data.details || {}).length;
        const btn = panel.querySelector('button');
        btn.disabled = !info.ok;
        btn.style.opacity = info.ok ? '1' : '.45';
    }

    function createPanel() {
        if (document.getElementById(PANEL_ID)) return;
        const p = document.createElement('div');
        p.id = PANEL_ID;
        Object.assign(p.style, {
            position: 'fixed', left: '12px', top: '12px', zIndex: 2147483647,
            width: '260px', padding: '12px', background: '#102737', color: '#fff',
            border: '1px solid #52738a', borderRadius: '8px', font: '13px Arial', boxShadow: '0 2px 10px #0008'
        });
        const status = document.createElement('div');
        status.className = 'status';
        const btn = document.createElement('button');
        btn.textContent = 'SALVA DIRECT-DETAIL E CONTINUA';
        Object.assign(btn.style, {
            width: '100%', padding: '9px', marginTop: '9px', cursor: 'pointer',
            border: '1px solid #52738a', borderRadius: '5px', background: '#176447', color: '#fff', fontWeight: '700'
        });
        btn.onclick = handleDirectDetail;
        p.append(status, btn);
        document.body.appendChild(p);
        updatePanel();
    }

    window.addEventListener('load', () => {
        createPanel();
        updatePanel();
    });

    setInterval(updatePanel, 1500);
})();
