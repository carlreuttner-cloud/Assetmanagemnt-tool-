import { Karte, Leer, Marke, Seitenkopf, Tabelle } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { heute } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import { ImportReiter } from "./import-reiter";
import { KreditImport } from "./kredit-import";
import { MieterImport } from "./mieter-import";

export default async function ImportSeite({ searchParams }: PageProps<"/import">) {
  const kontext = await pruefeZugriff("import");
  const t = texte(kontext.mandant.sprache);
  const ti = t.importe;
  const f = formatierer(kontext.mandant);
  const sp = await searchParams;
  const sicht = await sichtbarkeit(kontext);
  const schreiben = darf(kontext.rolle, "import", "schreiben");
  const kreditImport = schreiben && darf(kontext.rolle, "gesellschaften", "schreiben");
  const reiter = kreditImport && sp.art === "kredite" ? "kredite" : "mieter";
  const hausVorwahl = typeof sp.haus === "string" ? sp.haus : null;

  const [haeuser, kredite] = await Promise.all([
    kontext.db.haus.findMany({ where: { id: erlaubt(sicht.hausIds) }, select: { id: true, bezeichnung: true }, orderBy: { bezeichnung: "asc" } }),
    kreditImport
      ? kontext.db.kredit.findMany({
          where: { gesellschaftId: erlaubt(sicht.gesellschaftIds) },
          select: { id: true, bezeichnung: true, kreditnummer: true, bank: true },
          orderBy: { bezeichnung: "asc" },
        })
      : Promise.resolve([]),
  ]);
  // Verlauf: Hausverwaltung sieht nur Importe ihrer Häuser, ohne Kreditimporte
  const verlauf = await kontext.db.importvorgang.findMany({
    where: sicht.hausIds === "alle" ? {} : { hausId: { in: sicht.hausIds } },
    orderBy: { erstelltAm: "desc" },
    take: 20,
    include: {
      benutzer: { select: { name: true } },
      haus: { select: { bezeichnung: true } },
      kredit: { select: { bezeichnung: true } },
    },
  });
  const mandant = { waehrung: kontext.mandant.waehrung, sprache: kontext.mandant.sprache };

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf titel={ti.titel} beschreibung={kreditImport ? ti.beschreibung : ti.beschreibungMieter} />

      <ImportReiter kontext={kontext} t={t} aktiv={reiter} />

      {!schreiben ? (
        <Leer>{t.allgemein.nurLesen}</Leer>
      ) : reiter === "mieter" ? (
        <Karte titel={ti.mieterliste}>
          {haeuser.length === 0 ? (
            <Leer>{ti.keineHaeuser}</Leer>
          ) : (
            <MieterImport t={t} haeuser={haeuser} heute={heute()} mandant={mandant} hausVorwahl={hausVorwahl} />
          )}
        </Karte>
      ) : (
        <Karte titel={ti.kreditbuchungen}>
          <KreditImport
            t={t}
            mandant={mandant}
            kredite={kredite.map((k) => ({ id: k.id, text: [k.bezeichnung, k.kreditnummer, k.bank].filter(Boolean).join(" · ") }))}
          />
        </Karte>
      )}

      <Karte titel={ti.verlauf}>
        {verlauf.length === 0 ? (
          <Leer>{ti.keinVerlauf}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{ti.zeitpunkt}</th>
                <th>{ti.art}</th>
                <th>{ti.ziel}</th>
                <th>{ti.datei}</th>
                <th>{ti.benutzer}</th>
                <th>{ti.ergebnis}</th>
              </tr>
            </thead>
            <tbody>
              {verlauf.map((v) => {
                const zahlen = (v.ergebnis ?? {}) as Record<string, number>;
                const namen: Record<string, string> = { ...ti.aktionen, dublette: ti.dublette };
                return (
                  <tr key={v.id}>
                    <td className="whitespace-nowrap">
                      {new Intl.DateTimeFormat(f.sprache, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(v.erstelltAm)}
                    </td>
                    <td>{ti.artName[v.art]}</td>
                    <td>{v.haus?.bezeichnung ?? v.kredit?.bezeichnung ?? "–"}</td>
                    <td className="max-w-xs truncate">{v.dateiname}</td>
                    <td>{v.benutzer?.name ?? "–"}</td>
                    <td className="space-x-1">
                      {Object.entries(zahlen)
                        .filter(([, n]) => n > 0)
                        .map(([k, n]) => (
                          <Marke key={k}>
                            {n} {namen[k] ?? k}
                          </Marke>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabelle>
        )}
      </Karte>
    </div>
  );
}
