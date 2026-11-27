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
- [x] **Phase 13: KI-Analyse.** Manuell gestartete Analyse nur aus gespeicherten Daten, mit Quellenbezug je Aussage und klarer Kennzeichnung von Annahmen und Datenlücken.

## Erweiterungen (ab 27.11.)

Reihenfolge: zuerst die neue Navigation mit Portfolios, weil alle weiteren Seiten darin landen; dann Werkzeuge für alle Ansichten; dann Dokumente; dann die Fachfunktionen, wobei Exit und KI-Vorschläge zuletzt kommen, weil sie auf Bewertung, Investitionen und Zinssicherungen aufbauen. Die bisherigen „Berichte“ gehen im Export (Phase 17) auf.

- [x] **Phase 14: Navigation und Portfolios.** Links oben Auswahl „Generalübersicht“ oder ein Portfolio; darunter Gruppen (z. B. Hausverwaltung: Mieter, Einheiten, Investitionen; Finanzierung: Kredite, Tilgungspläne, Szenarien), oben eine Reiterzeile innerhalb der Gruppe. Übersicht aller Gesellschaften mit ihren Häusern. Reiter „Portfolios“: anlegen, umbenennen, Gesellschaften zuordnen, Kennzahlen je Portfolio, Gruppe „Ohne Portfolio“. Filter wie bisher. Testdaten: zwei Portfolios mit je zwei Gesellschaften, eine ohne Portfolio.
- [x] **Phase 15: Globale Suche und Quellen-Schalter.** Suche links unten über Mieter, Kredite, IBANs, Gesellschaften und Häuser mit Sprung zum Treffer. Schalter ganz oben: Stichtage und Quellen aller Zahlen ein- oder ausblenden.
- [x] **Phase 16: Fristen-Kalender, Favoriten, zuletzt angesehen.** Kalender mit Zinsbindungsenden, möglichen Mieterhöhungen und Vertragsenden; Favoriten und zuletzt angesehene Objekte je Benutzer.
- [ ] **Phase 17: Export.** Excel und PDF aus jeder Ansicht (ersetzt „Berichte“), mit Stichtag und Quellen.
- [ ] **Phase 18: Dateien und Importe.** Reiter „Dateien und Importe“: einheitliche Benennung beim Import (z. B. „Jahresabschluss 2025 – Gesellschaft XY“, Originalname bleibt), Name und Zuordnung vor dem Speichern bestätigen; OCR für eingescannte PDFs; Volltextsuche nur hier, öffnet das Dokument an der Fundstelle und hebt sie hervor.
- [ ] **Phase 19: Bewertung.** Reiter „Bewertung“: Gutachten und Marktwerte je Haus und Portfolio im Zeitverlauf, Bodenwert und Gebäudewert getrennt, Veränderung zum Vorgutachten.
- [ ] **Phase 20: Kapitalkonten der Gesellschafter.** Einzahlungen, Anteile, Ausschüttungen und Saldo je Gesellschafter.
- [ ] **Phase 21: Investitionen mit Budget und Rendite.** Budget, Ist-Kosten, Abweichung und Rendite aus Mehrmiete je Maßnahme.
- [ ] **Phase 22: Liquiditätsplanung.** 12 Monate je Gesellschaft aus Mieten, Kapitaldienst, Investitionen und Ausschüttungen, mit Warnung bei Engpass.
- [ ] **Phase 23: Zinssicherungen.** Caps und Swaps zu variablen Krediten, im Zinssatz, Kapitaldienst und in den Szenarien berücksichtigt.
- [ ] **Phase 24: Exit-Kalkulation je Haus.** Verkaufszeitpunkt wählbar, Preisvorschläge aus Miete, Marktwert und Gutachten (frei änderbar), Ergebnis nach Kreditablöse und Kosten.
- [ ] **Phase 25: KI-Vorschläge für Szenarien und Exit.** Knopf „Vorschlag generieren“: Haus wählen, die KI leitet Annahmen aus der Historie ab und begründet sie mit Quellen; gerechnet wird immer im Code, nie durch die KI.

## Phase „Produktionsreife“: Pflicht, bevor echte Daten verwendet werden

Kommt nach Phase 25, oder früher, sobald echte Daten eingegeben werden sollen.

Bis diese Phase abgeschlossen ist, werden **keine echten Mieter-, Kredit- oder Gesellschaftsdaten** in die App eingegeben oder importiert.

- [ ] **HTTPS:** Reverse Proxy (z. B. Caddy) mit automatischem Zertifikat vor der App; nur HTTPS erreichbar, sichere Cookies.
- [ ] **Backups:** automatische tägliche Datenbank-Backups an einen zweiten Ort in Deutschland, verschlüsselt, mit Aufbewahrungsfristen und einem getesteten Wiederherstellungsablauf. Hochgeladene Dateien mitsichern.
- [ ] **Login-Sperre:** Begrenzung fehlgeschlagener Anmeldeversuche je Konto und je IP-Adresse, mit Protokollierung.
- [ ] **Dateispeicher:** Ablage für Fotos und Dokumente (S3-kompatibel in Deutschland oder gesichertes Volume), Zugriff nur über die App mit Mandanten- und Rechteprüfung, Größen- und Typprüfung beim Hochladen.
- [ ] **Geheimnisse:** eigenes `AUTH_SECRET` und Datenbank-Passwort auf dem Server, nicht im Repository; Demo-Zugänge entfernt.
- [ ] **KI-Analyse:** Auftragsverarbeitungsvertrag mit Anthropic prüfen und abschließen, erst danach `ANTHROPIC_API_KEY` auf dem Server setzen.
- [ ] **Server:** Hetzner (Standort Deutschland), Firewall, automatische Sicherheitsupdates, Datenbank nicht öffentlich erreichbar.
