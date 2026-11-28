import Link from "next/link";
import { DateiZone } from "@/components/datei-zone";
import { Formular } from "@/components/formular";
import { Karte, Leer, Reiter, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { DOKUMENT_TYPEN, MAX_DOKUMENT_MB } from "@/lib/dateispeicher";
import type { EingangVorschlag } from "@/lib/eingang";
import { einParam } from "@/lib/filter";
import { formatierer } from "@/lib/format";
import { eingangHochladen, regelLoeschen, schnellUebernehmen } from "./aktionen";
import { SicherheitMarke } from "./eingang-bausteine";

const ANSICHTEN = {
  offen: ["ZU_PRUEFEN"],
  unsicher: ["UNSICHER"],
  quarantaene: ["QUARANTAENE"],
  erledigt: ["UEBERNOMMEN", "ABGELEHNT"],
} as const;
type Ansicht = keyof typeof ANSICHTEN;

export default async function PosteingangSeite({ searchParams }: PageProps<"/posteingang">) {
  const kontext = await pruefeZugriff("dokumente", "schreiben");
  await sichtbarkeit(kontext);
  const t = texte(kontext.mandant.sprache);
  const te = t.eingang;
  const f = formatierer(kontext.mandant);
  const sp = await searchParams;
  const ansicht: Ansicht = (Object.keys(ANSICHTEN) as Ansicht[]).find((a) => a === einParam(sp.ansicht)) ?? "offen";

  const [zahlen, eintraege, regeln] = await Promise.all([
    kontext.db.eingang.groupBy({ by: ["status"], _count: { _all: true } }),
    kontext.db.eingang.findMany({
      where: { status: { in: [...ANSICHTEN[ansicht]] } },
      orderBy: { erstelltAm: "desc" },
      take: 200,
      select: { id: true, dateiname: true, quelle: true, status: true, vorschlag: true, absenderAdresse: true, absenderHinweis: true, erstelltAm: true, dokumentId: true },
    }),
    kontext.db.zuordnungsregel.findMany({
      orderBy: { geaendertAm: "desc" },
      take: 100,
      include: { gesellschaft: { select: { name: true } }, haus: { select: { bezeichnung: true } }, kredit: { select: { bezeichnung: true } } },
    }),
  ]);
  const anzahl = (a: Ansicht) => zahlen.filter((z) => (ANSICHTEN[a] as readonly string[]).includes(z.status)).reduce((s, z) => s + z._count._all, 0);

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf titel={te.titel} beschreibung={te.beschreibung} />

      <Karte titel={te.hochladen}>
        <Formular aktion={eingangHochladen} absenden={te.hochladenKnopf} laeuftText={te.laeuft} zuruecksetzen>
          <DateiZone
            name="dateien"
            accept={Object.keys(DOKUMENT_TYPEN).join(",")}
            texte={{ ziehen: te.ziehen, auswaehlen: te.auswaehlen, gewaehlt: te.gewaehlt, hinweis: fuelle(te.hochladenHinweis, { mb: MAX_DOKUMENT_MB }) }}
          />
        </Formular>
      </Karte>

      <Karte>
        <Reiter eintraege={(Object.keys(ANSICHTEN) as Ansicht[]).map((a) => ({ href: `/posteingang?ansicht=${a}`, text: `${te.reiter[a]} (${anzahl(a)})`, aktiv: a === ansicht }))} />
        {eintraege.length === 0 ? (
          <Leer>{te.leer}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{te.spalten.eingang}</th>
                <th>{te.spalten.vorschlag}</th>
                <th>{te.spalten.zuordnung}</th>
                <th>{te.spalten.absender}</th>
                <th>{te.spalten.sicherheit}</th>
                <th className={rechts} />
              </tr>
            </thead>
            <tbody>
              {eintraege.map((e) => {
                const v = e.vorschlag as unknown as EingangVorschlag | null;
                return (
                  <tr key={e.id} className="hover:bg-slate-50" data-eingang={e.status}>
                    <td className="whitespace-nowrap">
                      {f.datum(e.erstelltAm)}
                      <div className="text-xs text-slate-500">
                        {te.quellen[e.quelle]}
                        {e.absenderAdresse ? ` · ${e.absenderAdresse}` : e.absenderHinweis ? ` · ${e.absenderHinweis}` : ""}
                      </div>
                    </td>
                    <td>
                      <Link href={`/posteingang/${e.id}`} className="font-medium hover:underline">
                        {v?.titel ?? e.dateiname}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {t.dateien.original}: {e.dateiname}
                      </div>
                    </td>
                    <td>{v?.objekt ? `${te.objektArten[v.objekt.art]}: ${v.objekt.name}` : <span className="italic text-slate-400">{te.keineZuordnung}</span>}</td>
                    <td>
                      {v?.absenderArt ? t.dateien.absenderArten[v.absenderArt] : <span className="italic text-slate-400">{t.dateien.keinAbsender}</span>}
                      {v?.absenderName && <div className="text-xs text-slate-500">{v.absenderName}</div>}
                    </td>
                    <td>{e.status === "UEBERNOMMEN" || e.status === "ABGELEHNT" ? te.stati[e.status] : v ? <SicherheitMarke s={v.sicherheit} t={t} /> : "–"}</td>
                    <td className={rechts}>
                      {e.status === "ZU_PRUEFEN" && v?.sicherheit === "hoch" && (
                        <span title={te.schnellHinweis}>
                          <Formular aktion={schnellUebernehmen.bind(null, e.id)} absenden={te.schnell} art="sekundaer" className="" />
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabelle>
        )}
      </Karte>

      <Karte titel={te.regeln.titel}>
        <p className="mb-3 text-sm text-slate-600">{te.regeln.beschreibung}</p>
        {regeln.length === 0 ? (
          <Leer>{te.regeln.keine}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{te.regeln.merkmal}</th>
                <th>{te.regeln.wert}</th>
                <th>{te.regeln.ziel}</th>
                <th className={rechts}>{te.regeln.anzahl}</th>
                <th>{te.regeln.geaendert}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {regeln.map((r) => (
                <tr key={r.id} data-regel={r.merkmal}>
                  <td>{te.merkmale[r.merkmal]}</td>
                  <td className="font-mono text-xs">{r.merkmal === "ABSENDER_NAME" && r.absenderName ? r.absenderName : r.merkmal === "ABSENDER_ADRESSE" ? r.wert : r.wert.toUpperCase()}</td>
                  <td>
                    {[r.gesellschaft?.name, r.haus?.bezeichnung, r.kredit?.bezeichnung].filter(Boolean).join(", ")}
                    {r.absenderArt && `${t.dateien.absenderArten[r.absenderArt]}${r.absenderName ? `: ${r.absenderName}` : ""}`}
                  </td>
                  <td className={rechts}>{r.anzahl}×</td>
                  <td>{f.datum(r.geaendertAm)}</td>
                  <td>
                    <Formular aktion={regelLoeschen.bind(null, r.id)} absenden={te.regeln.loeschen} inline />
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabelle>
        )}
      </Karte>
    </div>
  );
}
