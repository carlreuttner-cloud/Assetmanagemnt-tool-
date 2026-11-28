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
- [x] **Phase 17: Export.** Excel und PDF aus jeder Ansicht (ersetzt „Berichte“), mit Stichtag und Quellen.
- [x] **Phase 18: Dateien und Importe.** Reiter „Dateien und Importe“: einheitliche Benennung beim Import (z. B. „Jahresabschluss 2025 – Gesellschaft XY“, Originalname bleibt), Name und Zuordnung vor dem Speichern bestätigen; OCR für eingescannte PDFs; Volltextsuche nur hier, öffnet das Dokument an der Fundstelle und hebt sie hervor.
- [x] **Phase 19: Bewertung.** Reiter „Bewertung“: Gutachten und Marktwerte je Haus und Portfolio im Zeitverlauf, Bodenwert und Gebäudewert getrennt, Veränderung zum Vorgutachten.
- [x] **Phase 20: Kapitalkonten der Gesellschafter.** Einzahlungen, Anteile, Ausschüttungen und Saldo je Gesellschafter.
- [x] **Phase 21: Investitionen mit Budget und Rendite.** Budget, Ist-Kosten, Abweichung und Rendite aus Mehrmiete je Maßnahme.
- [x] **Phase 22: Liquiditätsplanung.** 12 Monate je Gesellschaft aus Mieten, Kapitaldienst, Investitionen und Ausschüttungen, mit Warnung bei Engpass.
- [x] **Phase 23: Zinssicherungen.** Caps und Swaps zu variablen Krediten, im Zinssatz, Kapitaldienst und in den Szenarien berücksichtigt.
- [x] **Phase 24: Exit-Kalkulation je Haus.** Verkaufszeitpunkt wählbar, Preisvorschläge aus Miete, Marktwert und Gutachten (frei änderbar), Ergebnis nach Kreditablöse und Kosten.
- [x] **Phase 25: KI-Vorschläge für Szenarien und Exit.** Knopf „Vorschlag generieren“: Haus wählen, die KI leitet Annahmen aus der Historie ab und begründet sie mit Quellen; gerechnet wird immer im Code, nie durch die KI.

## Erweiterungen (ab 27.11. abends, nach Carls Test)

- [x] **Phase 26: Nutzungsarten.** Wohnen, Gewerbe und Stellplätze überall getrennt erfassen, anzeigen und filtern; eigene Reiter „Gewerbe“ und „Stellplätze“; Flächen je Nutzungsart in den Tabellen der Hausverwaltung; Leerstand zusätzlich als kleines Kreisdiagramm nach Nutzungsart; jede Nutzungsart mit fester, gedeckter Farbe (zentral in `src/lib/farben.ts`). Testdaten: ein Drittel der Häuser mit Gewerbe, die meisten mit Stellplätzen.
- [x] **Phase 27: Auswahl per Dropdown, Liquidität je Gesellschaft.** In der Finanzierung Gesellschaften und Tilgungspläne per Auswahlliste statt Klickleiste (40+ Gesellschaften); Liquiditätsplanung je Gesellschaft wählbar, nicht nur gesamt.
- [x] **Phase 28: Excel-Export mit Auswahl.** Vor dem Export Tabellen und Spalten auswählen; die KI kann die Auswahl prüfen und Hinweise geben. Layout der Excel-Vorlagen folgt später separat.

## Erweiterungen (ab 28.11.)

Das Produkt wird verkauft: Ideen aus fremden Projekten werden nur nachgebaut, kein fremder Quellcode übernommen. Regeln wie immer: jede Zahl mit Quelle und Stichtag, fehlende Werte bleiben unbekannt, die KI macht nur Vorschläge mit Bestätigung, gerechnet wird im Code.

Reihenfolge laut Carl: zuerst Teil A (Eingang und KI-Assistent), dann B2, B4, B5, B7, C2, C5, danach der Rest. Der Absender kommt direkt vor dem Posteingang, weil der Eingang ihn erkennt und setzt.

### Teil A: Import und KI-Assistent (höchste Priorität)

