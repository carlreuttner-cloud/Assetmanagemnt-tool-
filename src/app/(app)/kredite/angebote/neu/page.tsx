import { Formular } from "@/components/formular";
import { Auswahl, Feld, Karte, Leer, Seitenkopf } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { formatierer } from "@/lib/format";
import { angebotAnlegen, angebotAuslesen } from "../aktionen";

export default async function NeuesAngebotSeite() {
  const kontext = await pruefeZugriff("gesellschaften", "schreiben");
  await sichtbarkeit(kontext);
  const t = texte(kontext.mandant.sprache);
  const tb = t.bankangebote;
  const f = formatierer(kontext.mandant);
  // Dokumente mit erkanntem Text, neueste zuerst (Darlehens- und Bankdokumente vorn)
  const dokumente = await kontext.db.dokument.findMany({
    where: { seiten: { some: {} } },
    orderBy: [{ erstelltAm: "desc" }],
    take: 200,
    select: { id: true, titel: true, dateiname: true, kategorie: true, absenderArt: true, erstelltAm: true },
  });
  dokumente.sort((a, b) => Number(b.absenderArt === "BANK" || b.kategorie === "Darlehensvertrag") - Number(a.absenderArt === "BANK" || a.kategorie === "Darlehensvertrag"));

  return (
    <div className="max-w-3xl space-y-6">
      <Seitenkopf titel={tb.neu} zurueck={{ href: "/kredite/angebote", text: tb.zurueck }} />
      <Karte titel={tb.auslesenTitel}>
        <p className="mb-4 text-sm text-slate-600">{tb.auslesenHinweis}</p>
        {dokumente.length === 0 ? (
          <Leer>{tb.keineDokumente}</Leer>
        ) : (
          <Formular aktion={angebotAuslesen} absenden={tb.auslesen} laeuftText={tb.auslesenLaeuft}>
            <Auswahl name="dokumentId" label={tb.dokument} pflicht optionen={dokumente.map((d) => ({ wert: d.id, text: `${d.titel} (${d.dateiname}, ${f.datum(d.erstelltAm)})` }))} />
          </Formular>
        )}
      </Karte>
      <Karte titel={tb.vonHandTitel}>
        <Formular aktion={angebotAnlegen} absenden={tb.anlegen}>
          <Feld name="bank" label={tb.felder.bank} pflicht />
        </Formular>
      </Karte>
    </div>
  );
}
