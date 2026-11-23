-- CreateEnum
CREATE TYPE "Rolle" AS ENUM ('ADMIN', 'MITARBEITER', 'HAUSVERWALTUNG', 'INVESTOR');

-- CreateEnum
CREATE TYPE "EinheitArt" AS ENUM ('WOHNUNG', 'GEWERBE');

-- CreateEnum
CREATE TYPE "ZinsArt" AS ENUM ('FEST', 'VARIABEL');

-- CreateEnum
CREATE TYPE "CovenantVergleich" AS ENUM ('HOECHSTENS', 'MINDESTENS');

-- CreateEnum
CREATE TYPE "BuchungsArt" AS ENUM ('ZINS', 'TILGUNG', 'SONDERTILGUNG', 'GEBUEHR', 'AUSZAHLUNG', 'SONSTIGES');

-- CreateEnum
CREATE TYPE "AenderungsAktion" AS ENUM ('ERSTELLT', 'GEAENDERT', 'GELOESCHT');

-- CreateTable
CREATE TABLE "Mandant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "waehrung" TEXT NOT NULL DEFAULT 'EUR',
    "sprache" TEXT NOT NULL DEFAULT 'de-DE',
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mandant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Benutzer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwortHash" TEXT NOT NULL,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "sprache" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Benutzer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mitgliedschaft" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "benutzerId" TEXT NOT NULL,
    "rolle" "Rolle" NOT NULL,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mitgliedschaft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HausZuweisung" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "mitgliedschaftId" TEXT NOT NULL,
    "hausId" TEXT NOT NULL,

    CONSTRAINT "HausZuweisung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GesellschaftZuweisung" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "mitgliedschaftId" TEXT NOT NULL,
    "gesellschaftId" TEXT NOT NULL,

    CONSTRAINT "GesellschaftZuweisung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gesellschaft" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rechtsform" TEXT,
    "registernummer" TEXT,
    "steuernummer" TEXT,
    "notiz" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gesellschaft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Haus" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "gesellschaftId" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "strasse" TEXT,
    "plz" TEXT,
    "ort" TEXT,
    "land" TEXT NOT NULL DEFAULT 'DE',
    "kaufpreis" DECIMAL(14,2),
    "kaufdatum" DATE,
    "notiz" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Haus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verkehrswert" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "hausId" TEXT NOT NULL,
    "wert" DECIMAL(14,2) NOT NULL,
    "stichtag" DATE NOT NULL,
    "quelle" TEXT,
    "notiz" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verkehrswert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Foto" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "hausId" TEXT NOT NULL,
    "speicherPfad" TEXT NOT NULL,
    "dateiname" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "groesseBytes" INTEGER NOT NULL,
    "beschreibung" TEXT,
    "reihenfolge" INTEGER NOT NULL DEFAULT 0,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Foto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Einheit" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "hausId" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "art" "EinheitArt" NOT NULL,
    "flaeche" DECIMAL(10,2) NOT NULL,
    "lage" TEXT,
    "notiz" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Einheit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mieter" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "istFirma" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT,
    "telefon" TEXT,
    "notiz" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mieter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mietverhaeltnis" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "einheitId" TEXT NOT NULL,
    "mieterId" TEXT NOT NULL,
    "beginn" DATE NOT NULL,
    "ende" DATE,
    "istMiete" DECIMAL(14,2) NOT NULL,
    "sollMiete" DECIMAL(14,2) NOT NULL,
    "letzteMieterhoehung" DATE,
    "rueckstand" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "rueckstandStichtag" DATE,
    "notiz" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mietverhaeltnis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kredit" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "gesellschaftId" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "bank" TEXT,
    "kreditnummer" TEXT,
    "iban" TEXT,
    "ursprungsbetrag" DECIMAL(14,2) NOT NULL,
    "auszahlungsdatum" DATE,
    "zinsArt" "ZinsArt" NOT NULL,
    "sollzins" DECIMAL(9,6),
    "referenzzins" TEXT,
    "marge" DECIMAL(9,6),
    "zinsbindungBis" DATE,
    "laufzeitBis" DATE,
    "notiz" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Covenant" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "kreditId" TEXT NOT NULL,
    "kennzahl" TEXT NOT NULL,
    "vergleich" "CovenantVergleich",
    "schwellenwert" DECIMAL(14,6),
    "pruefrhythmus" TEXT,
    "beschreibung" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Covenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KreditHaus" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "kreditId" TEXT NOT NULL,
    "hausId" TEXT NOT NULL,
    "anteilProzent" DECIMAL(9,6) NOT NULL,

    CONSTRAINT "KreditHaus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kreditbuchung" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "kreditId" TEXT NOT NULL,
    "datum" DATE NOT NULL,
    "art" "BuchungsArt" NOT NULL,
    "betrag" DECIMAL(14,2) NOT NULL,
    "saldoNach" DECIMAL(14,2),
    "notiz" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kreditbuchung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tilgungsplan" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "kreditId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "gueltigAb" DATE NOT NULL,
    "bezeichnung" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tilgungsplan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TilgungsplanZeile" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "tilgungsplanId" TEXT NOT NULL,
    "faelligAm" DATE NOT NULL,
    "zins" DECIMAL(14,2) NOT NULL,
    "tilgung" DECIMAL(14,2) NOT NULL,
    "rate" DECIMAL(14,2) NOT NULL,
    "restschuld" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "TilgungsplanZeile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Investition" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "hausId" TEXT NOT NULL,
    "einheitId" TEXT,
    "datum" DATE NOT NULL,
    "betrag" DECIMAL(14,2) NOT NULL,
    "kategorie" TEXT,
    "beschreibung" TEXT NOT NULL,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Investition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dokument" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "titel" TEXT NOT NULL,
    "kategorie" TEXT,
    "speicherPfad" TEXT NOT NULL,
    "dateiname" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "groesseBytes" INTEGER NOT NULL,
    "gesellschaftId" TEXT,
    "hausId" TEXT,
    "einheitId" TEXT,
    "mietverhaeltnisId" TEXT,
    "kreditId" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dokument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aenderungsprotokoll" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "benutzerId" TEXT,
    "zeitpunkt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tabelle" TEXT NOT NULL,
    "datensatzId" TEXT NOT NULL,
    "aktion" "AenderungsAktion" NOT NULL,
    "alteWerte" JSONB,
    "neueWerte" JSONB,

    CONSTRAINT "Aenderungsprotokoll_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Mandant_slug_key" ON "Mandant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Benutzer_email_key" ON "Benutzer"("email");

