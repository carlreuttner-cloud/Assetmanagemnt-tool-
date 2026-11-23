/**
 * Deutsche Oberflächentexte. Weitere Sprachen bekommen eine Datei mit derselben Struktur
 * (TypeScript erzwingt über den Typ `Texte`, dass keine Übersetzung fehlt).
 */
export const de = {
  app: {
    titel: "Immobilien-Portfolio",
  },
  navigation: {
    uebersicht: "Übersicht",
    gesellschaften: "Gesellschaften und Kredite",
    haeuser: "Häuser",
    mieter: "Mieter",
    szenarien: "Szenarien",
    berichte: "Berichte",
    import: "Import",
    kiAssistent: "KI-Assistent",
  },
  seiten: {
    uebersicht: "Kennzahlen und Entwicklung des gesamten Portfolios.",
    gesellschaften: "Gesellschaften, ihre Kredite, Covenants und Tilgungspläne.",
    haeuser: "Häuser mit Einheiten, Verkehrswerten, Fotos und Investitionen.",
    mieter: "Mieter und Mietverhältnisse mit Ist- und Soll-Miete und Rückständen.",
    szenarien: "Was-wäre-wenn-Rechnungen, z. B. Zinsänderungen oder Verkäufe.",
    berichte: "Auswertungen für Banken, Investoren und die Geschäftsführung.",
    import: "Mieterlisten und weitere Daten hochladen.",
    kiAssistent: "Fragen zum Portfolio in natürlicher Sprache stellen.",
    platzhalter: "Diese Seite wird in einer späteren Phase gebaut.",
  },
  rollen: {
    ADMIN: "Admin",
    MITARBEITER: "Mitarbeiter",
    HAUSVERWALTUNG: "Hausverwaltung",
    INVESTOR: "Investor",
  },
  login: {
    titel: "Anmelden",
    email: "E-Mail",
    passwort: "Passwort",
    absenden: "Anmelden",
    fehler: "E-Mail oder Passwort ist falsch.",
  },
  konto: {
    abmelden: "Abmelden",
    mandant: "Mandant",
    keinMandant: "Ihrem Konto ist noch kein Mandant zugeordnet. Bitte wenden Sie sich an Ihren Administrator.",
  },
} as const;

type Struktur<T> = { [K in keyof T]: T[K] extends string ? string : Struktur<T[K]> };
export type Texte = Struktur<typeof de>;
