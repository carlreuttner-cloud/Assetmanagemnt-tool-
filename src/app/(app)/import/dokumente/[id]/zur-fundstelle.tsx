"use client";

import { useEffect } from "react";

/** Scrollt im Textfeld zur aktuellen Fundstelle (Element mit data-aktuell), ohne die Seite zu verschieben. */
export function ZurFundstelle({ schluessel }: { schluessel: string }) {
  useEffect(() => {
    const ziel = document.querySelector<HTMLElement>("[data-aktuell]");
    const box = ziel?.closest<HTMLElement>("[data-textfeld]");
    if (!ziel || !box) return;
    box.scrollTop = Math.max(0, ziel.offsetTop - box.offsetTop - box.clientHeight / 3);
  }, [schluessel]);
  return null;
}
