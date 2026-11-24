# Roadmap

Reihenfolge und Umfang werden mit jeder Phase neu abgestimmt.

## Phase 0: Projekt-Grundlage ✅

Next.js, Prisma, PostgreSQL, Tailwind, Docker. Login mit Rollen, Mandantentrennung, Änderungsprotokoll, vollständiges Datenmodell, Seitenleiste mit leeren Seiten, README.

## Fachliche Phasen

Werden mit Testdaten entwickelt, je Phase ein eigener Branch und Pull Request.

- [x] **Phase 1: Gesellschaften und Kredite.** Liste und Detailseite je Gesellschaft mit Kennzahlen, Kredite mit Restschuld, aktuellem Zinssatz, Kapitaldienst, Zinsbindung, Covenant-Prüfung, Buchungen und versionierten Tilgungsplänen; Referenzzinsen für variable Kredite.
- [x] **Phase 2: Häuser.** Häuser mit Einheiten, Verkehrswerten (Verlauf), Fotos, Investitionen und anteiligen Krediten.
- [x] **Phase 3: Mieter.** Mieter und Mietverhältnisse mit Ist- und Soll-Miete, Rückständen, Mieterhöhungen, Leerstand.
- [x] **Phase 4: Import.** Mieterlisten (auch für die Hausverwaltung) und Kreditbuchungen der Banken mit Vorschau und Dublettenprüfung.
- [x] **Phase 5: Übersicht.** Portfolio-Kennzahlen, Grafiken, Warnungen (Zinsbindung, Covenants, Rückstände, Leerstand).
- [x] **Phase 6: Szenarien.** Was-wäre-wenn-Rechnungen (Zinsen, Mieten, Leerstand, Verkauf) mit Vorschau über mehrere Jahre.

## Erweiterungen (ab 24.11.)

Fachliche Regeln für alle Phasen stehen in `CLAUDE.md` (Quelle, Stichtag und Berechnung je Zahl; unbekannt statt 0; Restschuld nur aus belegten Salden; Abkürzungen erklären).

- [x] **Phase 7: Nachvollziehbarkeit und belegte Salden.** Herleitung (Quelle, Stichtag, Berechnung) für die wesentlichen Kennzahlen in allen Ansichten nachrüsten; fehlende Werte als „unbekannt“ statt 0; Glossar für Abkürzungen. Belegte Kreditsalden je Kredit und Jahr (Quelle, Stichtag, Status Entwurf/belegt, unklare Stichtage getrennt), Jahrestabelle und Diagramm je Kredit; Guthaben getrennt von Darlehen.
- [x] **Phase 8: Covenant-Headroom und Ausschüttungssperren.** Puffer je Covenant bis zur Grenze (absolut und in %, z. B. wie viel Miete fehlen dürfte), Ausschüttungssperren mit Bedingungen und aktuellem Status.
- [x] **Phase 9: Gutachtenhistorie je Haus.** Gutachten mit Wert, Stichtag, Gutachter, Bewertungsfaktoren (Rohertrag, Vervielfältiger, Liegenschaftszins, Bewirtschaftungskosten …), Objektdetails und SWOT des Gutachters; Vergleich der Gutachten über die Zeit.
- [x] **Phase 10: Finanzen der Gesellschaften.** Bilanz, GuV, Cashflow und EBITDA je Geschäftsjahr mit Historie und Quelle (Jahresabschluss, BWA, Entwurf).
- [x] **Phase 11: Dokumenten-Checkliste.** Pflichtdokumente je Gesellschaft und Haus (z. B. Grundbuchauszug, Gutachten, Darlehensvertrag, Jahresabschluss) mit Status vorhanden/fehlt/veraltet. Ablage der Dateien selbst erst mit dem Dateispeicher der Produktionsreife.
- [x] **Phase 12: Verkaufsszenarien mit Waterfall.** Verteilung eines Verkaufserlöses (Kosten, Kreditablösung, Vorfälligkeit, Rückzahlung Einlagen, Vorzugsrendite, Gewinnverteilung); unbekannte Einzahlungen und Vertragsregeln als Lücke statt Schätzung.
- [ ] **Phase 13: KI-Analyse.** Manuell gestartete Analyse nur aus gespeicherten Daten, mit Quellenbezug je Aussage und klarer Kennzeichnung von Annahmen und Datenlücken.
- [ ] Berichte (danach)

## Phase „Produktionsreife“: Pflicht, bevor echte Daten verwendet werden

Bis diese Phase abgeschlossen ist, werden **keine echten Mieter-, Kredit- oder Gesellschaftsdaten** in die App eingegeben oder importiert.

- [ ] **HTTPS:** Reverse Proxy (z. B. Caddy) mit automatischem Zertifikat vor der App; nur HTTPS erreichbar, sichere Cookies.
- [ ] **Backups:** automatische tägliche Datenbank-Backups an einen zweiten Ort in Deutschland, verschlüsselt, mit Aufbewahrungsfristen und einem getesteten Wiederherstellungsablauf. Hochgeladene Dateien mitsichern.
- [ ] **Login-Sperre:** Begrenzung fehlgeschlagener Anmeldeversuche je Konto und je IP-Adresse, mit Protokollierung.
- [ ] **Dateispeicher:** Ablage für Fotos und Dokumente (S3-kompatibel in Deutschland oder gesichertes Volume), Zugriff nur über die App mit Mandanten- und Rechteprüfung, Größen- und Typprüfung beim Hochladen.
- [ ] **Geheimnisse:** eigenes `AUTH_SECRET` und Datenbank-Passwort auf dem Server, nicht im Repository; Demo-Zugänge entfernt.
- [ ] **Server:** Hetzner (Standort Deutschland), Firewall, automatische Sicherheitsupdates, Datenbank nicht öffentlich erreichbar.
