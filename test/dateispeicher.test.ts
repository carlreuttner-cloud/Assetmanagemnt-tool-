import { describe, expect, it } from "vitest";
import { bildTypAusInhalt } from "@/lib/dateispeicher";

describe("Dateispeicher", () => {
  it("erkennt Bildtypen am Inhalt, nicht an der Endung", () => {
    expect(bildTypAusInhalt(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(bildTypAusInhalt(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe("image/png");
    expect(bildTypAusInhalt(new TextEncoder().encode("RIFF1234WEBPVP8 "))).toBe("image/webp");
    expect(bildTypAusInhalt(new TextEncoder().encode("<html><script>"))).toBeNull();
  });
});
