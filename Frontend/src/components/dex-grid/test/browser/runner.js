// Minimal in-page test runner. Results are rendered into #results and kept on
// window.__dexResults = { done, passed, failed, results: [{ name, ok, error }] }.

const registered = [];

export function test(name, fn) {
  registered.push({ name, fn });
}

export const assert = {
  equal(actual, expected, msg) {
    if (!Object.is(actual, expected)) throw new Error(`${msg ?? "equal"}: expected ${fmt(expected)}, got ${fmt(actual)}`);
  },
  deepEqual(actual, expected, msg) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${msg ?? "deepEqual"}: expected ${fmt(expected)}, got ${fmt(actual)}`);
  },
  ok(value, msg) {
    if (!value) throw new Error(msg ?? "expected truthy value");
  },
};

function fmt(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** A fresh, visible grid container for each test. */
export function container(height = 400) {
  const el = document.createElement("div");
  el.style.height = `${height}px`;
  el.style.width = "900px";
  document.getElementById("stage").appendChild(el);
  return el;
}

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function run(filter) {
  const results = [];
  window.__dexResults = { done: false, passed: 0, failed: 0, results };
  for (const { name, fn } of registered) {
    if (filter && !name.includes(filter)) continue;
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: String(error?.stack ?? error).split("\n").slice(0, 3).join(" | ") });
    }
    document.getElementById("stage").innerHTML = "";
  }
  const passed = results.filter((r) => r.ok).length;
  Object.assign(window.__dexResults, { done: true, passed, failed: results.length - passed });
  const out = document.getElementById("results");
  out.textContent = `${passed}/${results.length} passed\n` + results.map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.name}${r.ok ? "" : `\n     ${r.error}`}`).join("\n");
  return window.__dexResults;
}
