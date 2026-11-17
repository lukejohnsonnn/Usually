// Loader hook for the seed-upsert regression test: redirect "pg" imports to the
// pg-mem shim (scripts/pg-mem-shim.mjs) so db.js's PgStore runs in-memory.
// Used as: node --loader scripts/pg-mem-loader.mjs scripts/test-seed-upsert.mjs
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "pg") {
    return { url: new URL("./pg-mem-shim.mjs", import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
