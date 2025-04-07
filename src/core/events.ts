// src/events.ts
import { EventEmitter } from 'events';

export interface TendermintEvent {
  type: string;
  attributes: Array<{
    key: string;
    value: string;
    index?: boolean;
  }>;
}

export interface DecodedTendermintEvent {
  type: string;
  attributes: Record<string, string[]>;
  rawAttributes: Array<{
    key: string;
    value: string;
    decodedKey: string;
    decodedValue: string;
    index?: boolean;
  }>;
}

export interface TxResult {
  height: string;
  txhash: string;
  events: TendermintEvent[];
  gasWanted: string;
  gasUsed: string;
}

export interface DecodedTxResult {
  height: string;
  txhash: string;
  events: DecodedTendermintEvent[];
  decodedEvents: DecodedTendermintEvent[];
  gasWanted: string;
  gasUsed: string;
  transferData?: {
    senders: string[];
    receivers: string[];
    recipients: string[];
    spenders: string[];
    amounts: string[];
  };
  matchedFilters?: {
    filterType: string;
    matches: Array<{
      type: string;
      field: string;
      value: string;
    }>;
  }[];
}

export interface TransferData {
  senders: Set<string>;
  receivers: Set<string>;
  recipients: Set<string>;
  spenders: Set<string>;
  amounts: Set<string>;
  [key: string]: Set<string>;
}

export interface WSMessage {
  jsonrpc: string;
  id?: number | string;
  result?: {
    data?: any;
    events?: Record<string, string[]>;
    [key: string]: any;
  };
  error?: any;
  method?: string;
  params?: any;
  events?: Record<string, string[]>;
}

// Swap transaction details
export interface SwapTransactionDetails {
  poolId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  sender: string;
}

// Staking transaction details
export interface StakingTransactionDetails {
  action: 'delegate' | 'undelegate' | 'redelegate' | 'withdraw_rewards';
  delegator: string;
  validator: string;
  amount?: string;
  denom?: string;
  sourceValidator?: string;
  destinationValidator?: string;
}
// IBC transfer details
export interface IBCTransferDetails {
  sender: string;
  receiver: string;
  sourceChannel: string;
  sourcePort: string;
  destChannel?: string;
  destPort?: string;
  amount: string;
  denom: string;
}

// Enhanced decoded TX result with specific transaction details
export interface EnhancedDecodedTxResult extends DecodedTxResult {
  swapDetails?: SwapTransactionDetails[];
  stakingDetails?: StakingTransactionDetails[];
  ibcDetails?: IBCTransferDetails[];
  txType?: string;
}

export type MessageHandlerFn = (message: WSMessage) => void;
export type TxHandlerFn = (result: DecodedTxResult) => void;
export type ErrorHandlerFn = (error: Error) => void;
export type ConnectionHandlerFn = () => void;
export type ReconnectHandlerFn = (attempt: number, maxAttempts: number) => void;

export enum EventType {
  // Core event types
  Message = 'message',
  Tx = 'tx',
  Error = 'error',
  Connected = 'connected',
  Disconnected = 'disconnected',
  Reconnecting = 'reconnecting',
  SubscriptionConfirmed = 'subscription_confirmed',
  
  // Transaction categories
  FilteredTx = 'filtered_tx',
  WasmTx = 'wasm_tx',
  WalletTx = 'wallet_tx',
  StakingTx = 'staking_tx',
  
  // Transaction types from the Cosmos ecosystem
  Transfer = 'transfer',
  Swap = 'swap',
  LiquidityEvent = 'liquidity',
  IBCTransfer = 'ibc_transfer',
  Withdraw = 'withdraw',
  Delegate = 'delegate',
  Undelegate = 'undelegate',
  Redelegate = 'redelegate',
  WithdrawRewards = 'withdraw_rewards',
  GovernanceVote = 'governance_vote',
  ProposalDeposit = 'proposal_deposit',
}

export class TMEventEmitter extends EventEmitter {
  onMessage(handler: MessageHandlerFn): this {
    return this.on(EventType.Message, handler);
  }

  onTx(handler: TxHandlerFn): this {
    return this.on(EventType.Tx, handler);
  }

  onError(handler: ErrorHandlerFn): this {
    return this.on(EventType.Error, handler);
  }

  onConnected(handler: ConnectionHandlerFn): this {
    return this.on(EventType.Connected, handler);
  }

  onDisconnected(handler: ConnectionHandlerFn): this {
    return this.on(EventType.Disconnected, handler);
  }

  onReconnecting(handler: ReconnectHandlerFn): this {
    return this.on(EventType.Reconnecting, handler);
  }

  onSubscriptionConfirmed(handler: MessageHandlerFn): this {
    return this.on(EventType.SubscriptionConfirmed, handler);
  }

  onFilteredTx(handler: TxHandlerFn): this {
    return this.on(EventType.FilteredTx, handler);
  }

  onWasmTx(handler: TxHandlerFn): this {
    return this.on(EventType.WasmTx, handler);
  }

  onWalletTx(handler: TxHandlerFn): this {
    return this.on(EventType.WalletTx, handler);
  }

  onStakingTx(handler: TxHandlerFn): this {
    return this.on(EventType.StakingTx, handler);
  }
}