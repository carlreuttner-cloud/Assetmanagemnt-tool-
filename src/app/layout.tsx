import type { Metadata } from "next";
import { texte } from "@/i18n";
import "./globals.css";

const t = texte();

export const metadata: Metadata = {
  title: t.app.titel,
  description: "Verwaltung und Analyse von Immobilienportfolios",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
