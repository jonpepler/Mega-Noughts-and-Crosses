// Public surface of @mnac/engine.
// Types are exported with `export type` (verbatimModuleSyntax).

// Game types
export type { GameDefinition, MoveValidation, GameResult } from "./game";

// RNG
export { makeRng } from "./rng";
export type { Rng } from "./rng";

// Transport
export type {
  Transport,
  TransportFactory,
  TransportMessage,
  PeerId,
} from "./transport/transport";
export { makeMemoryFactory } from "./transport/memory";
export {
  makeBroadcastChannelFactory,
  BroadcastChannelTransport,
} from "./transport/broadcast-channel";

// Session
export { startHost, joinClient } from "./session";
export type { GameRoom } from "./session";

// React bindings
export { useGameRoom } from "./react/use-game-room";
export type { UseGameRoomOptions, UseGameRoomResult } from "./react/use-game-room";
