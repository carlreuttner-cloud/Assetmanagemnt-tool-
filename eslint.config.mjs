import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Beträge nie als Gleitkommazahl verarbeiten, siehe src/lib/geld.ts
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "parseFloat", message: "Beträge mit dezimal() oder parseBetrag() aus @/lib/geld verarbeiten." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Number", property: "parseFloat", message: "Beträge mit dezimal() oder parseBetrag() aus @/lib/geld verarbeiten." },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/generated/**"]),
]);

export default eslintConfig;
