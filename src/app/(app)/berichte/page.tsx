import { redirect } from "next/navigation";
import { pruefeZugriff } from "@/lib/auth/kontext";

/** „Berichte“ ist im Export aufgegangen (Excel/PDF oben rechts in jeder Ansicht); alte Links führen zur Übersicht. */
export default async function BerichteSeite() {
  await pruefeZugriff("berichte");
  redirect("/");
}