-- CreateIndex
CREATE INDEX "Mitgliedschaft_benutzerId_idx" ON "Mitgliedschaft"("benutzerId");

-- CreateIndex
CREATE UNIQUE INDEX "Mitgliedschaft_mandantId_benutzerId_key" ON "Mitgliedschaft"("mandantId", "benutzerId");

-- CreateIndex
CREATE INDEX "HausZuweisung_mandantId_idx" ON "HausZuweisung"("mandantId");

-- CreateIndex
CREATE UNIQUE INDEX "HausZuweisung_mitgliedschaftId_hausId_key" ON "HausZuweisung"("mitgliedschaftId", "hausId");

-- CreateIndex
CREATE INDEX "GesellschaftZuweisung_mandantId_idx" ON "GesellschaftZuweisung"("mandantId");

-- CreateIndex
CREATE UNIQUE INDEX "GesellschaftZuweisung_mitgliedschaftId_gesellschaftId_key" ON "GesellschaftZuweisung"("mitgliedschaftId", "gesellschaftId");

-- CreateIndex
CREATE INDEX "Gesellschaft_mandantId_idx" ON "Gesellschaft"("mandantId");

-- CreateIndex
CREATE INDEX "Haus_mandantId_idx" ON "Haus"("mandantId");

-- CreateIndex
CREATE INDEX "Haus_gesellschaftId_idx" ON "Haus"("gesellschaftId");

-- CreateIndex
CREATE INDEX "Verkehrswert_mandantId_idx" ON "Verkehrswert"("mandantId");

-- CreateIndex
CREATE INDEX "Verkehrswert_hausId_stichtag_idx" ON "Verkehrswert"("hausId", "stichtag");

-- CreateIndex
CREATE INDEX "Foto_mandantId_idx" ON "Foto"("mandantId");

