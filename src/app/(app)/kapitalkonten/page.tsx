import Link from "next/link";
import { Glossar, MitHerleitung } from "@/components/herleitung";
import { KapitalkontoTabelle } from "@/components/kapitalkonto-tabelle";
import { Kachel, Kacheln, Karte, Leer, Seitenkopf } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { bereichsSicht } from "@/lib/auth/auswahl";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { idFilter } from "@/lib/auth/sichtbarkeit";
import { heute, isoDatum } from "@/lib/datum";
import { formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";
import { kontosummen } from "@/lib/kapitalkonto";

export default async function KapitalkontenSeite() {
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const tk = t.kapitalkonten;
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const sicht = await bereichsSicht(kontext);
  const gesellschaften = await kontext.db.gesellschaft.findMany({
    where: { id: idFilter(sicht.gesellschaftIds) },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      gesellschafter: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, beteiligungProzent: true, bewegungen: { select: { art: true, datum: true, betrag: true } } },
      },
    },
  });
  const mitKonten = gesellschaften
    .filter((g) => g.gesellschafter.length > 0)
    .map((g) => ({
      ...g,
      gesellschafter: g.gesellschafter.map((gs) => ({
        id: gs.id,
        name: gs.name,
        beteiligungProzent: gs.beteiligungProzent === null ? null : dezimal(gs.beteiligungProzent),
        bewegungen: gs.bewegungen.map((b) => ({ art: b.art, datum: isoDatum(b.datum), betrag: dezimal(b.betrag) })),
      })),
    }));
  const alle = kontosummen(mitKonten.flatMap((g) => g.gesellschafter.flatMap((gs) => gs.bewegungen)));
  const anzahl = mitKonten.reduce((n, g) => n + g.gesellschafter.length, 0);
  const unter = fuelle(tk.kachelUnter, { anzahl, gesellschaften: mitKonten.length });
  const stand = fuelle(tk.stichtagHeute, { datum: f.datum(stichtag) });
  const kachel = (w: typeof alle.einlagen, formel?: string) => (
    <MitHerleitung
      wert={f.betragGanz(w)}
      herleitung={{
        berechnung: formel,
        quelle: tk.quelleText,
        stichtag: stand,
        hinweis: alle.ohneDatum > 0 ? `${fuelle(tk.ohneDatum, { anzahl: alle.ohneDatum })}. ${tk.ohneDatumHinweis}` : undefined,
      }}
      t={t}
    />
  );

  return (
    <div className="space-y-6">
      <Seitenkopf titel={tk.titel} beschreibung={tk.beschreibung} />
      {mitKonten.length === 0 ? (
        <Karte>
          <Leer>{tk.keine}</Leer>
        </Karte>
      ) : (
        <>
          <Kacheln>
            <Kachel titel={tk.kachelEinlagen} wert={kachel(alle.einlagen)} unter={unter} />
            <Kachel titel={tk.kachelRueckzahlungen} wert={kachel(alle.rueckzahlungen)} />
            <Kachel titel={tk.kachelAusschuettungen} wert={kachel(alle.ausschuettungen)} />
            <Kachel titel={tk.kachelSaldo} wert={kachel(alle.saldo, tk.saldoFormel)} />
          </Kacheln>
          {mitKonten.map((g) => (
            <Karte
              key={g.id}
              titel={
                <Link href={`/gesellschaften/${g.id}/gesellschafter`} className="hover:underline">
                  {g.name}
                </Link>
              }
            >
              <KapitalkontoTabelle gesellschafter={g.gesellschafter} stichtag={stichtag} link={(id) => `/gesellschaften/${g.id}/gesellschafter#gs-${id}`} t={t} f={f} />
            </Karte>
          ))}
        </>
      )}
      <Glossar begriffe={["NettoEinlagen", "Kapitalsaldo"]} t={t} />
    </div>
  );
}
