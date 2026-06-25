export type PeerId = string;

export interface TransportMessage {
  type: string;
  payload: unknown;
  from: PeerId;
}

export interface Transport {
  readonly selfId: PeerId;
  onPeerJoin(cb: (id: PeerId) => void): () => void;
  onPeerLeave(cb: (id: PeerId) => void): () => void;
  onMessage(cb: (msg: TransportMessage) => void): () => void;
  send(type: string, payload: unknown, to?: PeerId): void;
  leave(): void;
}

export interface TransportFactory {
  join(roomCode: string): Promise<Transport>;
}
