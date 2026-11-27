import { notFound } from "next/navigation";
import { Karte, Seitenkopf } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { ladeDatenpaket } from "@/lib/daten/ki";
import { formatierer } from "@/lib/format";
import { DatenpaketAnsicht } from "../ki-bausteine";

/** Vorschau: genau das Datenpaket, das die KI für eine Gesellschaft erhalten würde. */
export default async function DatenpaketSeite({ searchParams }: PageProps<"/ki-assistent/datenpaket">) {
  const kontext = await pruefeZugriff("kiAssistent");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const g = (await searchParams).g;
  if (typeof g !== "string") notFound();
  const paket = await ladeDatenpaket(kontext, g);
  if (!paket) notFound();

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf
        titel={`${t.ki.datenpaket}: ${paket.gesellschaft.name}`}
        beschreibung={fuelle(t.ki.datenpaketBeschreibung, { stichtag: f.datum(paket.stichtag) })}
        zurueck={{ href: "/ki-assistent", text: t.ki.titel }}
      />
      <Karte titel={fuelle(t.ki.datenpaketZaehlung, { fakten: paket.fakten.length, luecken: paket.luecken.length })}>
        <DatenpaketAnsicht paket={paket} t={t} />
      </Karte>
    </div>
  );
}
