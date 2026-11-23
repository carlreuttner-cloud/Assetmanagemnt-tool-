# Immobilien-Portfolio

Web-App zur Verwaltung und Analyse eines Immobilienportfolios: Gesellschaften, Häuser, Einheiten, Mieter, Kredite. Mandantenfähig, damit sie später an andere Firmen verkauft werden kann.

**Stand: Phase 0 (Grundgerüst).** Login, Rollen, Mandantentrennung, Datenmodell und die leere Oberfläche stehen. Die Fachseiten folgen in den nächsten Phasen.

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
| hausverwaltung@demo.local | Hausverwaltung | nur Import, nur für das Haus Lindenstraße 12 |
| investor@demo.local | Investor | nur lesen, nur die Gesellschaft „Demo Wohnen GmbH & Co. KG“ |

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
| `npm run db:studio` | Datenbank im Browser ansehen |

## Aufbau

```
prisma/
  schema.prisma          Datenmodell (mit Kommentaren)
  migrations/            Datenbank-Migrationen
  seed.ts                Testdaten
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
    navigation.ts        Einträge der Seitenleiste
  i18n/                  Oberflächentexte (vorerst nur Deutsch)
test/                    Tests
```

## Wichtige Regeln für die Weiterentwicklung

**Mandanten.** Fachliche Daten immer über `kontext.db` lesen und schreiben (aus `getKontext()` oder `pruefeZugriff()`). Dieser Zugriff setzt die `mandantId` automatisch, lehnt fremde Mandanten ab, prüft dass verknüpfte Datensätze (z. B. `hausId`) zum selben Mandanten gehören, und schreibt jede Änderung ins Änderungsprotokoll. `basisDb` ohne Filter ist nur für Anmeldung und Verwaltung gedacht. Verschachteltes Anlegen (`create` mit `einheiten: { create: … }`) wird nicht unterstützt; Datensätze einzeln anlegen.

**Rollen.** Jede Seite und jede Server-Aktion beginnt mit `pruefeZugriff("<bereich>", "lesen" | "schreiben")`. Für Hausverwaltung und Investoren zusätzlich `sichtbarkeit(kontext)` als Filter verwenden, damit sie nur ihre zugewiesenen Häuser bzw. Gesellschaften sehen.

**Beträge.** Geld als `Decimal(14, 2)`, Zinssätze und Prozentanteile als `Decimal(9, 6)` in Prozentpunkten (3,125 % wird als `3.125` gespeichert). Im Code mit `dezimal()` aus `@/lib/geld` rechnen, Eingaben mit `parseBetrag()` lesen, mit `formatBetrag()` anzeigen und mit `zuText()` an den Browser geben. `parseFloat` ist per Lint-Regel gesperrt.

**Mieten.** Ist- und Soll-Miete sind die Nettokaltmiete pro Monat. Überall, wo eine Miete angezeigt wird, zusätzlich die Jahresnettokaltmiete (× 12) anzeigen. Sie wird mit `jahresNettokaltmiete()` aus `@/lib/miete` berechnet und nie gespeichert.

**Sprache und Währung.** Vorerst nur Deutsch und Euro. Vorbereitet ist: jeder Mandant hat `waehrung` und `sprache`, jeder Benutzer optional eine eigene `sprache`; alle Oberflächentexte liegen in `src/i18n/de.ts`. Für eine neue Sprache eine Datei mit derselben Struktur anlegen und in `src/i18n/index.ts` eintragen.

## Betrieb auf einem Server (später)

Das Docker-Setup ist so gebaut, dass es unverändert auf einem Server (z. B. Hetzner, Standort Deutschland) laufen kann. Was vor der Nutzung echter Daten noch fehlt, steht als eigene Phase in der [Roadmap](ROADMAP.md).

## Geheimnisse

`.env`-Dateien, Schlüssel und Zertifikate stehen in der `.gitignore` und gehören nie ins Repository. Ins Repository darf nur `.env.example` mit Platzhaltern. Auch Datenbank-Passwort, `AUTH_SECRET` und das Demo-Passwort stehen nur in der `.env`; `docker compose` startet nicht, wenn sie fehlen. Der Seed verweigert den Start mit `NODE_ENV=production`.
