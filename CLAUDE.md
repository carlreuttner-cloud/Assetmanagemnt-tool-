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

# Fachliche Regeln (gelten für alle Phasen)

- **Nachvollziehbarkeit:** Jede wesentliche Zahl hat Quelle, Stichtag und eine nachvollziehbare Berechnung, die in der Ansicht abrufbar ist (z. B. aufklappbare Herleitung neben dem Wert).
- **Unbekannt statt 0:** Fehlende Werte bleiben „unbekannt“ (`null`) und werden nie als 0 ergänzt; Summen mit fehlenden Teilen werden als unvollständig gekennzeichnet. Werte mit unterschiedlichen Stichtagen nicht stillschweigend vermischen, sondern den Stichtag je Wert zeigen.
- **Restschuld:** nur aus belegten Salden je Kredit (Kontoauszug, Bankbestätigung, Jahresabschluss) im Jahresvergleich, als Jahrestabelle und Diagramm je Kredit mit Quelle. Buchungssummen nie als Restschuld ausgeben. Salden mit unklarem Stichtag getrennt zeigen, Entwürfe als Entwurf kennzeichnen, Guthaben getrennt von Darlehen führen.
- **Verständlichkeit:** Abkürzungen (JNKM, LTV, DSCR, ICR …) direkt in der Ansicht erklären (Glossar in `src/i18n`), Diagramme mit klarem Titel und Einheit beschriften (z. B. „EBITDA je Geschäftsjahr“).
- **Keine Schätzungen bei Lücken:** Unbekannte Einzahlungen, Vertragsregeln oder Gutachterwerte nicht schätzen, sondern als Datenlücke anzeigen.
