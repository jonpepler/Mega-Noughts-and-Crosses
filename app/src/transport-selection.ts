import {
  makeBroadcastChannelFactory,
  makeNostrFactory,
  type TransportFactory,
} from "@mnac/engine";

/**
 * Pick a TransportFactory based on the URL search string.
 *
 * - If the search string contains the `local` param (e.g. `?local` or `?local=1`),
 *   return a BroadcastChannelFactory (same-device / same-browser testing).
 * - Otherwise return a NostrFactory (production P2P via trystero/nostr).
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
  if (params.has("local")) {
    return makeBroadcastChannelFactory();
  }
  return makeNostrFactory({ appId: "mega-noughts-and-crosses" });
}
