import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Downgrade overly strict rules that produce false positives in this codebase.
  {
    rules: {
      // setState inside useEffect is valid for localStorage init and derived state resets.
      'react-hooks/set-state-in-effect': 'off',
      // Date.now() in render is intentional for age-based badge computation.
      'react-hooks/purity': 'off',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
