// Guards src/core_ext/globals.d.ts against drift: the methods it declares on
// each built-in prototype must be exactly the ones install() adds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PROTOTYPES = { String, Number, Boolean, Array, Date, Map, Set };
const SHARED = "ActiveJsCoreExt";

function declaredMethods(source) {
  const blocks = {};
  // Bodies are either "{}" or run until a closing brace on its own line.
  for (const m of source.matchAll(/interface (\w+)(?:<[^>]*>)?(?: extends [^{]+)?\s*\{(\}|[\s\S]*?\n\s*\})/g)) {
    blocks[m[1]] = new Set([...m[2].matchAll(/^\s*(\w+)\s*(?:[<(:])/gm)].map((x) => x[1]));
  }
  return blocks;
}

test("core_ext global declarations match the installed methods", async () => {
  // Start from clean prototypes even when the suite runs with core_ext preloaded.
  const { install, uninstall } = await import("../src/core_ext/register.js");
  const wasInstalled = typeof "".pluralize === "function";
  uninstall();
  const before = Object.fromEntries(
    Object.entries(PROTOTYPES).map(([name, ctor]) => [name, new Set(Object.getOwnPropertyNames(ctor.prototype))]),
  );
  install();
  const installed = Object.fromEntries(
    Object.entries(PROTOTYPES).map(([name, ctor]) => [
      name,
      Object.getOwnPropertyNames(ctor.prototype).filter((n) => !before[name].has(n)).sort(),
    ]),
  );
  uninstall();
  if (wasInstalled) install();

  const declared = declaredMethods(readFileSync(new URL("../src/core_ext/globals.d.ts", import.meta.url), "utf8"));
  for (const name of Object.keys(PROTOTYPES)) {
    const methods = new Set([...(declared[name] ?? []), ...declared[SHARED]]);
    assert.deepEqual([...methods].sort(), installed[name], `${name} declarations`);
  }
});
