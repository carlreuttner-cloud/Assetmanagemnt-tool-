import type { Ton } from "@/components/ui";
import type { BauteilStatus } from "@/lib/instandhaltung";

export const STATUS_TON: Record<BauteilStatus, Ton> = { unbekannt: "neutral", ueberfaellig: "schlecht", faellig: "warnung", bald: "warnung", spaeter: "gut" };
