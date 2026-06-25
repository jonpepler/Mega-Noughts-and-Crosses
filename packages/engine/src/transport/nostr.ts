import { joinRoom, selfId as trysterSelfId } from "trystero/nostr";
import type { ActionReceiver, ActionSender } from "trystero";
import type {
  PeerId,
  Transport,
  TransportFactory,
  TransportMessage,
} from "./transport";
import { makeSet } from "../internal/listeners";

// The wire format sent over trystero actions.
// We need a type that satisfies trystero's DataPayload constraint (JSON-safe).
// `payload` is typed as `unknown` on the Transport interface, so we use a
// safe-JSON object type for the wire format and cast at the boundary.
interface WireMessage {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
}

export class NostrTransport implements Transport {
  readonly selfId: PeerId;

  private joinListeners = makeSet<PeerId>();
  private leaveListeners = makeSet<PeerId>();
  private messageListeners = makeSet<TransportMessage>();

  private room: ReturnType<typeof joinRoom>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sendAction: ActionSender<any>;

  constructor(room: ReturnType<typeof joinRoom>) {
    this.selfId = trysterSelfId;
    this.room = room;

    // Set up a single action namespace for all app messages.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [sendAction, receiveAction] = room.makeAction<any>("m") as [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ActionSender<any>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ActionReceiver<any>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any,
    ];
    this.sendAction = sendAction;

    receiveAction((data: WireMessage, peerId: string) => {
      this.messageListeners.emit({
        type: data.type,
        payload: data.payload as unknown,
        from: peerId,
      });
    });

    // Fan out trystero's single-callback join/leave to our subscriber sets.
    room.onPeerJoin((peerId) => {
      this.joinListeners.emit(peerId);
    });

    room.onPeerLeave((peerId) => {
      this.leaveListeners.emit(peerId);
    });
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
    const data: WireMessage = { type, payload };
    if (to !== undefined) {
      void this.sendAction(data, to);
    } else {
      void this.sendAction(data);
    }
  }

  leave(): void {
    void this.room.leave();
  }
}

const DEFAULT_RELAY_URLS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://relay.primal.net",
  "wss://relay.snort.social",
];

const DEFAULT_RELAY_REDUNDANCY = 4;

export function makeNostrFactory(opts: {
  appId: string;
  relayUrls?: string[];
  relayRedundancy?: number;
}): TransportFactory {
  const relayUrls = opts.relayUrls ?? DEFAULT_RELAY_URLS;
  const relayRedundancy = opts.relayRedundancy ?? DEFAULT_RELAY_REDUNDANCY;
  return {
    async join(roomCode: string): Promise<Transport> {
      const room = joinRoom({ appId: opts.appId, relayUrls, relayRedundancy }, roomCode);
      return new NostrTransport(room);
    },
  };
}
