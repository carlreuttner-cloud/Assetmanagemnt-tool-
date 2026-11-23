import { hash } from "@node-rs/argon2";

/** Erzeugt einen Argon2id-Hash für ein Passwort. */
export function passwortHash(passwort: string) {
  return hash(passwort, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}
