import Link from "next/link";
import { KnopfLink, Leer, Seitenkopf, Tabelle } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { formatierer } from "@/lib/format";
import { ausJson } from "@/lib/szenario";
import { kurzText } from "./eingabe";

export default async function SzenarienSeite() {
  const kontext = await pruefeZugriff("szenarien");
  const t = texte(kontext.mandant.sprache);
  const ts = t.szenarien;
  const f = formatierer(kontext.mandant);
  const sicht = await sichtbarkeit(kontext);
  const szenarien = await kontext.db.szenario.findMany({
    where: sicht.gesellschaftIds === "alle" ? {} : { gesellschaftId: { in: sicht.gesellschaftIds } },
    orderBy: { geaendertAm: "desc" },
    include: { gesellschaft: { select: { name: true } }, benutzer: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <Seitenkopf
        titel={ts.titel}
        beschreibung={t.seiten.szenarien}
        aktionen={
          <div className="flex gap-2">
            <KnopfLink href="/ki-vorschlag">{t.kiVorschlag.aufruf}</KnopfLink>
            <KnopfLink href="/szenarien/neu" art="primaer">
              {ts.neu}
            </KnopfLink>
          </div>
        }
      />
      <div className="rounded-xl border border-slate-200 bg-white">
        {szenarien.length === 0 ? (
          <div className="px-5">
            <Leer>{ts.keine}</Leer>
          </div>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{ts.name}</th>
                <th>{ts.bereich}</th>
                <th>{ts.parameter}</th>
                <th>{ts.erstellt}</th>
              </tr>
            </thead>
            <tbody>
              {szenarien.map((s) => (
                <tr key={s.id} className="align-top hover:bg-slate-50">
                  <td>
                    <Link href={`/szenarien/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                    {s.beschreibung && <div className="text-xs text-slate-500">{s.beschreibung}</div>}
                  </td>
                  <td>{s.gesellschaft?.name ?? ts.portfolio}</td>
                  <td className="text-slate-600">{kurzText(ausJson(s.parameter), t, f)}</td>
                  <td className="whitespace-nowrap text-slate-600">
                    {f.datum(s.geaendertAm.toISOString().slice(0, 10))}
                    {s.benutzer && <div className="text-xs text-slate-500">{s.benutzer.name}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabelle>
        )}
      </div>
    </div>
  );
}