- [x] **Phase 29 (A2): Generative Antworten im KI-Assistenten.** Frage in eigenen Worten stellen; die KI antwortet mit Text und unseren eigenen Komponenten (Kennzahl-Kacheln, Linien- und Säulendiagramme, Tabellen, Leerstand-Kreis, kleine Was-wäre-wenn-Regler) in den zentralen Farben. Die KI wählt nur Komponenten und Datenabfragen aus einem festen Katalog; alle Zahlen kommen aus der Datenbank bzw. unseren Rechenfunktionen, mit Quelle und Stichtag, nie von der KI. Eigene, schlanke Lösung statt OpenUI (Begründung im PR).
- [x] **Phase 30 (A1): Absender bei Dokumenten.** Feld „Absender“ (Bank, Hausverwaltung, Gutachter, Steuerberater, Notar, Behörde, Versicherung, Mieter, Gesellschafter, Sonstige) mit Name, Vorschlag beim Hochladen, Filter und Anzeige unter „Dateien und Importe“.
- [x] **Phase 31 (A1): Zentraler Posteingang mit KI-Zuordnung.** Ein Eingang je Mandant statt Import je Gesellschaft. Jedes Dokument wird gelesen (inkl. Texterkennung); erkannt werden Dokumenttyp, Absender und Stichtag, zugeordnet wird zu Gesellschaft, Haus oder Kredit über IBAN, Darlehensnummer, Adresse oder Gesellschaftsname, mit Begründung („zugeordnet zu Haus X, weil IBAN …“). Einheitlicher Name, Originalname bleibt. Nichts wird ohne Bestätigung übernommen; bei unsicherer Zuordnung kein Vorschlag zur Schnellübernahme. Korrekturen werden als Zuordnungsregeln gelernt. Prüfung von Dateityp und Größe, alles im Änderungsprotokoll.
- [x] **Phase 32 (A1): Upload-Seite je Mandant.** Eigene Seite zum Hochladen per Drag & Drop für Hausverwaltung, Bank oder Gutachter, ohne Zugriff auf den Rest der App: persönlicher, widerrufbarer Upload-Link mit Ablaufdatum oder Login mit Rolle „nur hochladen“. Alles landet im Posteingang.
- [x] **Phase 33 (A1): E-Mail-Eingang.** Eine Import-Adresse je Mandant; Anhänge und Mailtext landen im Posteingang. Mails unbekannter Absender kommen in Quarantäne. Lokal mit einem Test-Mailserver in Docker und Testmails; der echte Empfang wird in der Produktionsreife eingerichtet.

### Vorgezogen aus Teil B und C

- [ ] **Phase 34 (B2): Bankangebote vergleichen.** Term Sheets hochladen; die KI liest Zins, Marge, Laufzeit, Gebühren, Covenants und Sondertilgung aus (Vorschlag mit Bestätigung); Vergleich nebeneinander inkl. Gesamtkosten über die Laufzeit (im Code gerechnet).
- [ ] **Phase 35 (B4): Sicherheiten-Register.** Grundschulden je Haus (Rang, Betrag, Gläubiger), Bürgschaften, Abtretungen, mit Quelle und Bezug zum Kredit.
- [ ] **Phase 36 (B5): Beleihungsreserve.** Mögliche Nachfinanzierung bei frei wählbarem Ziel-LTV je Haus, Gesellschaft und Portfolio, nur aus belegter Restschuld und Verkehrswert mit Stichtag.
- [ ] **Phase 37 (B7): Covenant-Nachweis.** Testtermine je Covenant im Fristenkalender, PDF für die Bank auf Knopfdruck mit Herleitung und Quellen.
- [ ] **Phase 38 (C2): Ausschüttungsplanung.** Geplante Ausschüttungen mit automatischer Prüfung von Liquidität, Ausschüttungssperren und Covenants.
- [ ] **Phase 39 (C5): Quartalsbericht.** Automatisch erzeugt, mit 4-Augen-Freigabe und eingefrorenem Stand zum Stichtag.

### Danach