-- CreateIndex
CREATE INDEX "Foto_hausId_idx" ON "Foto"("hausId");

-- CreateIndex
CREATE INDEX "Einheit_mandantId_idx" ON "Einheit"("mandantId");

-- CreateIndex
CREATE INDEX "Einheit_hausId_idx" ON "Einheit"("hausId");

-- CreateIndex
CREATE INDEX "Mieter_mandantId_idx" ON "Mieter"("mandantId");

-- CreateIndex
CREATE INDEX "Mietverhaeltnis_mandantId_idx" ON "Mietverhaeltnis"("mandantId");

-- CreateIndex
CREATE INDEX "Mietverhaeltnis_einheitId_idx" ON "Mietverhaeltnis"("einheitId");

-- CreateIndex
CREATE INDEX "Mietverhaeltnis_mieterId_idx" ON "Mietverhaeltnis"("mieterId");

-- CreateIndex
CREATE INDEX "Kredit_mandantId_idx" ON "Kredit"("mandantId");

-- CreateIndex
CREATE INDEX "Kredit_gesellschaftId_idx" ON "Kredit"("gesellschaftId");

-- CreateIndex
CREATE INDEX "Covenant_mandantId_idx" ON "Covenant"("mandantId");

-- CreateIndex
CREATE INDEX "Covenant_kreditId_idx" ON "Covenant"("kreditId");

-- CreateIndex
CREATE INDEX "KreditHaus_mandantId_idx" ON "KreditHaus"("mandantId");

-- CreateIndex
CREATE INDEX "KreditHaus_hausId_idx" ON "KreditHaus"("hausId");

-- CreateIndex
CREATE UNIQUE INDEX "KreditHaus_kreditId_hausId_key" ON "KreditHaus"("kreditId", "hausId");

-- CreateIndex
CREATE INDEX "Kreditbuchung_mandantId_idx" ON "Kreditbuchung"("mandantId");

-- CreateIndex
CREATE INDEX "Kreditbuchung_kreditId_datum_idx" ON "Kreditbuchung"("kreditId", "datum");

-- CreateIndex
CREATE INDEX "Tilgungsplan_mandantId_idx" ON "Tilgungsplan"("mandantId");

-- CreateIndex
CREATE UNIQUE INDEX "Tilgungsplan_kreditId_version_key" ON "Tilgungsplan"("kreditId", "version");

-- CreateIndex
CREATE INDEX "TilgungsplanZeile_mandantId_idx" ON "TilgungsplanZeile"("mandantId");

-- CreateIndex
CREATE INDEX "TilgungsplanZeile_tilgungsplanId_faelligAm_idx" ON "TilgungsplanZeile"("tilgungsplanId", "faelligAm");

-- CreateIndex
CREATE INDEX "Investition_mandantId_idx" ON "Investition"("mandantId");

-- CreateIndex
CREATE INDEX "Investition_hausId_idx" ON "Investition"("hausId");

-- CreateIndex
CREATE INDEX "Dokument_mandantId_idx" ON "Dokument"("mandantId");

-- CreateIndex
CREATE INDEX "Aenderungsprotokoll_mandantId_zeitpunkt_idx" ON "Aenderungsprotokoll"("mandantId", "zeitpunkt");

-- CreateIndex
CREATE INDEX "Aenderungsprotokoll_tabelle_datensatzId_idx" ON "Aenderungsprotokoll"("tabelle", "datensatzId");

