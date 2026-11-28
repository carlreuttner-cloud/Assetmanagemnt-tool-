import type { Ton } from "@/components/ui";
import type { AusweisStatus } from "@/lib/energie";

export const STATUS_TON: Record<AusweisStatus, Ton> = { fehlt: "schlecht", gueltigUnbekannt: "warnung", abgelaufen: "schlecht", laeuftAb: "warnung", gueltig: "gut" };
