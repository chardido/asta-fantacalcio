import js from "@eslint/js";
import tseslint from "typescript-eslint";

const dbImportRestriction = {
  name: "@asta/db",
  message:
    "Lo strato API non puo accedere direttamente ai repository: usa un servizio applicativo protetto da caricaSessionePropria.",
};

const dbImportPatternRestriction = {
  group: ["@asta/db/*", "**/packages/db/**", "**/db/src/**"],
  message:
    "Lo strato API non puo accedere direttamente ai repository: usa un servizio applicativo protetto da caricaSessionePropria.",
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/build/**",
      "**/coverage/**",
      "**/.turbo/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["packages/domain/**/*.{js,mjs,cjs,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@asta/db",
              message:
                "Il dominio deve essere puro e non puo dipendere dalla persistenza.",
            },
            {
              name: "@asta/adapters",
              message:
                "Il dominio deve essere indipendente dagli adattatori delle sorgenti.",
            },
          ],
          patterns: [
            {
              group: [
                "@asta/db/*",
                "@asta/adapters/*",
                "**/packages/db/**",
                "**/packages/adapters/**",
                "**/db/src/**",
                "**/adapters/src/**",
              ],
              message:
                "packages/domain non puo importare persistenza o adattatori.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "Il dominio non esegue I/O: passa i dati esterni come parametri.",
        },
        {
          name: "Date",
          message:
            "Il dominio non legge l'orologio: passa il tempo come parametro esplicito.",
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message:
            "Il dominio e deterministico: passa la casualita come parametro esplicito.",
        },
      ],
    },
  },
  {
    files: [
      "apps/web/src/app/api/**/*.{js,mjs,cjs,ts,tsx}",
      "apps/web/src/api/**/*.{js,mjs,cjs,ts,tsx}",
      "apps/web/src/server/api/**/*.{js,mjs,cjs,ts,tsx}",
      "apps/web/src/server/trpc/**/*.{js,mjs,cjs,ts,tsx}",
      "apps/web/src/**/route.{js,mjs,cjs,ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [dbImportRestriction],
          patterns: [dbImportPatternRestriction],
        },
      ],
    },
  },
);
