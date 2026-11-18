/**
 * filterValueGetter functions written by the application. AG Grid injects its own
 * stringifying filterValueGetter for inferred "object" columns, which dex filters
 * must not use; this set tells the two apart.
 */
export const userFilterValueGetters = new WeakSet();

/** valueParser functions written by the application (AG Grid injects its own for inferred data types). */
export const userValueParsers = new WeakSet();

/** Adds methods to the grid api so they are reachable from event params.api too. */
export function attachMethods(api, methods) {
  for (const [name, fn] of Object.entries(methods)) {
    Object.defineProperty(api, name, { value: fn, configurable: true, writable: true, enumerable: false });
  }
}
