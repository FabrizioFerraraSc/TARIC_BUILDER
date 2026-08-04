# Roadmap

## Fase 1 — Stabilizzazione

- mantenere il comportamento della V8;
- uniformare naming e versione;
- aggiungere documentazione e controlli di sintassi;
- introdurre log più leggibili e diagnostica esportabile.

## Fase 2 — Configurazione capitoli

- sostituire l'elenco rigido dei capitoli con una configurazione selezionabile;
- consentire intervalli di capitoli e sottocapitoli;
- validare automaticamente i codici disponibili;
- mostrare avanzamento per capitolo e sottocapitolo.

## Fase 3 — Persistenza robusta

- migrare i dati voluminosi da `localStorage` a IndexedDB;
- aggiungere checkpoint versionati;
- importare ed esportare backup JSON;
- riprendere in sicurezza dopo chiusura o crash del browser.

## Fase 4 — Esportazioni

- CSV unificato;
- JSON strutturato;
- eventuale pacchetto SQLite generato lato browser;
- report errori e codici saltati.

## Fase 5 — Affidabilità AIDA

- retry con backoff;
- rilevamento di pagine ferme o inattese;
- timeout configurabili;
- diagnostica HTML minima per gli errori non riconosciuti.

## Regola di sviluppo

Ogni modifica funzionale deve essere introdotta con un commit separato e deve mantenere installabile `TARIC_BUILDER.user.js` direttamente tramite Tampermonkey.
