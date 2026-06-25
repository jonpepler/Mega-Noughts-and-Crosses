import type {
  PeerId,
  Transport,
  TransportFactory,
  TransportMessage,
} from "./transport";

type Listener<T> = (val: T) => void;

function makeSet<T>() {
  const set = new Set<Listener<T>>();
  return {
    add(fn: Listener<T>) {
      set.add(fn);
      return () => { set.delete(fn); };
    },
    emit(val: T) {
      for (const fn of set) fn(val);
    },
  };
}

interface RoomHub {
  members: Map<PeerId, MemoryTransport>;
}

class MemoryTransport implements Transport {
  readonly selfId: PeerId;

  private joinListeners = makeSet<PeerId>();
  private leaveListeners = makeSet<PeerId>();
  private messageListeners = makeSet<TransportMessage>();

  constructor(
    selfId: PeerId,
    private hub: RoomHub,
  ) {
    this.selfId = selfId;
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
    const msg: TransportMessage = { type, payload, from: this.selfId };
    if (to !== undefined) {
      this.hub.members.get(to)?.deliverMessage(msg);
    } else {
      for (const [id, peer] of this.hub.members) {
        if (id !== this.selfId) {
          peer.deliverMessage(msg);
        }
      }
    }
  }

  leave(): void {
    this.hub.members.delete(this.selfId);
    for (const [, peer] of this.hub.members) {
      peer.notifyLeave(this.selfId);
    }
  }

  /** Called by other transports to deliver a message to this transport. */
  deliverMessage(msg: TransportMessage): void {
    this.messageListeners.emit(msg);
  }

  /** Called by other transports to notify this transport of a peer leaving. */
  notifyLeave(id: PeerId): void {
    this.leaveListeners.emit(id);
  }

  /** Called by the factory to notify this transport of a new peer. */
  notifyJoin(id: PeerId): void {
    this.joinListeners.emit(id);
  }
}

export function makeMemoryFactory(): TransportFactory {
  const rooms = new Map<string, RoomHub>();

  return {
    async join(roomCode: string): Promise<Transport> {
      let hub = rooms.get(roomCode);
      if (!hub) {
        hub = { members: new Map() };
        rooms.set(roomCode, hub);
      }

      const id: PeerId = crypto.randomUUID();
      const transport = new MemoryTransport(id, hub);

      // Notify existing members of the new peer, and notify newcomer of each existing peer.
      for (const [existingId, existingTransport] of hub.members) {
        existingTransport.notifyJoin(id);
        transport.notifyJoin(existingId);
      }

      hub.members.set(id, transport);

      return transport;
    },
  };
}
