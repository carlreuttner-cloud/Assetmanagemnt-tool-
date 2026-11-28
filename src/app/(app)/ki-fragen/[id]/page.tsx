import Link from "next/link";
import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { Karte, Seitenkopf } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { formatierer } from "@/lib/format";
import type { FrageDaten, GepruefteAntwort } from "@/lib/ki-antwort";
import { zeitpunkt } from "../../ki-assistent/ki-bausteine";
import { frageLoeschen } from "../aktionen";
import { AntwortAnsicht } from "../bausteine";

export default async function KiFrageSeite({ params }: PageProps<"/ki-fragen/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("kiAssistent");
  await sichtbarkeit(kontext);
  const t = texte(kontext.mandant.sprache);
  const tf = t.kiFragen;
  const f = formatierer(kontext.mandant);
  // Nur eigene Fragen: die gespeicherten Daten folgen der Sichtbarkeit des Fragenden.
  const frage = await kontext.db.kiFrage.findFirst({ where: { id, benutzerId: kontext.benutzer.id } });
  if (!frage) notFound();
  const daten = frage.daten as unknown as FrageDaten | null;
  const antwort = frage.antwort as unknown as GepruefteAntwort | null;
  const demo = frage.modell === tf.demo.modell;

  return (
    <div className="max-w-5xl space-y-6">
      <Link href="/ki-fragen" className="text-sm text-slate-500 hover:underline">
        ← {tf.zurueck}
      </Link>
      <Seitenkopf titel={frage.frage} beschreibung={`${zeitpunkt(frage.erstelltAm, kontext.mandant.sprache)} · ${fuelle(tf.stichtagAntwort, { datum: f.datum(frage.stichtag) })} · ${fuelle(tf.modell, { modell: frage.modell })}`} />
      {demo && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{tf.demo.kennzeichnung}</p>}
      {frage.status === "FEHLER" || !antwort || !daten ? (
        <Karte>
          <p className="text-sm text-red-700">{frage.fehler ?? t.ki.fehlerFormat}</p>
        </Karte>
      ) : (
        <AntwortAnsicht antwort={antwort} daten={daten} t={t} f={f} waehrung={kontext.mandant.waehrung} />
      )}
      {darf(kontext.rolle, "kiAssistent", "schreiben") && (
        <Formular aktion={frageLoeschen.bind(null, frage.id)} absenden={tf.loeschen} art="gefahr" bestaetigen={tf.loeschenBestaetigen} />
      )}
    </div>
  );
}
