import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verify } from "@node-rs/argon2";
import { z } from "zod";
import { basisDb } from "@/lib/db/client";

const anmeldedaten = z.object({
  email: z.email().transform((e) => e.toLowerCase().trim()),
  passwort: z.string().min(1),
});

class FalscheAnmeldung extends CredentialsSignin {
  code = "falsche_anmeldung";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  logger: {
    // Falsche Passwörter sind kein Serverfehler und sollen das Log nicht füllen.
    error(fehler) {
      if (fehler instanceof CredentialsSignin) return;
      console.error(fehler);
    },
  },
  providers: [
    Credentials({
      credentials: { email: {}, passwort: {} },
      async authorize(eingabe) {
        const geprueft = anmeldedaten.safeParse(eingabe);
        if (!geprueft.success) throw new FalscheAnmeldung();

        const benutzer = await basisDb.benutzer.findUnique({
          where: { email: geprueft.data.email },
        });
        if (!benutzer || !benutzer.aktiv) throw new FalscheAnmeldung();
        if (!(await verify(benutzer.passwortHash, geprueft.data.passwort))) {
          throw new FalscheAnmeldung();
        }
        return { id: benutzer.id, name: benutzer.name, email: benutzer.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.benutzerId = user.id;
      return token;
    },
    session({ session, token }) {
      if (typeof token.benutzerId === "string") session.user.id = token.benutzerId;
      return session;
    },
  },
});
