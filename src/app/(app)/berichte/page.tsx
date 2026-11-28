import Link from "next/link";
import { Formular } from "@/components/formular";
import { Begriff, Glossar } from "@/components/herleitung";
import { Auswahl, Felder, Karte, Leer, Marke, Seitenkopf, Tabelle, type Ton } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { heute } from "@/lib/datum";
import { berichtFilter } from "@/lib/daten/quartalsbericht";
import { erlaubt } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import { letztesQuartal, vorquartal } from "@/lib/quartalsbericht";
import { berichtErstellen } from "./aktionen";

const STATUS_TON: Record<"ENTWURF" | "FREIGEGEBEN" | "VERWORFEN", Ton> = { ENTWURF: "warnung", FREIGEGEBEN: "gut", VERWORFEN: "neutral" };

export default async function BerichteSeite() {
  const kontext = await pruefeZugriff("berichte");
  const sicht = await sichtbarkeit(kontext);
  const t = texte(kontext.mandant.sprache);
  const tq = t.quartalsbericht;
  const f = formatierer(kontext.mandant);
  const schreiben = darf(kontext.rolle, "berichte", "schreiben");
  const [berichte, gesellschaften] = await Promise.all([
    kontext.db.quartalsbericht.findMany({
      where: berichtFilter(kontext.rolle, sicht.gesellschaftIds),
      orderBy: [{ jahr: "desc" }, { quartal: "desc" }, { erstelltAm: "desc" }],
      take: 200,
      select: { id: true, jahr: true, quartal: true, status: true, erstelltVonName: true, erstelltAm: true, freigegebenVonName: true, freigegebenAm: true, gesellschaft: { select: { name: true } } },
    }),
    kontext.db.gesellschaft.findMany({ where: { id: erlaubt(sicht.gesellschaftIds) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const quartale: Array<{ jahr: number; quartal: number }> = [];
  for (let q = letztesQuartal(heute()), i = 0; i < 8; i++, q = vorquartal(q.jahr, q.quartal)) quartale.push(q);

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf titel={t.navigation.berichte} beschreibung={t.seiten.berichte} />

      {schreiben && (
        <Karte titel={tq.neu}>
          <p className="mb-3 text-sm text-slate-600">
            {tq.neuHinweis} <Begriff k="VierAugen" t={t} />
          </p>
          <Formular aktion={berichtErstellen} absenden={tq.erstellen} laeuftText={tq.laeuft}>
            <Felder>
              <Auswahl name="umfang" label={tq.umfang} wert="portfolio" pflicht optionen={[{ wert: "portfolio", text: tq.portfolio }, ...gesellschaften.map((g) => ({ wert: g.id, text: g.name }))]} />
              <Auswahl name="quartal" label={tq.quartal} wert={`${quartale[0].jahr}-${quartale[0].quartal}`} pflicht optionen={quartale.map((q) => ({ wert: `${q.jahr}-${q.quartal}`, text: fuelle(tq.quartalWert, q) }))} />
            </Felder>
          </Formular>
        </Karte>
      )}

      <Karte titel={tq.liste}>
        {berichte.length === 0 ? (
          <Leer>{tq.keine}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{tq.spalten.quartal}</th>
                <th>{tq.spalten.umfang}</th>
                <th>{tq.spalten.status}</th>
                <th>{tq.spalten.erstellt}</th>
                <th>{tq.spalten.freigabe}</th>
              </tr>
            </thead>
            <tbody>
              {berichte.map((b) => (
                <tr key={b.id} data-bericht={b.status}>
                  <td>
                    <Link href={`/berichte/${b.id}`} className="font-medium hover:underline">
                      {fuelle(tq.quartalWert, { jahr: b.jahr, quartal: b.quartal })}
                    </Link>
                  </td>
                  <td>{b.gesellschaft?.name ?? tq.portfolio}</td>
                  <td>
                    <Marke ton={STATUS_TON[b.status]}>{tq.stati[b.status]}</Marke>
                  </td>
                  <td className="text-sm">{fuelle(tq.erstelltVon, { name: b.erstelltVonName, datum: f.datumZeit(b.erstelltAm) })}</td>
                  <td className="text-sm">{b.freigegebenAm ? fuelle(tq.erstelltVon, { name: b.freigegebenVonName ?? "", datum: f.datumZeit(b.freigegebenAm) }) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </Tabelle>
        )}
      </Karte>

      <Glossar begriffe={["VierAugen", "JNKM", "LTV", "DSCR", "ICR"]} t={t} />
    </div>
  );
}