-- AddForeignKey
ALTER TABLE "Mitgliedschaft" ADD CONSTRAINT "Mitgliedschaft_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mitgliedschaft" ADD CONSTRAINT "Mitgliedschaft_benutzerId_fkey" FOREIGN KEY ("benutzerId") REFERENCES "Benutzer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HausZuweisung" ADD CONSTRAINT "HausZuweisung_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HausZuweisung" ADD CONSTRAINT "HausZuweisung_mitgliedschaftId_fkey" FOREIGN KEY ("mitgliedschaftId") REFERENCES "Mitgliedschaft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HausZuweisung" ADD CONSTRAINT "HausZuweisung_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GesellschaftZuweisung" ADD CONSTRAINT "GesellschaftZuweisung_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GesellschaftZuweisung" ADD CONSTRAINT "GesellschaftZuweisung_mitgliedschaftId_fkey" FOREIGN KEY ("mitgliedschaftId") REFERENCES "Mitgliedschaft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GesellschaftZuweisung" ADD CONSTRAINT "GesellschaftZuweisung_gesellschaftId_fkey" FOREIGN KEY ("gesellschaftId") REFERENCES "Gesellschaft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gesellschaft" ADD CONSTRAINT "Gesellschaft_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Haus" ADD CONSTRAINT "Haus_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Haus" ADD CONSTRAINT "Haus_gesellschaftId_fkey" FOREIGN KEY ("gesellschaftId") REFERENCES "Gesellschaft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verkehrswert" ADD CONSTRAINT "Verkehrswert_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verkehrswert" ADD CONSTRAINT "Verkehrswert_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Foto" ADD CONSTRAINT "Foto_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Einheit" ADD CONSTRAINT "Einheit_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Einheit" ADD CONSTRAINT "Einheit_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mieter" ADD CONSTRAINT "Mieter_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mietverhaeltnis" ADD CONSTRAINT "Mietverhaeltnis_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mietverhaeltnis" ADD CONSTRAINT "Mietverhaeltnis_einheitId_fkey" FOREIGN KEY ("einheitId") REFERENCES "Einheit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mietverhaeltnis" ADD CONSTRAINT "Mietverhaeltnis_mieterId_fkey" FOREIGN KEY ("mieterId") REFERENCES "Mieter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kredit" ADD CONSTRAINT "Kredit_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kredit" ADD CONSTRAINT "Kredit_gesellschaftId_fkey" FOREIGN KEY ("gesellschaftId") REFERENCES "Gesellschaft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Covenant" ADD CONSTRAINT "Covenant_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Covenant" ADD CONSTRAINT "Covenant_kreditId_fkey" FOREIGN KEY ("kreditId") REFERENCES "Kredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KreditHaus" ADD CONSTRAINT "KreditHaus_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KreditHaus" ADD CONSTRAINT "KreditHaus_kreditId_fkey" FOREIGN KEY ("kreditId") REFERENCES "Kredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KreditHaus" ADD CONSTRAINT "KreditHaus_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kreditbuchung" ADD CONSTRAINT "Kreditbuchung_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kreditbuchung" ADD CONSTRAINT "Kreditbuchung_kreditId_fkey" FOREIGN KEY ("kreditId") REFERENCES "Kredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tilgungsplan" ADD CONSTRAINT "Tilgungsplan_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tilgungsplan" ADD CONSTRAINT "Tilgungsplan_kreditId_fkey" FOREIGN KEY ("kreditId") REFERENCES "Kredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TilgungsplanZeile" ADD CONSTRAINT "TilgungsplanZeile_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TilgungsplanZeile" ADD CONSTRAINT "TilgungsplanZeile_tilgungsplanId_fkey" FOREIGN KEY ("tilgungsplanId") REFERENCES "Tilgungsplan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investition" ADD CONSTRAINT "Investition_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investition" ADD CONSTRAINT "Investition_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investition" ADD CONSTRAINT "Investition_einheitId_fkey" FOREIGN KEY ("einheitId") REFERENCES "Einheit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dokument" ADD CONSTRAINT "Dokument_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dokument" ADD CONSTRAINT "Dokument_gesellschaftId_fkey" FOREIGN KEY ("gesellschaftId") REFERENCES "Gesellschaft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dokument" ADD CONSTRAINT "Dokument_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dokument" ADD CONSTRAINT "Dokument_einheitId_fkey" FOREIGN KEY ("einheitId") REFERENCES "Einheit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dokument" ADD CONSTRAINT "Dokument_mietverhaeltnisId_fkey" FOREIGN KEY ("mietverhaeltnisId") REFERENCES "Mietverhaeltnis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dokument" ADD CONSTRAINT "Dokument_kreditId_fkey" FOREIGN KEY ("kreditId") REFERENCES "Kredit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aenderungsprotokoll" ADD CONSTRAINT "Aenderungsprotokoll_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aenderungsprotokoll" ADD CONSTRAINT "Aenderungsprotokoll_benutzerId_fkey" FOREIGN KEY ("benutzerId") REFERENCES "Benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
