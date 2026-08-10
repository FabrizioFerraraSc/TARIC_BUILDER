// ==UserScript==
// @name         TARIC BUILDER V1.2 - Robustness Patch
// @namespace    fabry-aida-crawler
// @version      1.2.0
// @description  Gestisce direct-detail e sottocapitoli presenti nell'indice ma non interrogabili direttamente dal campo a 4 cifre.
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
    const UNRESOLVED_WAIT_MS = 5000;

    let unresolvedTimer = null;
    let unresolvedSignature = '';

    const clean = v => String(v || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const digits = v => String(v || '').replace(/\D/g, '');

    function read(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            console.error('[TARIC V1.2] read failed', key, e);
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

    function elementIsVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' &&
               element.type !== 'hidden' && element.offsetWidth > 0 && element.offsetHeight > 0;
    }

    function subchapterInput() {
        const candidates = [...document.querySelectorAll(
            'input[name="NomenclatureImport.Codice"], input[id="NomenclatureImport.Codice"]'
        )];
        return candidates.find(input =>
            elementIsVisible(input) && !input.disabled && !input.readOnly &&
            ['text', 'search', 'tel', 'number'].includes(input.type)
        ) || null;
    }

    function isSubchapterFormPage() {
        if (isDetailPage()) return false;
        const input = subchapterInput();
        if (!input) return false;
        return digits(input.value || '').length <= 4;
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
        return '';
    }

    function findAidaBack() {
        return [...document.querySelectorAll('input,button,a')].find(el =>
            clean(el.value || el.innerText || el.textContent).toLowerCase() === 'indietro'
        ) || null;
    }

    function inspectDirectDetail() {
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

    function nextPendingIndex(state, map, startIndex) {
        let i = startIndex;
        const list = map.subchapters || [];
        while (i < list.length && state.completedSubchapters?.[list[i]]) i++;
        return i;
    }

    function advanceToNext(state, map, reason) {
        state.completedSubchapters = state.completedSubchapters || {};
        const list = map.subchapters || [];
        const nextIndex = nextPendingIndex(state, map, Number(state.subchapterIndex || 0) + 1);

        if (nextIndex >= list.length) {
            state.running = false;
            state.paused = false;
            state.completedAt = Date.now();
            state.phase = 'completato';
            state.nav = '';
            state.stack = [];
            state.currentCode = '';
            state.currentDescription = '';
            return false;
        }

        state.subchapterIndex = nextIndex;
        state.activeSubchapter = list[nextIndex];
        state.stack = [];
        state.nav = 'back-to-subchapter-form';
        state.phase = reason + '; prossimo ' + state.activeSubchapter;
        state.currentCode = '';
        state.currentDescription = '';
        state.running = true;
        state.paused = false;
        return true;
    }

    function handleDirectDetail() {
        const info = inspectDirectDetail();
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

        const hasNext = advanceToNext(state, map, 'direct-detail ' + sub + ' salvato');
        write(DATA_KEY, data);
        write(STATE_KEY, state);
        updatePanel();

        if (!hasNext) {
            alert('Direct-detail salvato. La coda TARIC risulta completata.');
            location.reload();
            return;
        }

        const back = findAidaBack();
        if (back) {
            setTimeout(() => back.click(), 250);
        } else {
            alert('Dettaglio ' + code + ' salvato. Checkpoint avanzato a ' + state.activeSubchapter + '. Torna manualmente alla ricerca TARIC.');
        }
    }

    function markUnresolvedAndContinue() {
        const state = read(STATE_KEY, {});
        const map = read(MAP_KEY, { chapters: [], subchapters: [] });
        const sub = digits(state.activeSubchapter || '');

        if (!/^\d{4}$/.test(sub)) return false;
        if (state.nav !== 'load-subchapter') return false;
        if (!state.running || state.paused) return false;
        if (!isSubchapterFormPage()) return false;
        if (state.stack?.length) return false;

        state.unresolvedSubchapters = state.unresolvedSubchapters || {};
        state.unresolvedSubchapters[sub] = {
            firstSeenAt: state.unresolvedSubchapters[sub]?.firstSeenAt || Date.now(),
            lastSeenAt: Date.now(),
            reason: 'nessuna corrispondenza nella ricerca diretta a 4 cifre',
            retryMode: 'indice'
        };

        const hasNext = advanceToNext(state, map, 'UNRESOLVED ' + sub + ' accodato per secondo passaggio');
        write(STATE_KEY, state);
        updatePanel();

        if (!hasNext) {
            alert('Prima passata completata. Restano ' + Object.keys(state.unresolvedSubchapters || {}).length + ' sottocapitoli da recuperare via indice.');
            return true;
        }

        console.warn('[TARIC V1.2] Sottocapitolo non interrogabile direttamente:', sub, '→ prossimo:', state.activeSubchapter);
        return true;
    }

    function watchUnresolved() {
        const state = read(STATE_KEY, {});
        const sig = [state.activeSubchapter, state.subchapterIndex, state.nav, state.running, state.paused, location.pathname].join('|');

        const candidate = state.running && !state.paused && state.nav === 'load-subchapter' &&
            (!state.stack || state.stack.length === 0) && isSubchapterFormPage();

        if (!candidate) {
            if (unresolvedTimer) clearTimeout(unresolvedTimer);
            unresolvedTimer = null;
            unresolvedSignature = '';
            return;
        }

        if (unresolvedTimer && unresolvedSignature === sig) return;
        if (unresolvedTimer) clearTimeout(unresolvedTimer);

        unresolvedSignature = sig;
        unresolvedTimer = setTimeout(() => {
            unresolvedTimer = null;
            const latest = read(STATE_KEY, {});
            const latestSig = [latest.activeSubchapter, latest.subchapterIndex, latest.nav, latest.running, latest.paused, location.pathname].join('|');
            if (latestSig !== unresolvedSignature) return;
            markUnresolvedAndContinue();
        }, UNRESOLVED_WAIT_MS);
    }

    function updatePanel() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        const info = inspectDirectDetail();
        const state = read(STATE_KEY, {});
        const data = read(DATA_KEY, { details: {}, tables: {} });
        const unresolved = Object.keys(state.unresolvedSubchapters || {});

        panel.querySelector('.status').innerHTML =
            '<b>ROBUSTNESS V1.2</b><br>' +
            'Checkpoint: ' + (state.activeSubchapter || '-') + '<br>' +
            'Pagina: ' + (isDetailPage() ? (info.code || 'dettaglio') : (isSubchapterFormPage() ? 'ricerca 4 cifre' : 'altra pagina')) + '<br>' +
            'Direct-detail: ' + (info.ok ? 'RILEVATO' : 'no') + '<br>' +
            'Unresolved: ' + unresolved.length + (unresolved.length ? ' (' + unresolved.slice(-4).join(', ') + ')' : '') + '<br>' +
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
            width: '275px', padding: '12px', background: '#102737', color: '#fff',
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

    setInterval(() => {
        updatePanel();
        watchUnresolved();
    }, 1000);
})();
