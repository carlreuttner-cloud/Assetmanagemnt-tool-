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
- [ ] **Phase 5: Übersicht.** Portfolio-Kennzahlen, Grafiken, Warnungen (Zinsbindung, Covenants, Rückstände, Leerstand).
- [ ] **Phase 6: Szenarien.** Was-wäre-wenn-Rechnungen (Zinsen, Mieten, Leerstand, Verkauf) mit Vorschau über mehrere Jahre.
- [ ] Berichte, KI-Assistent (danach)

## Phase „Produktionsreife“: Pflicht, bevor echte Daten verwendet werden

Bis diese Phase abgeschlossen ist, werden **keine echten Mieter-, Kredit- oder Gesellschaftsdaten** in die App eingegeben oder importiert.

- [ ] **HTTPS:** Reverse Proxy (z. B. Caddy) mit automatischem Zertifikat vor der App; nur HTTPS erreichbar, sichere Cookies.
- [ ] **Backups:** automatische tägliche Datenbank-Backups an einen zweiten Ort in Deutschland, verschlüsselt, mit Aufbewahrungsfristen und einem getesteten Wiederherstellungsablauf. Hochgeladene Dateien mitsichern.
- [ ] **Login-Sperre:** Begrenzung fehlgeschlagener Anmeldeversuche je Konto und je IP-Adresse, mit Protokollierung.
- [ ] **Dateispeicher:** Ablage für Fotos und Dokumente (S3-kompatibel in Deutschland oder gesichertes Volume), Zugriff nur über die App mit Mandanten- und Rechteprüfung, Größen- und Typprüfung beim Hochladen.
- [ ] **Geheimnisse:** eigenes `AUTH_SECRET` und Datenbank-Passwort auf dem Server, nicht im Repository; Demo-Zugänge entfernt.
- [ ] **Server:** Hetzner (Standort Deutschland), Firewall, automatische Sicherheitsupdates, Datenbank nicht öffentlich erreichbar.
