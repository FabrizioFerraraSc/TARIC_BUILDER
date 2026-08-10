// ==UserScript==
// @name         TARIC BUILDER - TEST 0101 SAFE RETURN
// @namespace    fabry-aida-crawler
// @version      0.1.0
// @description  Testa 0101 evitando history.back(): dettaglio -> servlet pulita -> rientro 0101 -> dettaglio successivo.
// @match        https://aidaonline7.adm.gov.it/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const HOME = 'https://aidaonline7.adm.gov.it/nsitaricinternet/NomenclatureImportServlet';
    const KEY = 'TARIC_BUILDER_TEST_0101_STATE';
    const PANEL_ID = 'taric-builder-test-0101';
    const TARGET = '0101';
    const MAX_DETAILS = 3;

    let locked = false;

    function clean(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function digits(value) {
        return String(value || '').replace(/\D/g, '');
    }

    function loadState() {
        try {
            return JSON.parse(localStorage.getItem(KEY) || 'null') || {
                running: false,
                phase: 'fermo',
                seen: {},
                currentCode: '',
                completed: 0,
                errors: []
            };
        } catch (_) {
            return {
                running: false,
                phase: 'fermo',
                seen: {},
                currentCode: '',
                completed: 0,
                errors: []
            };
        }
    }

    function saveState(state) {
        localStorage.setItem(KEY, JSON.stringify(state));
        updatePanel();
    }

    function visible(element) {
        if (!element) return false;
        const style = getComputedStyle(element);
        return style.display !== 'none' &&
               style.visibility !== 'hidden' &&
               element.type !== 'hidden' &&
               element.offsetWidth > 0 &&
               element.offsetHeight > 0;
    }

    function subchapterInput() {
        return [...document.querySelectorAll(
            'input[name="NomenclatureImport.Codice"], input[id="NomenclatureImport.Codice"]'
        )].find(el => visible(el) && !el.disabled && !el.readOnly) || null;
    }

    function isFormPage() {
        const input = subchapterInput();
        return !!input && digits(input.value || '').length <= 4;
    }

    function isDetailPage() {
        const text = clean(document.body.innerText).toLowerCase();
        return text.includes('inizio validità') && text.includes('fine validità');
    }

    function isListPage() {
        if (isDetailPage()) return false;
        return [...document.querySelectorAll('table')].some(table => {
            const text = clean(table.innerText).toLowerCase();
            return text.includes('codice') && text.includes('descrizione');
        });
    }

    function okControl(input) {
        const form = input?.form || input?.closest('form');
        if (!form) return null;

        const exact = form.querySelector(
            'input[name="B3"][type="button"], button[name="B3"]'
        );
        if (exact && visible(exact)) return exact;

        return [...form.querySelectorAll('input[type="button"], input[type="submit"], button')]
            .filter(visible)
            .find(el => {
                const label = clean(el.value || el.innerText || el.textContent).toLowerCase();
                const onclick = (el.getAttribute('onclick') || '').toLowerCase();
                return label === 'ok' || onclick.includes('checkform');
            }) || null;
    }

    function submit0101(nextPhase) {
        const input = subchapterInput();
        const control = okControl(input);
        if (!input || !control) return false;

        const state = loadState();
        state.phase = nextPhase;
        saveState(state);

        input.focus();
        input.value = TARGET;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        control.click();
        return true;
    }

    function codeFromLink(link) {
        const row = link.closest('tr');
        const text = clean((row?.innerText || '') + ' ' + (link.innerText || ''));
        const match = text.match(/\b01(?:\s?\d{2}){3,4}\b/);
        return match ? digits(match[0]) : '';
    }

    function detailLinks() {
        return [...document.querySelectorAll('a')]
            .map(link => ({
                link,
                href: link.getAttribute('href') || '',
                title: clean(link.getAttribute('title')).toLowerCase(),
                code: codeFromLink(link)
            }))
            .filter(item =>
                item.code &&
                (item.code.length === 8 || item.code.length === 10) &&
                (
                    item.title.includes('dettaglio nomenclatura') ||
                    item.href.includes("'NomenclatureImportServlet',15") ||
                    item.href.includes('"NomenclatureImportServlet",15')
                )
            );
    }

    function openNextDetail() {
        const state = loadState();
        const next = detailLinks().find(item => !state.seen[item.code]);

        if (!next) {
            state.running = false;
            state.phase = 'nessun altro dettaglio diretto trovato';
            saveState(state);
            alert('TEST 0101: nessun altro dettaglio diretto trovato nella pagina corrente.');
            return;
        }

        state.currentCode = next.code;
        state.phase = 'apertura dettaglio ' + next.code;
        saveState(state);
        location.href = next.href;
    }

    function extractDetailCode() {
        const text = clean(document.body.innerText);
        const match = text.match(/Codice\s*:?\s*([0-9 ]{8,14})/i);
        return match ? digits(match[1]) : '';
    }

    function handle() {
        if (locked) return;
        const state = loadState();
        if (!state.running) return;

        if (isDetailPage()) {
            locked = true;
            setTimeout(() => {
                const latest = loadState();
                const code = extractDetailCode() || latest.currentCode;

                if (code) latest.seen[code] = true;
                latest.completed = Object.keys(latest.seen).length;
                latest.phase = 'ritorno sicuro alla servlet';
                saveState(latest);

                if (latest.completed >= MAX_DETAILS) {
                    latest.running = false;
                    latest.phase = 'TEST COMPLETATO';
                    saveState(latest);
                    locked = false;
                    alert('TEST 0101 riuscito: visitati ' + latest.completed + ' dettagli senza usare Indietro.');
                    return;
                }

                location.href = HOME;
            }, 700);
            return;
        }

        if (isFormPage()) {
            locked = true;
            setTimeout(() => {
                locked = false;
                submit0101('attesa lista 0101');
            }, 400);
            return;
        }

        if (isListPage()) {
            locked = true;
            setTimeout(() => {
                locked = false;
                openNextDetail();
            }, 700);
        }
    }

    function start() {
        const state = {
            running: true,
            phase: 'avvio test 0101',
            seen: {},
            currentCode: '',
            completed: 0,
            errors: []
        };
        saveState(state);
        locked = false;
        handle();
    }

    function reset() {
        localStorage.removeItem(KEY);
        updatePanel();
    }

    function updatePanel() {
        const box = document.querySelector('#taric-test-status');
        if (!box) return;
        const state = loadState();
        box.innerHTML =
            '<b>Stato:</b> ' + state.phase + '<br>' +
            '<b>Dettagli completati:</b> ' + state.completed + '/' + MAX_DETAILS + '<br>' +
            '<b>Codice:</b> ' + (state.currentCode || '-');
    }

    function createPanel() {
        if (document.getElementById(PANEL_ID)) return;

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.style.cssText = [
            'position:fixed', 'right:15px', 'bottom:15px', 'width:300px',
            'padding:12px', 'z-index:2147483647', 'background:#17466f',
            'color:#fff', 'border:2px solid #fff', 'border-radius:8px',
            'font-family:Arial,sans-serif', 'font-size:13px'
        ].join(';');

        panel.innerHTML =
            '<div style="font-weight:bold;text-align:center;margin-bottom:8px">TARIC BUILDER — TEST SAFE RETURN</div>' +
            '<div id="taric-test-status" style="padding:8px;background:rgba(255,255,255,.12);border-radius:5px;line-height:1.5"></div>';

        const startButton = document.createElement('button');
        startButton.textContent = 'AVVIA TEST 0101 (3 DETTAGLI)';
        startButton.style.cssText = 'width:100%;margin-top:8px;padding:8px;font-weight:bold;cursor:pointer';
        startButton.addEventListener('click', start);

        const resetButton = document.createElement('button');
        resetButton.textContent = 'AZZERA TEST';
        resetButton.style.cssText = 'width:100%;margin-top:6px;padding:8px;cursor:pointer';
        resetButton.addEventListener('click', reset);

        panel.append(startButton, resetButton);
        document.body.appendChild(panel);
        updatePanel();
    }

    window.addEventListener('pageshow', () => {
        locked = false;
        createPanel();
        updatePanel();
        setTimeout(handle, 250);
    });

    setInterval(() => {
        if (!locked && loadState().running) handle();
    }, 1000);

    createPanel();
    updatePanel();
    setTimeout(handle, 300);
})();
