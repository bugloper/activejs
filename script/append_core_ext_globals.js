// Appends the hand-written global augmentations to the generated
// declarations for "@bugloper/activejs/core_ext" (JSDoc can't express `declare global`).
// Run after `tsc`; see the build:types script.
import { readFileSync, appendFileSync } from "node:fs";

const globals = readFileSync(new URL("../src/core_ext/globals.d.ts", import.meta.url), "utf8");
appendFileSync(new URL("../types/core_ext/register.d.ts", import.meta.url), `\n${globals}`);
