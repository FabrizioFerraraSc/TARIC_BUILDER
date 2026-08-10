// ==UserScript==
// @name         TARIC BUILDER - AIDA Back Hotfix
// @namespace    fabry-aida-crawler
// @version      0.1.0
// @description  Evita ERR_CACHE_MISS intercettando history.back() e usando il controllo Indietro nativo di AIDA.
// @match        https://aidaonline7.adm.gov.it/*
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const nativeBack = win.History.prototype.back;

    function clean(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function visible(element) {
        if (!element) return false;
        try {
            const style = win.getComputedStyle(element);
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   element.type !== 'hidden';
        } catch (_) {
            return true;
        }
    }

    function labelsOf(element) {
        return [
            element.value,
            element.innerText,
            element.textContent,
            element.getAttribute?.('title'),
            element.getAttribute?.('alt'),
            element.getAttribute?.('aria-label'),
            element.getAttribute?.('name'),
            element.id,
            element.getAttribute?.('onclick')
        ]
            .map(value => clean(value).toLowerCase())
            .filter(Boolean)
            .join(' ');
    }

    function findAidaBackControl() {
        const candidates = [
            ...document.querySelectorAll('input, button, a, img')
        ];

        for (const element of candidates) {
            if (!visible(element)) continue;

            const labels = labelsOf(element);
            if (!labels.includes('indietro')) continue;

            if (element.matches('img')) {
                const parent = element.closest('a, button');
                if (parent) return parent;
            }

            if (typeof element.click === 'function') {
                return element;
            }
        }

        return null;
    }

    function safeBack() {
        const control = findAidaBackControl();

        if (control) {
            console.info('[TARIC BUILDER HOTFIX] Uso Indietro nativo AIDA:', control);
            control.click();
            return;
        }

        console.error('[TARIC BUILDER HOTFIX] Indietro AIDA non trovato. history.back() bloccato per evitare ERR_CACHE_MISS.');
        win.alert(
            'TARIC BUILDER: non ho trovato il pulsante Indietro di AIDA. ' +
            'Ho bloccato il ritorno del browser per evitare ERR_CACHE_MISS.'
        );
    }

    try {
        Object.defineProperty(win.History.prototype, 'back', {
            configurable: true,
            writable: true,
            value: safeBack
        });
        console.info('[TARIC BUILDER HOTFIX] history.back() protetto.');
    } catch (error) {
        console.error('[TARIC BUILDER HOTFIX] Override History.prototype.back fallito:', error);

        try {
            win.history.back = safeBack;
        } catch (fallbackError) {
            console.error('[TARIC BUILDER HOTFIX] Override fallback fallito:', fallbackError);
        }
    }

    win.__TARIC_BUILDER_NATIVE_HISTORY_BACK__ = nativeBack;
})();
