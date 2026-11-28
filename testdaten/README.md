# Testdaten

Frei erfundener, aber realistischer Datensatz, damit alle Fenster und Grafiken mit echten Fällen getestet werden können. Alle Namen, Adressen, Banken und IBANs sind erfunden.

- **Datenbank:** `npm run db:seed` legt alles im Mandanten „Demo Immobilien GmbH“ an (löscht vorher alle Daten).
- **CSV-Dateien:** liegen hier im Ordner. Nach Änderungen am Generator mit `npm run testdaten:csv` neu schreiben; der Test `test/testdaten.test.ts` schlägt fehl, wenn sie nicht mehr passen.
- **Generator:** `prisma/testdaten/` (reproduzierbar: gleicher Code ergibt immer dieselben Werte).

## Inhalt

| | |
|---|---|
| Gesellschaften | 5 (Lindenhof Wohnen, Rheinblick Immobilien, Elbufer Grundbesitz, Isartal Wohnbau, Mainhaus Bestand), je 3 Häuser |
| Häuser | 15, Verkehrswert 8,0 bis 20,0 Mio. € in gleichmäßigen Schritten (Gutachten 31.12.2025, dazu Werte 2023 und 2024), Kaufpreis 5 bis 12 % darunter |
| Mieten | Jahres-Soll-Nettokaltmiete = Kaufpreis / Kaufpreisfaktor 19 bis 24,8 (Bruttoanfangsrendite ca. 4,0 bis 5,3 %); Mietniveau je Stadt von ca. 9 €/m² (Dresden) bis 20,50 €/m² (München) |
| Einheiten | 38 bis 77 je Haus, 5 Häuser mit 1 bis 3 Gewerbeeinheiten |
| Leerstand | 8 Häuser voll vermietet, 7 mit ca. 6 bis 12 % Leerstand (nach Fläche). Leere Einheiten haben eine erwartete Miete (Soll-Miete für Leerstand), teils ein beendetes Vormietverhältnis |
| Mieter | je Haus 2 bis 4 Altmieter deutlich unter dem Hausdurchschnitt pro m², 2 bis 4 mit Rückstand (Ist-Miete 0 oder Teilzahlung), teils eine Mietminderung, unterschiedliche Daten der letzten Mieterhöhung |
| Kredite | 25, davon 7 variabel (3M- oder 6M-Euribor plus Marge, Zinsfloor 0 %), 18 fest; LTV je Haus 53 bis 68 % |
| Buchungen | 24 Monate (11/2024 bis 10/2026), je Zahlung eine Zins- und eine Tilgungsabbuchung mit Kontostand danach; 2 Kredite zahlen vierteljährlich |
| Stände der Mieterliste | je Haus 6 Monatsstände (die letzten 6 Monatsenden) mit Mieterhöhungen, Minderungen, Mieterwechseln, neuem und beendetem Leerstand, Flächenkorrekturen; in einem Stand fehlen Werte (unbekannt) |
| Hausverwaltungen | 3 (Hanse, Elbufer, Mittelweg), ein Wechsel Hanse → Elbufer vor drei Monaten, ein Haus ohne Hausverwaltung |
| Alte Leerstandslisten | `leerstandslisten/`: eine Liste mit Spalten Objekt und Stichtag über drei Häuser und drei Stichtage (mit einem unbekannten Haus und einer unbekannten Einheit), eine Meldung mit Zwischenzeilen „Objekt: …“ und „Stand: …“; Import unter Import → Leerstandsliste |
| IBANs | gültige Prüfziffer, aber Bankleitzahl `9999…`, die es in Deutschland nicht gibt |

Die Kennzahlen je Haus (Miete, Faktor, Leerstand, Restschuld, LTV) stehen in [`uebersicht-haeuser.csv`](uebersicht-haeuser.csv), alle Kredite in [`uebersicht-kredite.csv`](uebersicht-kredite.csv). Damit lässt sich prüfen, ob die App später dieselben Werte anzeigt.

## Besondere Testfälle

| Fall | Wo |
|---|---|
| Gemeinsamer Kredit für zwei Häuser, Aufteilung nach Kaufpreis | K04 (`TN-2019-00434`): Spreeuferpromenade 41 und Am Kastanienhof 3 |
| Tilgungsplan nach Nachverhandlung geändert | K05 (`LB-2015-00417`): Zinsbindung 1,95 % endete 30.06.2025, ab 01.07.2025 3,45 % mit neuer Rate (Tilgungsplan Version 2) |
| Sondertilgung mit neuem Tilgungsplan | K14 (`LB-2015-00451`): Sondertilgung am 31.12.2025, Version 2 ab 01.01.2026 |
| Zinsbindung endet bald | K09 am 30.11.2026, dazu K01, K14, K18, K19, K08, K22 bis Ende 2028 |
| Covenant verletzt | K12: LTV höchstens 65 %, Hafenkante 9 liegt bei 66 % |
| Drei Kredite an einem Haus | Schadowhof 22 und Isarauen 14 |

## Bankformate der Kreditbuchungen

Absichtlich verschieden, um den KI-Import zu testen. Eine Datei je Kredit unter `kreditbuchungen/`, benannt nach der Kreditnummer.

| Format | Banken | Merkmale |
|---|---|---|
| A | Testbank Nord AG (`TN-…`), Demo Landesbank (`LB-…`) | UTF-8 mit BOM, Windows-Zeilenenden, Semikolon, alles in Anführungszeichen; Kopfblock (Inhaber, IBAN, Zeitraum, Anfangssaldo) vor der Tabelle; Datum `30.11.2024`; Beträge `-16.750,15` und Saldo negativ |
| B | Beispiel Hypothekenbank AG (`BH-…`) | UTF-8, Komma, englische Spaltennamen; Datum `2024-11-30`; Beträge `16750.15`, alles positiv; neueste Buchung zuerst |
| C | Musterland Volksbank eG (`VB-…`) | ISO-8859-1 (Latin-1), Semikolon; Datum `30.11.24`; Beträge `16750,15` ohne Tausenderpunkt; getrennte Spalten Soll und Haben aus Sicht des Darlehenskontos (Zinsen im Soll, Tilgung im Haben); zusätzlich Zinssatz |

**Hinweis zum Import:** Dieselben Buchungen stehen nach `npm run db:seed` schon in der Datenbank, damit die Grafiken Daten haben. Ein Import der CSVs muss deshalb doppelte Buchungen erkennen; für einen Import in eine leere Datenbank die Kreditbuchungen vorher löschen.

## Quellen für Faktoren und Renditen

- [Canova Immobilien: Rendite vermieteter Immobilien 2026, Mehrfamilienhaus Deutschland](https://canova-immobilien.de/posts/rendite-vermieteter-immobilien-2026-mehrfamilienhaus-deutschland)
- [immo-rechner.net: Mehrfamilienhaus als Kapitalanlage](https://immo-rechner.net/ratgeber/mehrfamilienhaus-kapitalanlage)

Die Euribor-Werte im Generator sind Näherungswerte (ab 2026 angenommen), keine amtlichen Zahlen.
