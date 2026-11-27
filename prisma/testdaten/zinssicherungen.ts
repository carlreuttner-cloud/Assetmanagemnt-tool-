/**
 * Frei erfundene Zinssicherungen zu variablen Test-Krediten (6M-EURIBOR liegt 2026 bei rund 2,2 %).
 * - K06: Cap 3,00 % auf die gesamte Restschuld bis 04/2028 (heute nicht bindend, im Szenario mit Zinsanstieg schon)
 * - K13: Swap 2,45 % auf 60 % des Ursprungsbetrags bis 02/2030 (Teilsicherung)
 * - K21: Cap 2,00 % bis 31.03.2027 (heute bindend, endet im Planzeitraum der Liquidität)
 * - K23: Swap 0,80 %, abgelaufen Ende 2025 (nur Historie)
 */
import { aufCent, dezimal, type Decimal } from "../../src/lib/geld";

export interface TestZinssicherung {
  kredit: string;
  art: "CAP" | "SWAP";
  satz: Decimal;
  nominal: Decimal | null;
  beginn: string;
  ende: string;
  praemie: Decimal | null;
  quelle: string;
  notiz: string | null;
}

export function baueZinssicherungen(kredite: Array<{ schluessel: string; ursprungsbetrag: Decimal }>): TestZinssicherung[] {
  const ursprung = (s: string) => kredite.find((k) => k.schluessel === s)?.ursprungsbetrag ?? null;
  const liste: TestZinssicherung[] = [];
  if (ursprung("K06"))
    liste.push({ kredit: "K06", art: "CAP", satz: dezimal("3.00"), nominal: null, beginn: "2023-05-01", ende: "2028-04-30", praemie: aufCent(ursprung("K06")!.times("0.012")), quelle: "Cap-Bestätigung der Bank (Test)", notiz: null });
  if (ursprung("K13"))
    liste.push({ kredit: "K13", art: "SWAP", satz: dezimal("2.45"), nominal: ursprung("K13")!.times("0.6").dividedBy(1000).toDecimalPlaces(0).times(1000), beginn: "2023-03-01", ende: "2030-02-28", praemie: null, quelle: "Swap-Bestätigung (Test)", notiz: "Teilsicherung 60 % des Ursprungsbetrags" });
  if (ursprung("K21"))
    liste.push({ kredit: "K21", art: "CAP", satz: dezimal("2.00"), nominal: null, beginn: "2024-04-01", ende: "2027-03-31", praemie: aufCent(ursprung("K21")!.times("0.008")), quelle: "Cap-Bestätigung der Bank (Test)", notiz: "Anschlusssicherung offen" });
  if (ursprung("K23"))
    liste.push({ kredit: "K23", art: "SWAP", satz: dezimal("0.80"), nominal: null, beginn: "2019-01-01", ende: "2025-12-31", praemie: null, quelle: "Swap-Bestätigung (Test)", notiz: "ausgelaufen" });
  return liste;
}
