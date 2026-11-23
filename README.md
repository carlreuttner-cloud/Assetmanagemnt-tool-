# Immobilien-Portfolio

Web-App zur Verwaltung und Analyse eines Immobilienportfolios: Gesellschaften, Häuser, Einheiten, Mieter, Kredite. Mandantenfähig, damit sie später an andere Firmen verkauft werden kann.

**Stand:** Phase 0 (Grundgerüst), Phase 1 (Gesellschaften und Kredite), Phase 2 (Häuser), Phase 3 (Mieter) und Phase 4 (Import) sind fertig; die weiteren Fachseiten folgen laut [Roadmap](ROADMAP.md).

## Technik

| Bereich | Wahl |
|---|---|
| Oberfläche und Server | Next.js 16 (App Router), TypeScript, React 19 |
| Gestaltung | Tailwind CSS 4 |
| Datenbank | PostgreSQL 16 mit Prisma 7 |
| Anmeldung | Auth.js (next-auth v5), E-Mail und Passwort, Passwörter mit Argon2id |
| Beträge | `Decimal` in Datenbank und Code (decimal.js), nie Gleitkommazahlen |
| Betrieb | Docker Compose, lokal und später auf einem Server in Deutschland |

## Schnellstart mit Docker

Voraussetzung: [Docker Desktop](https://www.docker.com/products/docker-desktop/) (oder Docker Engine mit Compose).

```bash
cp .env.example .env            # dann alle Platzhalter "bitte-ersetzen" ersetzen
docker compose up --build -d    # startet Datenbank, spielt Migrationen ein, startet die App
docker compose run --rm migrate npm run db:seed   # Testdaten anlegen (löscht alle Daten!)
```

Danach die App unter <http://localhost:3000> öffnen.

Stoppen mit `docker compose down`. Die Daten bleiben im Docker-Volume erhalten; `docker compose down -v` löscht auch sie.

## Entwicklung ohne App-Container

Schneller für die tägliche Arbeit, weil Änderungen sofort sichtbar sind. Voraussetzung: Node.js 22.

```bash
cp .env.example .env            # alle Platzhalter ersetzen (AUTH_SECRET z. B. mit: openssl rand -base64 32)
docker compose up -d db         # nur die Datenbank starten
npm install                     # erzeugt auch den Prisma-Client
npm run db:deploy               # Migrationen einspielen
npm run db:seed                 # Testdaten anlegen
npm run dev                     # http://localhost:3000
```

## Testzugänge (nur lokal)

Passwort für alle: der Wert von `SEED_PASSWORT` aus deiner `.env`.

| E-Mail | Rolle | Sieht |
|---|---|---|
| admin@demo.local | Admin | alles; gehört zusätzlich zum Mandanten „Zweite Kunde AG“ (Wechsel unten in der Seitenleiste) |
| mitarbeiter@demo.local | Mitarbeiter | alles außer Benutzerverwaltung |
| hausverwaltung@demo.local | Hausverwaltung | nur Import, nur für die Häuser Lindenhofstraße 12 (Berlin) und Rheinuferweg 18 (Köln) |
| investor@demo.local | Investor | nur lesen, nur die Gesellschaft „Lindenhof Wohnen GmbH & Co. KG“ |

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` / `npm start` | Produktions-Build und -Start |
| `npm test` | Tests (die Mandanten-Tests laufen nur, wenn `DATABASE_URL` erreichbar ist) |
| `npm run lint` / `npm run typecheck` | Code- und Typprüfung |
| `npm run db:migrate -- --name <name>` | Nach Schemaänderung eine neue Migration erzeugen |
| `npm run db:deploy` | Migrationen einspielen (Produktion, CI) |
| `npm run db:seed` | Testdaten neu anlegen (löscht alles; in Produktion gesperrt) |
| `npm run testdaten:csv` | Beispiel-CSVs unter `testdaten/` neu schreiben (nach Änderungen am Generator) |
| `npm run db:studio` | Datenbank im Browser ansehen |

## Aufbau

```
prisma/
  schema.prisma          Datenmodell (mit Kommentaren)
  migrations/            Datenbank-Migrationen
  seed.ts                Testdaten (Demo-Benutzer und Testportfolio)
  testdaten/             Generator für das Testportfolio
src/
  auth.ts                Anmeldung (Auth.js)
  app/
    login/               Anmeldeseite
    (app)/               alle Seiten hinter dem Login, mit Seitenleiste
    aktionen.ts          Anmelden, Abmelden, Mandant wechseln
  lib/
    auth/kontext.ts      getKontext(): Benutzer, aktiver Mandant, Rolle, Datenbankzugriff
    auth/rechte.ts       Was jede Rolle darf
    auth/sichtbarkeit.ts Welche Häuser/Gesellschaften eingeschränkte Rollen sehen
    db/mandant.ts        Mandantenfilter und Änderungsprotokoll
    geld.ts              Rechnen, Einlesen und Formatieren von Beträgen
    datum.ts             Kalenderdaten als "JJJJ-MM-TT", Monatsrechnung, Formatierung
    kredit.ts            Restschuld, Zinssatz, Kapitaldienst, Zinsbindung, Tilgungspläne, Covenants
    kennzahlen.ts        Kennzahlen je Haus, Gesellschaft und Portfolio (LTV, DSCR, Leerstand, Rendite)
    daten/portfolio.ts   lädt die Rechengrundlage für den sichtbaren Ausschnitt des Mandanten
    format.ts            Anzeigeformate (Beträge, Prozent, Fläche, Datum) je Mandant
    formular.ts          Formularfelder in Server-Aktionen einlesen, Fehlermeldungen
    mietverhaeltnis.ts   Status, Monate seit Mieterhöhung, Überschneidungsprüfung
    dateispeicher.ts     Fotos im UPLOAD_DIR je Mandant, Typprüfung am Dateiinhalt
    import/              CSV lesen (Zeichensatz, Trennzeichen, Zahlen, Daten), Bank-CSVs, Mieterlisten-Abgleich
    navigation.ts        Einträge der Seitenleiste
  i18n/                  Oberflächentexte (vorerst nur Deutsch)
test/                    Tests
testdaten/               Beispiel-CSVs (Kreditbuchungen in 3 Bankformaten) und Übersichten, siehe testdaten/README.md
```

## Wichtige Regeln für die Weiterentwicklung

**Mandanten.** Fachliche Daten immer über `kontext.db` lesen und schreiben (aus `getKontext()` oder `pruefeZugriff()`). Dieser Zugriff setzt die `mandantId` automatisch, lehnt fremde Mandanten ab, prüft dass verknüpfte Datensätze (z. B. `hausId`) zum selben Mandanten gehören, und schreibt jede Änderung ins Änderungsprotokoll. `basisDb` ohne Filter ist nur für Anmeldung und Verwaltung gedacht. Verschachteltes Anlegen (`create` mit `einheiten: { create: … }`) wird nicht unterstützt; Datensätze einzeln anlegen.

**Rollen.** Jede Seite und jede Server-Aktion beginnt mit `pruefeZugriff("<bereich>", "lesen" | "schreiben")`. Für Hausverwaltung und Investoren zusätzlich `sichtbarkeit(kontext)` als Filter verwenden, damit sie nur ihre zugewiesenen Häuser bzw. Gesellschaften sehen.

**Beträge.** Geld als `Decimal(14, 2)`, Zinssätze und Prozentanteile als `Decimal(9, 6)` in Prozentpunkten (3,125 % wird als `3.125` gespeichert). Im Code mit `dezimal()` aus `@/lib/geld` rechnen, Eingaben mit `parseBetrag()` lesen, mit `formatBetrag()` anzeigen und mit `zuText()` an den Browser geben. `parseFloat` ist per Lint-Regel gesperrt.

**Mieten.** Ist- und Soll-Miete sind die Nettokaltmiete pro Monat. Überall, wo eine Miete angezeigt wird, zusätzlich die Jahresnettokaltmiete (× 12) anzeigen. Sie wird mit `jahresNettokaltmiete()` aus `@/lib/miete` berechnet und nie gespeichert.

**Sprache und Währung.** Vorerst nur Deutsch und Euro. Vorbereitet ist: jeder Mandant hat `waehrung` und `sprache`, jeder Benutzer optional eine eigene `sprache`; alle Oberflächentexte liegen in `src/i18n/de.ts`. Für eine neue Sprache eine Datei mit derselben Struktur anlegen und in `src/i18n/index.ts` eintragen.

**Kennzahlen.** Alle Berechnungen stehen als reine Funktionen in `src/lib/kredit.ts` und `src/lib/kennzahlen.ts` und werden in `test/kredit.test.ts` gegen die Sollwerte des Testdatengenerators geprüft. Festlegungen:
- Restschuld: Saldo der jüngsten Buchung bis zum Stichtag, sonst Restschuld laut gültigem Tilgungsplan, sonst Ursprungsbetrag.
- Variabler Zins: letzter Referenzzins bis heute, mindestens 0 % (Floor), plus Marge.
- Kapitaldienst: Zins- und Tilgungsbuchungen der letzten 12 Monate ohne Sondertilgungen; fehlen sie, aus Rate und Zinssatz hochgerechnet.
- LTV = Restschuld / Verkehrswert. DSCR (vereinfacht) = Ist-Jahresnettokaltmiete / Kapitaldienst, ohne Bewirtschaftungskosten.
- Häuser tragen Kredite anteilig (`KreditHaus.anteilProzent`); Gesellschaft und Portfolio zählen ihre Kredite zu 100 %.
- Covenants eines Kredits werden über alle Häuser geprüft, die er belastet, mit allen Krediten dieser Häuser.

**Fotos.** Werden im Verzeichnis `UPLOAD_DIR` (Docker-Volume `uploads`) je Mandant abgelegt und nur über `/api/fotos/<id>` mit Mandanten- und Rechteprüfung ausgeliefert. Erlaubt sind JPEG, PNG und WebP bis 10 MB; der Typ wird am Dateiinhalt geprüft. Backups und S3-Speicher folgen in der Phase „Produktionsreife“.

**Import.** Bank-CSVs und Mieterlisten werden nicht über feste Formate, sondern über bekannte Spaltennamen erkannt (deutsch und englisch, mit oder ohne Einheiten wie „(EUR)“). Neue Spaltennamen in `src/lib/import/kreditbuchungen.ts` bzw. `mieterliste.ts` ergänzen und in `test/import.test.ts` bzw. `test/mieterliste.test.ts` absichern. Jeder Import zeigt erst eine Vorschau; beim Übernehmen rechnet der Server den Plan aus der Datei neu und vertraut nicht der Vorschau im Browser. Dubletten bei Kreditbuchungen: gleicher Kredit, Tag, Art und Betrag. Eine Mieterliste ein zweites Mal hochzuladen ändert nichts. Jeder übernommene Import steht in `Importvorgang`, jede einzelne Änderung im Änderungsprotokoll.

## Betrieb auf einem Server (später)

Das Docker-Setup ist so gebaut, dass es unverändert auf einem Server (z. B. Hetzner, Standort Deutschland) laufen kann. Was vor der Nutzung echter Daten noch fehlt, steht als eigene Phase in der [Roadmap](ROADMAP.md).

## Geheimnisse

`.env`-Dateien, Schlüssel und Zertifikate stehen in der `.gitignore` und gehören nie ins Repository. Ins Repository darf nur `.env.example` mit Platzhaltern. Auch Datenbank-Passwort, `AUTH_SECRET` und das Demo-Passwort stehen nur in der `.env`; `docker compose` startet nicht, wenn sie fehlen. Der Seed verweigert den Start mit `NODE_ENV=production`.
