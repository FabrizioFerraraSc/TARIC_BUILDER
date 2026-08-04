# Architettura

## Obiettivo

TARIC BUILDER visita le pagine della nomenclatura AIDA, ricostruisce la gerarchia dei codici e raccoglie sia le righe tabellari sia i dettagli dei codici finali.

## Componenti attuali

### Riconoscimento pagina

Le funzioni `isSubchapterFormPage`, `isListPage`, `isDetailPage` e `isErrorPage` classificano la pagina corrente.

### Navigazione

La navigazione usa i comandi nativi AIDA quando disponibili. `history.back()` viene usato soltanto come recupero in assenza del pulsante AIDA “Indietro”.

### Macchina a stati

Lo stato persistente contiene:

- esecuzione e pausa;
- fase corrente;
- tipo di navigazione attesa;
- stack dei livelli visitati;
- codice e descrizione correnti;
- pagine visitate;
- elementi saltati;
- errori;
- sottocapitolo attivo.

### Persistenza

Stato e dati sono serializzati in `localStorage`, permettendo la ripresa dopo le navigazioni interne del portale.

### Estrazione

- `extractAllTableRows` acquisisce le righe della tabella corrente.
- `extractDetail` acquisisce validità, trattini e unità supplementare.
- `analyzeListPage` individua collegamenti a dettagli e sottolivelli.

### Esportazione

I dati sono esportati in CSV con separatore `;`, BOM UTF-8 e protezione di base contro la formula injection.

## Vincoli attuali

- Capitoli abilitati: 01 e 02.
- Elenco sottocapitoli configurato manualmente.
- Persistenza limitata alla capacità di `localStorage`.
- Interfaccia concentrata in un singolo pannello.

## Direzione tecnica

L'estensione futura dovrà preservare un unico file `.user.js` installabile, ma separare internamente configurazione, storage, parser, navigazione, esportazione e interfaccia in sezioni chiaramente delimitate.
