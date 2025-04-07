// src/index.ts
import TendermintWSClient from './core/client.js';

// Export main client
export default TendermintWSClient;

// Export config type from client
export type { TendermintWSClientConfig } from './core/client.js';

// Export event types and interfaces
export {
  EventType,
  TMEventEmitter
} from './core/events.js';

export type {
  TendermintEvent,
  DecodedTendermintEvent,
  TxResult,
  DecodedTxResult,
  TransferData,
  WSMessage,
  MessageHandlerFn,
  TxHandlerFn,
  ErrorHandlerFn,
  ConnectionHandlerFn,
  ReconnectHandlerFn
} from './core/events.js';

// Export filter types and classes
export {
  FilterManager
} from './filters/filters.js';

export type {
  FilterFiles,
  EventFilter
} from './filters/filters.js';

// Export transformer types and classes
export {
  ChainType,
  createTransformer
} from './transformers/transformers.js';

export type {
  ChainInfo,
  TransformedMessageData
} from './transformers/transformers.js';

// Export advanced filter types and classes
export {
  AdvancedFilterEngine,
  MatchType
} from './filters/advanced-filters.js';

export type {
  AdvancedFilter,
  AttributeCondition
} from './filters/advanced-filters.js';