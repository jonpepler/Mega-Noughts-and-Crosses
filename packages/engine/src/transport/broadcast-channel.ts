import type {
  PeerId,
  Transport,
  TransportFactory,
  TransportMessage,
} from "./transport";
import { makeSet } from "../internal/listeners";

// Internal wire format for BroadcastChannel messages.
type WireMessage =
  | { _mnac: "presence"; from: PeerId }
  | { _mnac: "presence-reply"; from: PeerId; to: PeerId }
  | { _mnac: "leave"; from: PeerId }
  | { _mnac: "app"; type: string; payload: unknown; from: PeerId; to?: PeerId };

export class BroadcastChannelTransport implements Transport {
  readonly selfId: PeerId;

  private joinListeners = makeSet<PeerId>();
  private leaveListeners = makeSet<PeerId>();
  private messageListeners = makeSet<TransportMessage>();

  private channel: BroadcastChannel;

  /** Peers we have already emitted onPeerJoin for, to dedup crossing announcements. */
  private knownPeers = new Set<PeerId>();

  constructor(roomCode: string) {
    this.selfId = crypto.randomUUID();
    this.channel = new BroadcastChannel(roomCode);
    this.channel.addEventListener("message", this.handleRaw);
  }

  /** Called once after construction to announce presence to existing peers. */
  announce(): void {
    const msg: WireMessage = { _mnac: "presence", from: this.selfId };
    this.channel.postMessage(msg);
  }

  private handleRaw = (event: MessageEvent): void => {
    const wire = event.data as WireMessage;
    if (!wire || wire._mnac === undefined) return;
    if (wire.from === this.selfId) return; // filter own messages

    switch (wire._mnac) {
      case "presence": {
        // Someone joined — notify our listeners (once), then reply so they
        // learn about us. Only `presence` triggers a reply; replying to a
        // `presence-reply` would cause a reply storm.
        this.noticePeer(wire.from);
        const reply: WireMessage = {
          _mnac: "presence-reply",
          from: this.selfId,
          to: wire.from,
        };
        this.channel.postMessage(reply);
        break;
      }
      case "presence-reply": {
        // Only act if this reply is addressed to us. Do not reply back.
        if (wire.to === this.selfId) {
          this.noticePeer(wire.from);
        }
        break;
      }
      case "leave": {
        // Forget the peer so a genuine rejoin is observed again.
        this.knownPeers.delete(wire.from);
        this.leaveListeners.emit(wire.from);
        break;
      }
      case "app": {
        // Directed message: only deliver if addressed to us (or broadcast).
        if (wire.to !== undefined && wire.to !== this.selfId) return;
        this.messageListeners.emit({
          type: wire.type,
          payload: wire.payload,
          from: wire.from,
        });
        break;
      }
    }
  };

  /** Emit onPeerJoin only the first time a peer is seen. */
  private noticePeer(id: PeerId): void {
    if (this.knownPeers.has(id)) return;
    this.knownPeers.add(id);
    this.joinListeners.emit(id);
  }

  onPeerJoin(cb: (id: PeerId) => void): () => void {
    return this.joinListeners.add(cb);
  }

  onPeerLeave(cb: (id: PeerId) => void): () => void {
    return this.leaveListeners.add(cb);
  }

  onMessage(cb: (msg: TransportMessage) => void): () => void {
    return this.messageListeners.add(cb);
  }

  send(type: string, payload: unknown, to?: PeerId): void {
    const wire: WireMessage = {
      _mnac: "app",
      type,
      payload,
      from: this.selfId,
      ...(to !== undefined ? { to } : {}),
    };
    this.channel.postMessage(wire);
  }

  leave(): void {
    const wire: WireMessage = { _mnac: "leave", from: this.selfId };
    this.channel.postMessage(wire);
    this.channel.removeEventListener("message", this.handleRaw);
    this.channel.close();
  }
}

export function makeBroadcastChannelFactory(): TransportFactory {
  return {
    async join(roomCode: string): Promise<Transport> {
      const transport = new BroadcastChannelTransport(roomCode);
      transport.announce();
      return transport;
    },
  };
}
