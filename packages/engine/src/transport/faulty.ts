import type {
  PeerId,
  Transport,
  TransportFactory,
  TransportMessage,
} from "./transport";
import { makeRng } from "../rng";

/**
 * Fault-injection knobs for {@link makeFaultyFactory}. Every field is optional;
 * an empty object yields a transparent passthrough wrapper. This is a DEV/TEST
 * utility (like the memory transport) so its use of a wall clock is acceptable.
 */
export interface FaultOptions {
  /** Drop the first N outbound sends (simulates a data channel not open yet). */
  dropFirstSends?: number;
  /** 0..1 probability to drop each outbound send; deterministic via seeded rng. */
  dropRate?: number;
  /** Delay delivering onPeerJoin callbacks by this many ms (slow signaling). */
  joinDelayMs?: number;
  /** Drop ALL outbound sends during the first N ms after creation, then recover. */
  failWindowMs?: number;
  /** Seed for dropRate determinism (default is a fixed constant). */
  seed?: number;
  /** Injectable clock for failWindowMs; defaults to Date.now (test seam). */
  now?: () => number;
}

const DEFAULT_SEED = 0x9e3779b9;

class FaultyTransport implements Transport {
  readonly selfId: PeerId;

  private readonly dropFirstSends: number;
  private readonly dropRate: number;
  private readonly joinDelayMs: number;
  private readonly failWindowMs: number;
  private readonly now: () => number;
  private readonly createdAt: number;
  private readonly rng: ReturnType<typeof makeRng>;
  private dropped = 0;
  private pendingJoinTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private readonly inner: Transport,
    opts: FaultOptions,
  ) {
    this.selfId = inner.selfId;
    this.dropFirstSends = opts.dropFirstSends ?? 0;
    this.dropRate = opts.dropRate ?? 0;
    this.joinDelayMs = opts.joinDelayMs ?? 0;
    this.failWindowMs = opts.failWindowMs ?? 0;
    this.now = opts.now ?? (() => Date.now());
    this.createdAt = this.now();
    this.rng = makeRng(opts.seed ?? DEFAULT_SEED);
  }

  private shouldDrop(): boolean {
    // (a) relay-down window: drop everything until it elapses.
    if (
      this.failWindowMs > 0 &&
      this.now() - this.createdAt < this.failWindowMs
    ) {
      return true;
    }
    // (b) initial sends not yet exhausted.
    if (this.dropped < this.dropFirstSends) {
      this.dropped += 1;
      return true;
    }
    // (c) flaky link: probabilistic drop via seeded rng.
    if (this.dropRate > 0 && this.rng.next() < this.dropRate) {
      return true;
    }
    return false;
  }

  onPeerJoin(cb: (id: PeerId) => void): () => void {
    let unsubscribed = false;
    const innerUnsub = this.inner.onPeerJoin((id) => {
      if (this.joinDelayMs > 0) {
        const timer = setTimeout(() => {
          this.pendingJoinTimers.delete(timer);
          if (!unsubscribed) cb(id);
        }, this.joinDelayMs);
        this.pendingJoinTimers.add(timer);
      } else {
        cb(id);
      }
    });
    return () => {
      unsubscribed = true;
      innerUnsub();
    };
  }

  onPeerLeave(cb: (id: PeerId) => void): () => void {
    return this.inner.onPeerLeave(cb);
  }

  onMessage(cb: (msg: TransportMessage) => void): () => void {
    return this.inner.onMessage(cb);
  }

  send(type: string, payload: unknown, to?: PeerId): void {
    if (this.shouldDrop()) return;
    this.inner.send(type, payload, to);
  }

  leave(): void {
    for (const timer of this.pendingJoinTimers) {
      clearTimeout(timer);
    }
    this.pendingJoinTimers.clear();
    this.inner.leave();
  }
}

/**
 * Wrap a {@link TransportFactory} so every transport it produces injects faults
 * per {@link FaultOptions}. Lets you reproduce stuck-connecting, flaky-link, and
 * slow-discovery scenarios deterministically without real cross-device
 * networking. Does not change the Transport interface.
 */
export function makeFaultyFactory(
  inner: TransportFactory,
  opts: FaultOptions,
): TransportFactory {
  return {
    async join(roomCode: string): Promise<Transport> {
      const transport = await inner.join(roomCode);
      return new FaultyTransport(transport, opts);
    },
  };
}
