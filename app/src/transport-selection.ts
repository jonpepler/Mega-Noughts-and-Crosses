import {
  makeBroadcastChannelFactory,
  makeFaultyFactory,
  makeNostrFactory,
  type FaultOptions,
  type TransportFactory,
} from "@mnac/engine";

/** Applied for a bare `?fault` / `?fault=1`: easy to trigger by hand. */
const DEFAULT_FAULT_PROFILE: FaultOptions = {
  dropFirstSends: 6,
  joinDelayMs: 2500,
};

/**
 * Parse the `fault` URL param into FaultOptions.
 *
 * Spec: comma-separated `key:value` pairs, e.g.
 *   `dropFirst:6,joinDelay:3000,dropRate:0.3,failMs:8000`
 * Key mapping: dropFirst -> dropFirstSends, joinDelay -> joinDelayMs,
 * dropRate -> dropRate, failMs -> failWindowMs.
 *
 * A bare `?fault`, `?fault=1`, or any value with no recognised keys yields the
 * default profile so faults are easy to trigger.
 */
function parseFaultOptions(raw: string | null): FaultOptions {
  if (raw === null || raw === "" || raw === "1") {
    return DEFAULT_FAULT_PROFILE;
  }

  const opts: FaultOptions = {};
  let recognised = 0;

  for (const pair of raw.split(",")) {
    const idx = pair.indexOf(":");
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value === "") continue;

    switch (key) {
      case "dropFirst": {
        const n = Number.parseInt(value, 10);
        if (Number.isFinite(n)) {
          opts.dropFirstSends = n;
          recognised += 1;
        }
        break;
      }
      case "joinDelay": {
        const n = Number.parseInt(value, 10);
        if (Number.isFinite(n)) {
          opts.joinDelayMs = n;
          recognised += 1;
        }
        break;
      }
      case "dropRate": {
        const n = Number.parseFloat(value);
        if (Number.isFinite(n)) {
          opts.dropRate = n;
          recognised += 1;
        }
        break;
      }
      case "failMs": {
        const n = Number.parseInt(value, 10);
        if (Number.isFinite(n)) {
          opts.failWindowMs = n;
          recognised += 1;
        }
        break;
      }
      default:
        break;
    }
  }

  return recognised > 0 ? opts : DEFAULT_FAULT_PROFILE;
}

/**
 * Pick a TransportFactory based on the URL search string.
 *
 * - If the search string contains the `local` param (e.g. `?local` or `?local=1`),
 *   use a BroadcastChannelFactory (same-device / same-browser testing).
 * - Otherwise use a NostrFactory (production P2P via trystero/nostr).
 *
 * If a `fault` param is also present, the chosen factory is wrapped with
 * `makeFaultyFactory` so connection problems can be reproduced on demand, e.g.:
 *   `?local&fault` (default profile),
 *   `?local&fault=dropFirst:6,joinDelay:3000,dropRate:0.3,failMs:8000`.
 * With no `fault` param the behavior is unchanged (no wrapping).
 *
 * @param search - Defaults to `window.location.search` in a browser context.
 *                 Pass an explicit value in tests.
 */
export function selectTransportFactory(search?: string): TransportFactory {
  const searchStr =
    search !== undefined
      ? search
      : typeof window !== "undefined"
        ? window.location.search
        : "";

  const params = new URLSearchParams(searchStr);

  const base: TransportFactory = params.has("local")
    ? makeBroadcastChannelFactory()
    : makeNostrFactory({ appId: "mega-noughts-and-crosses" });

  if (params.has("fault")) {
    return makeFaultyFactory(base, parseFaultOptions(params.get("fault")));
  }

  return base;
}
