/**
 * Next.js Instrumentation hook — runs once when the server process starts,
 * before any page is rendered.
 *
 * pdfjs-dist (v4) accesses localStorage during initialisation.  On the server
 * Next.js stubs `localStorage` as a plain object (or with `--localstorage-file`
 * pointing nowhere), so `localStorage.getItem` is not a function → 500 errors.
 *
 * We patch the global with a proper no-op Storage before pdfjs can run.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const ls = globalThis.localStorage as Storage | undefined;
    if (!ls || typeof ls.getItem !== "function") {
      globalThis.localStorage = {
        length: 0,
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
      } as unknown as Storage;
    }
  }
}
