# Roadmap

Reihenfolge und Umfang werden mit jeder Phase neu abgestimmt.

## Phase 0: Projekt-Grundlage ✅

Next.js, Prisma, PostgreSQL, Tailwind, Docker. Login mit Rollen, Mandantentrennung, Änderungsprotokoll, vollständiges Datenmodell, Seitenleiste mit leeren Seiten, README.

## Fachliche Phasen

Die Fachseiten (Gesellschaften und Kredite, Häuser, Mieter, Import, Übersicht, Szenarien, Berichte, KI-Assistent) werden in eigenen Phasen gebaut. Sie dürfen mit Testdaten entwickelt werden.

## Phase „Produktionsreife“: Pflicht, bevor echte Daten verwendet werden

Bis diese Phase abgeschlossen ist, werden **keine echten Mieter-, Kredit- oder Gesellschaftsdaten** in die App eingegeben oder importiert.

- [ ] **HTTPS:** Reverse Proxy (z. B. Caddy) mit automatischem Zertifikat vor der App; nur HTTPS erreichbar, sichere Cookies.
- [ ] **Backups:** automatische tägliche Datenbank-Backups an einen zweiten Ort in Deutschland, verschlüsselt, mit Aufbewahrungsfristen und einem getesteten Wiederherstellungsablauf. Hochgeladene Dateien mitsichern.
- [ ] **Login-Sperre:** Begrenzung fehlgeschlagener Anmeldeversuche je Konto und je IP-Adresse, mit Protokollierung.
- [ ] **Dateispeicher:** Ablage für Fotos und Dokumente (S3-kompatibel in Deutschland oder gesichertes Volume), Zugriff nur über die App mit Mandanten- und Rechteprüfung, Größen- und Typprüfung beim Hochladen.
- [ ] **Geheimnisse:** eigenes `AUTH_SECRET` und Datenbank-Passwort auf dem Server, nicht im Repository; Demo-Zugänge entfernt.
- [ ] **Server:** Hetzner (Standort Deutschland), Firewall, automatische Sicherheitsupdates, Datenbank nicht öffentlich erreichbar.
