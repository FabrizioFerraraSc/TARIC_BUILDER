# TARIC BUILDER

Userscript Tampermonkey per estrarre e organizzare la nomenclatura TARIC dal portale AIDA dell'Agenzia delle Dogane e dei Monopoli.

## Stato del progetto

La versione `1.0.0` usa come base la precedente V8 e mantiene il comportamento già testato sui capitoli 01 e 02, inclusi:

- navigazione automatica tra sottocapitoli e sottolivelli;
- apertura e lettura dei dettagli nomenclatura;
- salvataggio progressivo in `localStorage`;
- pausa, ripresa e recupero dagli errori AIDA;
- esportazione CSV dei dettagli;
- esportazione CSV delle tabelle complete.

## Installazione

1. Installa Tampermonkey su Chrome.
2. Apri `TARIC_BUILDER.user.js` nel repository.
3. Usa il pulsante **Raw**.
4. Tampermonkey proporrà l'installazione dello userscript.
5. Apri il portale AIDA e raggiungi la schermata TARIC.

## Compatibilità dati

Le chiavi `localStorage` della V8 sono mantenute temporaneamente per evitare di perdere eventuali raccolte già avviate:

- `AIDA_V8_01_02_STATE`
- `AIDA_V8_01_02_DATA`

## Struttura

- `TARIC_BUILDER.user.js`: file principale installabile in Tampermonkey.
- `CHANGELOG.md`: cronologia delle versioni.
- `docs/ARCHITECTURE.md`: descrizione dei componenti e della macchina a stati.
- `docs/ROADMAP.md`: sviluppo previsto.

## Avvertenza

Il progetto automatizza la navigazione di un sito esterno. Cambiamenti HTML, JavaScript o lato server del portale AIDA possono richiedere aggiornamenti dello script.