- [ ] **Phase 40 (B1): Refinanzierungs-Cockpit.** Fälligkeiten und Zinsbindungsenden je Jahr als Diagramm (Maturity Wall), Erinnerung 18–24 Monate vorher mit Unterlagen-Checkliste (baut auf Fristenkalender und Zinsbindungsprofil auf).
- [ ] **Phase 41 (B3): Zinsrisiko.** Gewichteter Durchschnittszins, durchschnittliche Restlaufzeit der Zinsbindung, Anteil fest/variabel/abgesichert, Mehrkosten pro Jahr bei +100 Basispunkten.
- [ ] **Phase 42 (B6): Sondertilgungsrechte.** Erlaubt, genutzt und noch offen je Jahr, mit Frist im Kalender.
- [ ] **Phase 43 (B8): Ankaufsprüfung.** Neues Objekt mit Kaufpreis und Finanzierung durchrechnen, mit Auswirkung auf die Kennzahlen von Gesellschaft und Portfolio.
- [ ] **Phase 44 (C4): Gesellschafter- und Nachrangdarlehen.** Eigene Kreditart mit Rang, fließt in den Waterfall ein.
- [ ] **Phase 45 (C1): Investorenrenditen.** IRR, Eigenkapital-Multiple und Cash-on-Cash je Investor und Gesellschaft, nur aus datierten Zahlungen.
- [ ] **Phase 46 (C3): Kapitalabrufe.** Betrag je Gesellschafter anteilig, Eingang verfolgen.
- [ ] **Phase 47 (C6): Plan/Ist-Vergleich.** Je Gesellschaft, mit Erklärung der Abweichungen.
- [ ] **Phase 48 (C7): Datenraum-Export.** Alle Unterlagen eines Hauses oder einer Gesellschaft geordnet als Paket.
- [ ] **Phase 49 (C8): Investorenportal.** Investoren sehen nur ihre Berichte, ihr Kapitalkonto und ausdrücklich freigegebene Dokumente.
- [ ] **Phase 50 (D3): Energie und ESG je Haus.** Energieausweis (Art, Energieklasse, Kennwert, Ablaufdatum) mit Frist im Fristenkalender, Verbräuche je Jahr mit Quelle.
- [ ] **Phase 51 (D2): Instandhaltungsplan.** Bauteile je Haus (Dach, Heizung, Aufzug, Fassade …) mit Zyklus, letzter Erneuerung und geplanten Kosten; fällige Maßnahmen fließen als Planposition in die Liquiditätsplanung.
- [ ] **Phase 52 (D1): Serienbriefe.** Vorlagen mit Platzhaltern, z. B. Mieterhöhungsschreiben für alle Mieter, bei denen eine Erhöhung möglich ist; Vorschau je Empfänger, Ausgabe als PDF, Ablage beim Mietverhältnis.

## Phase „Produktionsreife“: Pflicht, bevor echte Daten verwendet werden

Kommt nach Phase 25, oder früher, sobald echte Daten eingegeben werden sollen.

Bis diese Phase abgeschlossen ist, werden **keine echten Mieter-, Kredit- oder Gesellschaftsdaten** in die App eingegeben oder importiert.

- [ ] **HTTPS:** Reverse Proxy (z. B. Caddy) mit automatischem Zertifikat vor der App; nur HTTPS erreichbar, sichere Cookies.
- [ ] **Backups:** automatische tägliche Datenbank-Backups an einen zweiten Ort in Deutschland, verschlüsselt, mit Aufbewahrungsfristen und einem getesteten Wiederherstellungsablauf. Hochgeladene Dateien mitsichern.
- [ ] **Login-Sperre:** Begrenzung fehlgeschlagener Anmeldeversuche je Konto und je IP-Adresse, mit Protokollierung.
- [ ] **Dateispeicher:** Ablage für Fotos und Dokumente (S3-kompatibel in Deutschland oder gesichertes Volume), Zugriff nur über die App mit Mandanten- und Rechteprüfung, Größen- und Typprüfung beim Hochladen.
- [ ] **Geheimnisse:** eigenes `AUTH_SECRET` und Datenbank-Passwort auf dem Server, nicht im Repository; Demo-Zugänge entfernt.
- [ ] **KI-Analyse:** Auftragsverarbeitungsvertrag mit Anthropic prüfen und abschließen, erst danach `ANTHROPIC_API_KEY` auf dem Server setzen.
- [ ] **E-Mail-Empfang:** echtes Postfach bzw. Mail-Dienst in der EU für die Import-Adressen (eigene Subdomain mit MX-Eintrag), SPF/DKIM/DMARC-Prüfung eingehender Mails, Virenprüfung der Anhänge. Der Dienst leitet jede Mail im Rohformat an den Webhook `/api/eingang/mail` weiter (`EINGANG_MAIL_SCHLUESSEL`, `EINGANG_MAIL_DOMAIN` setzen); der lokale Test-Mailserver bleibt nur für Tests.
- [ ] **Server:** Hetzner (Standort Deutschland), Firewall, automatische Sicherheitsupdates, Datenbank nicht öffentlich erreichbar.
