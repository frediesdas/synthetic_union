# MELODAI Festivalen Voting

Deutscher Voting-Prototyp fuer ein Album mit 31 Songs aus 31 Laendern im ESC-Stil.

## Funktionen

- Einmal abstimmen pro Browser/Geraet
- ESC-Punktesystem mit `1, 2, 3, 4, 5, 6, 7, 8, 10, 12`
- Live-Gesamtwertung mit Ranking
- Punktevergabetabelle pro Song
- Installierbare Web-App als erste PWA-Basis

## Projekt starten

1. Abhaengigkeiten installieren:

```bash
npm install
```

2. Entwicklungsserver starten:

```bash
npm run dev
```

3. Danach oeffnen:

- Client: `http://localhost:5173`
- Server: `http://localhost:3001`

## Daten

- Songdaten: [data/contestants.json](/Users/fred/Documents/New%20project/data/contestants.json)
- Gespeicherte Stimmen: [server/data/votes.json](/Users/fred/Documents/New%20project/server/data/votes.json)
- Flaggen und App-Assets: [public](/Users/fred/Documents/New%20project/public)

## Hinweise

- Die Geraete-Sperre basiert auf einer lokalen Browser-ID und ist bewusst einfach gehalten.
- Wenn Browserdaten geloescht oder ein anderes Geraet verwendet wird, kann erneut abgestimmt werden.
- Streaming-Links koennen spaeter noch im Interface ergaenzt werden.
