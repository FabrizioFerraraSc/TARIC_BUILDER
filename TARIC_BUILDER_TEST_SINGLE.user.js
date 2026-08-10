// ==UserScript==
// @name         TARIC BUILDER - Test sottocapitolo singolo
// @namespace    fabry-aida-crawler
// @version      0.9.1-test
// @description  Testa un singolo sottocapitolo TARIC a 4 cifre usando il motore stabile V8
// @match        https://aidaonline7.adm.gov.it/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const TEST_CODE_KEY = 'TARIC_BUILDER_TEST_CODE';
    let selectedSubchapter = String(localStorage.getItem(TEST_CODE_KEY) || '0301').replace(/\D/g, '');
    if (!/^\d{4}$/.test(selectedSubchapter)) selectedSubchapter = '0301';

    let ALLOWED_CHAPTERS = [selectedSubchapter.slice(0, 2)];
    let SUBCHAPTERS = [selectedSubchapter];

    const STATE_KEY = 'TARIC_BUILDER_TEST_SINGLE_STATE';
    const DATA_KEY = 'TARIC_BUILDER_TEST_SINGLE_DATA';
    const PANEL_ID = 'taric-builder-test-single-panel';
    const WAIT_PAGE = 1200;
    const WAIT_STEP = 500;

    let state = load(STATE_KEY, emptyState());
    let data = load(DATA_KEY, emptyData());
    let locked = false;

    function emptyState() {
        return {
            running: false,
            paused: false,
            phase: 'fermo',
            nav: '',
            stack: [],
            currentCode: '',
            currentDescription: '',
            visitedPages: {},
            skipped: {},
            errors: [],
            subchapterIndex: 0,
            activeSubchapter: ''
        };
    }

    function emptyData() {
        return { details: {}, tables: {} };
    }

    function load(key, fallback) {
        try {
            const value = localStorage.getItem(key);
            return value ? { ...fallback, ...JSON.parse(value) } : fallback;
        } catch (error) {
            console.error('[AIDA V6] Caricamento fallito:', error);
            return fallback;
        }
    }

    function saveState() {
        localStorage.setItem(STATE_KEY, JSON.stringify(state));
        updatePanel();
    }

    function saveData() {
        localStorage.setItem(DATA_KEY, JSON.stringify(data));
        updatePanel();
    }

    function clean(value) {
        return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function digits(value) {
        return String(value || '').replace(/\D/g, '');
    }

    function allowedChapter(code) {
        return ALLOWED_CHAPTERS.includes(digits(code).slice(0, 2));
    }

    function validCode(code) {
        const value = digits(code);

        return (
            allowedChapter(value) &&
            [2, 4, 6, 8, 10].includes(value.length)
        );
    }

    function finalCode(code) {
        const value = digits(code);

        return (
            allowedChapter(value) &&
            (value.length === 8 || value.length === 10)
        );
    }

    function codesIn(text) {
        const chapterPattern = ALLOWED_CHAPTERS.length
            ? '(?:' + ALLOWED_CHAPTERS.join('|') + ')'
            : '\\d{2}';

        const matches =
            clean(text).match(new RegExp('\\b' + chapterPattern + '(?:\\s?\\d{2}){0,4}\\b', 'g')) || [];

        return [
            ...new Set(
                matches
                    .map(digits)
                    .filter(validCode)
            )
        ];
    }

    function bestCode(text) {
        return codesIn(text).sort((a, b) => b.length - a.length)[0] || '';
    }

    function safeDescription(text, code) {
        let result = clean(text);
        if (code) {
            const pattern = digits(code).match(/.{1,2}/g).join('\\s*');
            result = result.replace(new RegExp('\\b' + pattern + '\\b', 'g'), ' ');
        }
        return clean(result
            .replace(/visualizza dettaglio nomenclatura/gi, ' ')
            .replace(/visualizza nomenclatura/gi, ' ')
            .replace(/dettaglio nomenclatura/gi, ' '));
    }

    function bodyText() {
        const copy = document.body.cloneNode(true);
        copy.querySelector('#' + PANEL_ID)?.remove();
        return clean(copy.innerText);
    }

    function isErrorPage() {
        const text = bodyText().toLowerCase();
        return text.includes('segnalazione malfunzionamento') ||
               text.includes('java.lang.classcastexception') ||
               text.includes('incompatible with');
    }

    function isDetailPage() {
        const text = bodyText().toLowerCase();
        return text.includes('inizio validità') && text.includes('fine validità');
    }

    function isListPage() {
        if (isDetailPage() || isErrorPage()) return false;

        return [...document.querySelectorAll('table')].some(table => {
            const text = clean(table.innerText).toLowerCase();
            return text.includes('codice') && text.includes('descrizione');
        });
    }

    function elementIsVisible(element) {
        if (!element) return false;

        const style = window.getComputedStyle(element);

        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            element.type !== 'hidden' &&
            element.offsetWidth > 0 &&
            element.offsetHeight > 0
        );
    }

    function subchapterInput() {
        const candidates = [
            ...document.querySelectorAll(
                'input[name="NomenclatureImport.Codice"], ' +
                'input[id="NomenclatureImport.Codice"]'
            )
        ];

        return candidates.find(input =>
            elementIsVisible(input) &&
            !input.disabled &&
            !input.readOnly &&
            input.type === 'text'
        ) || null;
    }

    function isSubchapterFormPage() {
        const input = subchapterInput();

        if (!input || isDetailPage() || isErrorPage()) {
            return false;
        }

        const value = digits(input.value || '');

        return (
            ['text', 'search', 'tel', 'number'].includes(input.type) &&
            value.length <= 4
        );
    }

    function currentSubchapterFromPage() {
        const input = subchapterInput();
        const inputCode = digits(input?.value || '');
        if (/^\d{4}$/.test(inputCode)) return inputCode;

        const candidates = codesIn(bodyText())
            .filter(code => code.length >= 4)
            .map(code => code.slice(0, 4));

        return candidates.find(code => SUBCHAPTERS.includes(code)) || '';
    }

    function chapterPathFor(subchapter) {
        const chapter = digits(subchapter).slice(0, 2);

        return [
            {
                code: chapter,
                description: 'Capitolo ' + chapter
            },
            {
                code: subchapter,
                description: 'Sottocapitolo ' + subchapter
            }
        ];
    }

    function nativeSubchapterControl(input) {
        const form = input?.form || input?.closest('form');

        if (!form) {
            return null;
        }

        const exact = form.querySelector(
            'input[name="B3"][type="button"], ' +
            'button[name="B3"]'
        );

        if (exact && elementIsVisible(exact)) {
            return exact;
        }

        const controls = [
            ...form.querySelectorAll(
                'input[type="button"], input[type="submit"], button'
            )
        ].filter(element => elementIsVisible(element));

        return controls.find(element => {
            const onclick =
                (element.getAttribute('onclick') || '').toLowerCase();

            const label = clean(
                element.value ||
                element.innerText ||
                element.textContent
            ).toLowerCase();

            return (
                onclick.includes('checkform') ||
                label === 'ok'
            );
        }) || null;
    }

    function submitSubchapter(code) {
        const input = subchapterInput();

        if (!input) {
            recordError(
                'CAMPO_CODICE_NON_TROVATO',
                'Campo NomenclatureImport.Codice non trovato'
            );
            return false;
        }

        const form = input.form || input.closest('form');
        const control = nativeSubchapterControl(input);

        if (!form || !control) {
            recordError(
                'PULSANTE_OK_NON_TROVATO',
                'Form formConferma o pulsante B3/OK non trovato'
            );
            return false;
        }

        state.activeSubchapter = code;
        state.phase = 'apertura sottocapitolo ' + code;
        state.nav = 'load-subchapter';
        saveState();

        input.focus();
        input.select();
        input.value = code;

        input.dispatchEvent(
            new Event('input', { bubbles: true })
        );
        input.dispatchEvent(
            new Event('change', { bubbles: true })
        );
        input.dispatchEvent(
            new Event('blur', { bubbles: true })
        );

        try {
            control.click();
            return true;
        } catch (error) {
            recordError(
                'CLICK_OK_FALLITO',
                String(error)
            );
            return false;
        }
    }

    function moveToNextSubchapter() {
        const nextIndex = state.subchapterIndex + 1;

        if (nextIndex >= SUBCHAPTERS.length) {
            complete();
            return;
        }

        state.subchapterIndex = nextIndex;
        state.activeSubchapter = SUBCHAPTERS[nextIndex];
        state.stack = [];
        state.nav = 'back-to-subchapter-form';
        state.phase = 'ritorno alla selezione per ' + state.activeSubchapter;
        state.currentCode = '';
        state.currentDescription = '';
        saveState();
        locked = false;

        if (isSubchapterFormPage()) {
            submitSubchapter(state.activeSubchapter);
        } else {
            clickAidaBack();
        }
    }

    function rowTexts(link) {
        const row = link.closest('tr');
        if (!row) return [];
        return [...row.querySelectorAll('td, th')].map(cell => clean(cell.innerText)).filter(Boolean);
    }

    function hrefOf(link) {
        return link.getAttribute('href') || '';
    }

    function isAidaLink(link) {
        const href = hrefOf(link);
        return href.startsWith('javascript:linkToPostKey(') || href.includes('NomenclatureImportServlet');
    }

    function isDetailLink(link) {
        const href = hrefOf(link);
        const title = clean(link.getAttribute('title')).toLowerCase();
        return isAidaLink(link) && (
            title.includes('dettaglio nomenclatura') ||
            href.includes("'NomenclatureImportServlet',15") ||
            href.includes('"NomenclatureImportServlet",15')
        );
    }

    function isChildLink(link) {
        const href = hrefOf(link);
        return isAidaLink(link) && !isDetailLink(link) && (
            href.includes("'NomenclatureImportServlet',10") ||
            href.includes('"NomenclatureImportServlet",10')
        );
    }

    function descriptionOfLink(link, code) {
        return [clean(link.innerText), ...rowTexts(link)]
            .map(text => safeDescription(text, code))
            .filter(text => text && !/^\d+$/.test(text) && !text.toLowerCase().includes('visualizza dettaglio'))
            .sort((a, b) => b.length - a.length)[0] || '';
    }

    function extractAllTableRows(pageCode, path) {
        const rows = [];
        let chosenTable = null;

        for (const table of document.querySelectorAll('table')) {
            const text = clean(table.innerText).toLowerCase();
            if (text.includes('codice') && text.includes('descrizione')) {
                chosenTable = table;
                break;
            }
        }

        if (!chosenTable) return rows;

        [...chosenTable.querySelectorAll('tr')].forEach((row, index) => {
            const cells = [...row.querySelectorAll(':scope > td, :scope > th')];
            if (cells.length < 2) return;

            const displayedCode = clean(cells[0].innerText);
            const originalDescription = clean(cells[1].innerText);
            if (!displayedCode && !originalDescription) return;
            if (displayedCode.toLowerCase() === 'codice' && originalDescription.toLowerCase() === 'descrizione') return;

            const normalizedCode = bestCode(displayedCode);
            const dashMatch = originalDescription.match(/^\s*((?:-\s*)+)/);
            const level = dashMatch ? (dashMatch[1].match(/-/g) || []).length : 0;
            const description = originalDescription.replace(/^\s*(?:-\s*)+/, '').trim();

            rows.push({
                pageCode,
                pathCodes: path.map(item => item.code).join(' > '),
                displayedCode,
                normalizedCode,
                description,
                originalDescription,
                level,
                rowNumber: index + 1
            });
        });

        return rows;
    }

    function analyzeListPage(pageCode, pageDescription, path) {
        const details = [];
        const children = [];
        const detailSeen = new Set();
        const childSeen = new Set();

        document.querySelectorAll('a').forEach(link => {
            const href = hrefOf(link);
            if (!href) return;

            const text = [clean(link.innerText), ...rowTexts(link)].join(' ');
            const code = bestCode(text);
            if (!validCode(code)) return;

            const description = descriptionOfLink(link, code);

            if (isDetailLink(link) && finalCode(code)) {
                const key = code + '|' + href;
                if (!detailSeen.has(key)) {
                    detailSeen.add(key);
                    details.push({ code, description, href });
                }
                return;
            }

            if (isChildLink(link) && code.length > pageCode.length) {
                const key = code + '|' + href;
                if (!childSeen.has(key)) {
                    childSeen.add(key);
                    children.push({ code, description, href });
                }
            }
        });

        const detailCodes = new Set(details.map(item => item.code));
        const cleanChildren = children.filter(item => !detailCodes.has(item.code));
        details.sort((a, b) => a.code.localeCompare(b.code));
        cleanChildren.sort((a, b) => a.code.localeCompare(b.code));

        data.tables[pageCode] = {
            pageCode,
            pageDescription,
            path,
            rows: extractAllTableRows(pageCode, path),
            extractedAt: new Date().toLocaleString('it-IT')
        };
        saveData();

        return {
            code: pageCode,
            description: pageDescription,
            path,
            details,
            children: cleanChildren,
            detailIndex: 0,
            childIndex: 0
        };
    }

    function currentFrame() {
        return state.stack[state.stack.length - 1] || null;
    }

    function valueAfterLabel(text, label, valuePattern) {
        const match = text.match(new RegExp(label + '\\s*:?\\s*' + valuePattern, 'i'));
        return match ? clean(match[1]) : '';
    }

    function supplementaryUnit() {
        for (const row of document.querySelectorAll('tr')) {
            const cells = [...row.querySelectorAll(':scope > td, :scope > th')].map(c => clean(c.innerText));
            const index = cells.findIndex(value => value.toLowerCase().includes('unità supplementare') || value.toLowerCase().includes('unita supplementare'));
            if (index >= 0 && cells[index + 1]) return cells[index + 1];
        }
        return '';
    }

    function extractDetail() {
        if (!isDetailPage()) return null;
        const text = bodyText();
        let code = digits(valueAfterLabel(text, 'Codice', '([0-9 ]{8,14})'));
        if (!finalCode(code)) code = state.currentCode;
        if (!finalCode(code)) return null;

        const frame = currentFrame();
        const path = frame?.path || [];
        const item = frame?.details[frame.detailIndex];

        return {
            code,
            chapter: code.slice(0, 2),
            description: item?.description || state.currentDescription || '',
            pathCodes: path.map(p => p.code).join(' > '),
            pathDescriptions: path.map(p => p.description).filter(Boolean).join(' > '),
            validFrom: valueAfterLabel(text, 'Inizio validità', '(\\d{2}\\/\\d{2}\\/\\d{4})'),
            validTo: valueAfterLabel(text, 'Fine validità', '(\\d{2}\\/\\d{2}\\/\\d{4})'),
            dashCount: valueAfterLabel(text, 'Numero trattini', '(\\d{1,2})'),
            supplementaryUnit: supplementaryUnit(),
            extractedAt: new Date().toLocaleString('it-IT')
        };
    }

    function clickAidaBack() {
        const controls = [...document.querySelectorAll('input, button, a')];
        const back = controls.find(element => {
            const value = clean(
                element.value ||
                element.innerText ||
                element.textContent
            ).toLowerCase();

            return value === 'indietro';
        });

        if (back) {
            back.click();
            return true;
        }

        recordError(
            'INDIETRO_NON_TROVATO',
            'Pulsante Indietro assente: uso recupero tramite cronologia'
        );

        try {
            history.back();
            return true;
        } catch (error) {
            recordError('RECUPERO_FALLITO', String(error));
            stop();
            return false;
        }
    }

    function recordError(type, message) {
        state.errors.push({
            type,
            code: state.currentCode,
            message,
            date: new Date().toLocaleString('it-IT')
        });
        saveState();
    }

    function openItem(item, type) {
        state.nav = type;
        state.phase = type === 'detail' ? 'apertura dettaglio' : 'apertura sottolivello';
        state.currentCode = item.code;
        state.currentDescription = item.description;
        saveState();
        location.href = item.href;
    }

    function nextStep() {
        if (!state.running || state.paused || locked) return;
        locked = true;

        const frame = currentFrame();
        if (!frame) {
            complete();
            locked = false;
            return;
        }

        while (frame.detailIndex < frame.details.length) {
            const item = frame.details[frame.detailIndex];
            if (data.details[item.code] || state.skipped[item.code]) {
                frame.detailIndex++;
                saveState();
                continue;
            }
            openItem(item, 'detail');
            return;
        }

        while (frame.childIndex < frame.children.length) {
            const item = frame.children[frame.childIndex];
            if (state.visitedPages[item.code] || state.skipped[item.code]) {
                frame.childIndex++;
                saveState();
                continue;
            }
            openItem(item, 'child');
            return;
        }

        if (state.stack.length === 1) {
            state.stack.pop();
            saveState();
            locked = false;
            moveToNextSubchapter();
            return;
        }

        state.stack.pop();
        state.nav = 'back-child';
        state.phase = 'ritorno al livello padre';
        state.currentCode = '';
        state.currentDescription = '';
        saveState();
        clickAidaBack();
    }

    function clearNavigationAndContinue() {
        state.nav = '';
        state.phase = 'elenco';
        state.currentCode = '';
        state.currentDescription = '';
        saveState();
        locked = false;
        setTimeout(nextStep, WAIT_STEP);
    }

    function skipCurrentAfterError(kind) {
        const frame = currentFrame();

        if (state.currentCode) {
            state.skipped[state.currentCode] = true;
        }

        if (frame) {
            if (kind === 'child') {
                frame.childIndex++;
            } else {
                frame.detailIndex++;
            }
        }

        clearNavigationAndContinue();
    }

    function recoverFromErrorPage() {
        const kind =
            state.nav === 'child' ||
            state.nav === 'back-child' ||
            state.nav === 'recover-child'
                ? 'child'
                : 'detail';

        recordError(
            'ERRORE_AIDA',
            bodyText().slice(0, 300)
        );

        state.nav = kind === 'child'
            ? 'recover-child'
            : 'recover-detail';

        state.phase = 'recupero automatico da errore';
        saveState();

        try {
            history.back();
        } catch (error) {
            recordError('RECUPERO_ERRORE_FALLITO', String(error));
            stop();
        }
    }

    function handleLoadedPage() {
        if (!state.running || state.paused || locked) return;

        state = load(STATE_KEY, emptyState());
        data = load(DATA_KEY, emptyData());

        if (!state.running || state.paused) return;

        if (isErrorPage()) {
            locked = true;
            recoverFromErrorPage();
            return;
        }

        if (state.nav === 'detail') {
            if (!isDetailPage()) return;

            locked = true;

            setTimeout(() => {
                const record = extractDetail();

                if (record) {
                    data.details[record.code] = record;
                } else {
                    recordError(
                        'DETTAGLIO_NON_LETTO',
                        'Impossibile leggere il dettaglio'
                    );

                    if (state.currentCode) {
                        state.skipped[state.currentCode] = true;
                    }
                }

                saveData();
                state.nav = 'back-detail';
                state.phase = 'ritorno dalla pagina dettaglio';
                saveState();

                locked = false;
                clickAidaBack();
            }, WAIT_PAGE);

            return;
        }

        if (state.nav === 'back-detail') {
            if (isDetailPage()) {
                locked = true;
                setTimeout(() => {
                    locked = false;
                    clickAidaBack();
                }, WAIT_STEP);
                return;
            }

            if (!isListPage()) return;

            locked = true;

            setTimeout(() => {
                const frame = currentFrame();
                if (frame) frame.detailIndex++;
                clearNavigationAndContinue();
            }, WAIT_STEP);

            return;
        }

        if (state.nav === 'recover-detail') {
            if (!isListPage()) return;

            locked = true;

            setTimeout(() => {
                skipCurrentAfterError('detail');
            }, WAIT_STEP);

            return;
        }

        if (state.nav === 'child') {
            if (!isListPage()) return;

            locked = true;

            setTimeout(() => {
                const parent = currentFrame();
                const item = parent?.children[parent.childIndex];

                if (!parent || !item) {
                    recordError(
                        'STATO_FIGLIO',
                        'Sottolivello non disponibile nello stato'
                    );
                    skipCurrentAfterError('child');
                    return;
                }

                const path = [
                    ...parent.path,
                    {
                        code: item.code,
                        description: item.description
                    }
                ];

                const frame = analyzeListPage(
                    item.code,
                    item.description,
                    path
                );

                state.stack.push(frame);
                state.visitedPages[item.code] = true;
                clearNavigationAndContinue();
            }, WAIT_PAGE);

            return;
        }

        if (state.nav === 'back-child') {
            if (!isListPage()) return;

            locked = true;

            setTimeout(() => {
                const parent = currentFrame();
                if (parent) parent.childIndex++;
                clearNavigationAndContinue();
            }, WAIT_STEP);

            return;
        }

        if (state.nav === 'recover-child') {
            if (!isListPage()) return;

            locked = true;

            setTimeout(() => {
                skipCurrentAfterError('child');
            }, WAIT_STEP);

            return;
        }

        if (state.nav === 'back-to-subchapter-form') {
            if (!isSubchapterFormPage()) {
                if (isListPage()) {
                    locked = true;
                    setTimeout(() => {
                        locked = false;
                        clickAidaBack();
                    }, WAIT_STEP);
                }
                return;
            }

            locked = true;
            setTimeout(() => {
                locked = false;
                submitSubchapter(state.activeSubchapter);
            }, WAIT_STEP);
            return;
        }

        if (state.nav === 'load-subchapter') {
            if (isSubchapterFormPage()) return;
            if (!isListPage()) return;

            locked = true;
            setTimeout(() => {
                const code = state.activeSubchapter || SUBCHAPTERS[state.subchapterIndex];
                const frame = analyzeListPage(
                    code,
                    'Sottocapitolo ' + code,
                    chapterPathFor(code)
                );

                state.stack = [frame];
                state.visitedPages[code] = true;
                clearNavigationAndContinue();
            }, WAIT_PAGE);
            return;
        }

        if (isListPage()) {
            locked = true;
            setTimeout(() => {
                locked = false;
                nextStep();
            }, WAIT_STEP);
        }
    }

    function configureTestSubchapter() {
        let value = currentSubchapterFromPage() || selectedSubchapter || '0301';
        value = prompt('Sottocapitolo TARIC da testare (4 cifre):', value);
        if (value === null) return false;

        value = digits(value);
        if (!/^\d{4}$/.test(value)) {
            alert('Inserisci un sottocapitolo TARIC di 4 cifre, ad esempio 0301.');
            return false;
        }

        selectedSubchapter = value;
        ALLOWED_CHAPTERS = [value.slice(0, 2)];
        SUBCHAPTERS = [value];
        localStorage.setItem(TEST_CODE_KEY, value);
        return true;
    }

    function start() {
        if (state.running) return alert('Il crawler è già in esecuzione.');
        if (!configureTestSubchapter()) return;

        const startCode = selectedSubchapter;
        const startIndex = 0;

        state = emptyState();
        data = emptyData();
        state.running = true;
        state.phase = 'avvio ' + startCode;
        state.subchapterIndex = startIndex;
        state.activeSubchapter = startCode;
        saveData();
        saveState();

        if (isSubchapterFormPage()) {
            submitSubchapter(startCode);
            return;
        }

        if (!isListPage()) {
            state.running = false;
            saveState();
            return alert(
                'Apri la tabella del sottocapitolo oppure la schermata con il campo TARIC a 4 cifre e riprova.'
            );
        }

        const frame = analyzeListPage(
            startCode,
            'Sottocapitolo ' + startCode,
            chapterPathFor(startCode)
        );

        if (!frame.children.length && !frame.details.length && !(data.tables[startCode]?.rows || []).length) {
            state.running = false;
            saveState();
            return alert('La pagina aperta non sembra contenere la nomenclatura di ' + startCode + '.');
        }

        state.stack = [frame];
        state.visitedPages[startCode] = true;
        state.phase = 'elenco ' + startCode;
        saveState();
        setTimeout(nextStep, WAIT_STEP);
    }

    function pause() {
        state.paused = true;
        state.phase = 'pausa';
        saveState();
        locked = false;
    }

    function resume() {
        state = load(STATE_KEY, emptyState());
        data = load(DATA_KEY, emptyData());
        state.paused = false;
        state.running = true;
        saveState();
        locked = false;
        setTimeout(handleLoadedPage, 200);
    }

    function stop() {
        state.running = false;
        state.paused = false;
        state.phase = 'fermo';
        saveState();
    }

    function complete() {
        state.running = false;
        state.phase = 'completato';
        saveState();
        alert(`Test sottocapitolo ${selectedSubchapter} completato. Dettagli: ${Object.keys(data.details).length}. Tabelle: ${Object.keys(data.tables).length}. Errori: ${state.errors.length}.`);
    }

    function csvValue(value) {
        let text = String(value ?? '').trim();
        if (/^[=+\-@]/.test(text)) text = "'" + text;
        return `"${text.replace(/"/g, '""')}"`;
    }

    function download(name, rows) {
        const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    function downloadDetails() {
        const rows = [[
            'CODICE_TARIC', 'CAPITOLO', 'DESCRIZIONE', 'PERCORSO_CODICI',
            'PERCORSO_DESCRIZIONI', 'INIZIO_VALIDITA', 'FINE_VALIDITA',
            'NUMERO_TRATTINI', 'UNITA_SUPPLEMENTARE', 'DATA_ESTRAZIONE'
        ].map(csvValue).join(';')];

        Object.values(data.details).sort((a, b) => a.code.localeCompare(b.code)).forEach(r => {
            rows.push([
                r.code, r.chapter, r.description, r.pathCodes, r.pathDescriptions,
                r.validFrom, r.validTo, r.dashCount, r.supplementaryUnit, r.extractedAt
            ].map(csvValue).join(';'));
        });
        download(`TARIC_TEST_${selectedSubchapter}_DETTAGLI.csv`, rows);
    }

    function downloadTables() {
        const rows = [[
            'PAGINA', 'PERCORSO_CODICI', 'CODICE_VISUALIZZATO', 'CODICE_NORMALIZZATO',
            'DESCRIZIONE', 'DESCRIZIONE_ORIGINALE', 'LIVELLO_TRATTINI', 'RIGA_PAGINA', 'DATA_ESTRAZIONE'
        ].map(csvValue).join(';')];

        Object.values(data.tables).forEach(page => {
            page.rows.forEach(r => rows.push([
                r.pageCode, r.pathCodes, r.displayedCode, r.normalizedCode,
                r.description, r.originalDescription, r.level, r.rowNumber, page.extractedAt
            ].map(csvValue).join(';')));
        });
        download(`TARIC_TEST_${selectedSubchapter}_TABELLE_COMPLETE.csv`, rows);
    }

    function reset() {
        if (!confirm('Cancellare stato e dati raccolti?')) return;
        state = emptyState();
        data = emptyData();
        localStorage.removeItem(STATE_KEY);
        localStorage.removeItem(DATA_KEY);
        updatePanel();
    }

    function button(label, handler, background = '#356c9e', color = '#fff') {
        const element = document.createElement('button');
        element.textContent = label;
        Object.assign(element.style, {
            width: '100%', marginTop: '6px', padding: '8px', border: '1px solid #fff',
            borderRadius: '5px', background, color, fontWeight: 'bold', cursor: 'pointer'
        });
        element.addEventListener('click', handler);
        return element;
    }

    function updatePanel() {
        const box = document.querySelector('#aida-v6-status');
        if (!box) return;
        const frame = currentFrame();
        box.innerHTML = `
            <b>Stato:</b> ${state.paused ? 'PAUSA' : state.phase}<br>
            <b>Livello:</b> ${frame?.code || '-'}<br>
            <b>Dettagli:</b> ${Object.keys(data.details).length}<br>
            <b>Tabelle:</b> ${Object.keys(data.tables).length}<br>
            <b>Codice:</b> ${state.currentCode || '-'}<br>
            <b>Errori:</b> ${state.errors.length}
        `;
    }

    function createPanel() {
        if (document.getElementById(PANEL_ID)) return;
        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        Object.assign(panel.style, {
            position: 'fixed', right: '15px', bottom: '15px', width: '285px', padding: '12px',
            zIndex: '2147483647', background: '#17466f', color: '#fff', border: '2px solid #fff',
            borderRadius: '8px', fontFamily: 'Arial,sans-serif', fontSize: '13px',
            boxShadow: '0 4px 18px rgba(0,0,0,.45)'
        });
        const title = document.createElement('div');
        title.textContent = 'TARIC BUILDER — TEST SINGOLO';
        title.style.cssText = 'font-weight:bold;text-align:center;font-size:15px;margin-bottom:8px';
        const status = document.createElement('div');
        status.id = 'aida-v6-status';
        status.style.cssText = 'padding:8px;background:rgba(255,255,255,.12);border-radius:5px;line-height:1.5';
        panel.append(title, status,
            button('TESTA SOTTOCAPITOLO', start, '#fff', '#17466f'),
            button('PAUSA', pause, '#c97d10'),
            button('RIPRENDI', resume),
            button('FERMA', stop, '#a82b2b'),
            button('SCARICA DETTAGLI', downloadDetails),
            button('SCARICA TABELLE COMPLETE', downloadTables),
            button('AZZERA', reset)
        );
        document.body.appendChild(panel);
        updatePanel();
    }

    function init() {
        state = load(STATE_KEY, emptyState());
        data = load(DATA_KEY, emptyData());
        createPanel();
        updatePanel();
        if (state.running && !state.paused) setTimeout(handleLoadedPage, 400);
    }

    window.addEventListener('pageshow', () => {
        locked = false;
        state = load(STATE_KEY, emptyState());
        data = load(DATA_KEY, emptyData());
        createPanel();
        updatePanel();

        if (state.running && !state.paused) {
            setTimeout(handleLoadedPage, 250);
        }
    });

    setInterval(() => {
        const latest = load(STATE_KEY, emptyState());

        if (!latest.running || latest.paused || locked) return;

        state = latest;
        data = load(DATA_KEY, emptyData());
        handleLoadedPage();
    }, 1000);

    init();
})();
