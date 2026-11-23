@AGENTS.md

# Projektregeln

- Sprache: Code-Bezeichner für Fachbegriffe auf Deutsch ohne Umlaute (`Mietverhaeltnis`, `flaeche`), Oberflächentexte nur über `src/i18n`.
- Fachliche Daten nur über `kontext.db` (siehe `src/lib/db/mandant.ts`), nie über `basisDb`.
- Jede Seite und Server-Aktion beginnt mit `pruefeZugriff(bereich, aktion)`; für HAUSVERWALTUNG und INVESTOR zusätzlich `sichtbarkeit()` filtern.
- Beträge nur als Decimal (`src/lib/geld.ts`), nie `number`/`parseFloat`. An den Browser als Text.
- Mieten: gespeichert wird nur die Monats-Nettokaltmiete; überall zusätzlich die Jahresnettokaltmiete mit `jahresNettokaltmiete()` (`src/lib/miete.ts`) anzeigen, nie speichern.
- Keine Geheimnisse committen (.env, Schlüssel); nur `.env.example` mit Platzhaltern.
- Nach Schemaänderungen: `npm run db:migrate -- --name <name>` und `npx prisma generate`.
- Vor dem Abschluss: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
