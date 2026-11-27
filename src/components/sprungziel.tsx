"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Springt nach einer Navigation zum Element aus dem Anker (#…) und hebt es kurz hervor,
 * z. B. eine Einheit aus der globalen Suche. Funktioniert auch bei clientseitiger Navigation.
 */
export function Sprungziel() {
  const pfad = usePathname();
  useEffect(() => {
    const springe = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const ziel = document.getElementById(id);
      if (!ziel) return;
      ziel.scrollIntoView({ block: "center" });
      // Zeilen färben über die Zellen, sonst überdecken Zellhintergründe die Markierung.
      const flaechen = ziel.tagName === "TR" ? Array.from(ziel.children) : [ziel];
      for (const el of flaechen) {
        (el as HTMLElement).style.transition = "background-color 1.5s";
        (el as HTMLElement).style.backgroundColor = "#fef9c3";
      }
      setTimeout(() => flaechen.forEach((el) => ((el as HTMLElement).style.backgroundColor = "")), 4000);
    };
    const zeit = setTimeout(springe, 50);
    window.addEventListener("hashchange", springe);
    return () => {
      clearTimeout(zeit);
      window.removeEventListener("hashchange", springe);
    };
  }, [pfad]);
  return null;
}
