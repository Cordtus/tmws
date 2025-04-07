// src/transformers.ts
import { DecodedTendermintEvent, DecodedTxResult } from '../core/events.js';


export enum ChainType {
  Generic = 'generic',
  Cosmos = 'cosmos',
  Osmosis = 'osmosis',
  Sei = 'sei',
  Juno = 'juno',
  Terra = 'terra',
}

export interface ChainInfo {
  chainId: string;
  bech32Prefix: string;
  chainType: ChainType;
  denom: string;
  displayDenom?: string;
}

export interface TransformedMessageData {
  messageType: string;
  action: string;
  module: string;
  sender?: string;
  recipient?: string;
  amount?: {
    amount: string;
    denom: string;
  }[];
  contractAddress?: string;
  metadata?: Record<string, any>;
}

/**
 * Base class for chain-specific transformers
 */
export abstract class ChainTransformer {
  protected chainInfo: ChainInfo;

  constructor(chainInfo: ChainInfo) {
    this.chainInfo = chainInfo;
  }
  
  public getChainInfo(): ChainInfo {
    return this.chainInfo;
  }

  /**
   * Get structured information from decoded events
   */
  abstract transformEvents(decodedTx: DecodedTxResult): DecodedTxResult;

  /**
   * Extract messaging data from decoded events
   */
  abstract extractMessagingData(decodedTx: DecodedTxResult): TransformedMessageData[];

  /**
   * Format an amount with the appropriate denom
   */
  protected formatAmount(amount: string, denom: string): { amount: string; denom: string; displayAmount?: string } {
    // If denominator is our native token, format appropriately
    if (denom === this.chainInfo.denom && this.chainInfo.displayDenom) {
      // Many Cosmos chains use 6 decimal places
      const displayAmount = (parseInt(amount) / 1_000_000).toString();
      return {
        amount,
        denom,
        displayAmount: `${displayAmount} ${this.chainInfo.displayDenom}`
      };
    }
    
    return { amount, denom };
  }

  /**
   * Parse a Cosmos SDK action string to extract module and action name
   */
  protected parseCosmosAction(action: string): { module: string; action: string } {
    if (action.startsWith('/')) {
      const parts = action.split('.');
      if (parts.length >= 3) {
        // Format is typically: /cosmos.module.version.MsgActionName
        const module = parts[1];
        const lastPart = parts[parts.length - 1]; // The action is typically the last part
        return {
          module,
          action: lastPart
        };
      }
    }
    
    return {
      module: 'unknown',
      action: action
    };
  }
}

/**
 * Generic Tendermint chain transformer (basic functionality)
 */
export class GenericTransformer extends ChainTransformer {
  constructor(chainInfo?: Partial<ChainInfo>) {
    super({
      chainId: chainInfo?.chainId || 'generic',
      bech32Prefix: chainInfo?.bech32Prefix || 'cosmos',
      chainType: ChainType.Generic,
      denom: chainInfo?.denom || 'uatom',
      displayDenom: chainInfo?.displayDenom || 'ATOM',
    });
  }

  transformEvents(decodedTx: DecodedTxResult): DecodedTxResult {
    // Basic transformation for generic chains
    // Simply return the decoded TX as is
    return decodedTx;
  }

  extractMessagingData(decodedTx: DecodedTxResult): TransformedMessageData[] {
    const messagingData: TransformedMessageData[] = [];
    
    decodedTx.decodedEvents.forEach(event => {
      if (event.type === 'message') {
        const actions = event.attributes['action'] || [];
        
        actions.forEach(action => {
          const { module, action: actionName } = this.parseCosmosAction(action);
          
          const messageData: TransformedMessageData = {
            messageType: event.type,
            action: actionName,
            module: module,
            metadata: {}
          };
          
          // Add sender if available
          const senders = event.attributes['sender'] || [];
          if (senders.length > 0) {
            messageData.sender = senders[0];
          }
          
          // Add recipient if available
          const recipients = event.attributes['recipient'] || [];
          if (recipients.length > 0) {
            messageData.recipient = recipients[0];
          }
          
          // Add amount if available
          const amounts = event.attributes['amount'] || [];
          if (amounts.length > 0) {
            messageData.amount = amounts.map(amount => {
              // Parse amount string format (e.g., "1000uatom")
              const match = amount.match(/^(\d+)(.+)$/);
              if (match) {
                return {
                  amount: match[1],
                  denom: match[2]
                };
              }
              return { amount, denom: 'unknown' };
            });
          }
          
          // Add contract address for WASM messages
          if (action.includes('wasm')) {
            const contracts = event.attributes['contract'] || [];
            if (contracts.length > 0) {
              messageData.contractAddress = contracts[0];
            }
          }
          
          messagingData.push(messageData);
        });
      }
    });
    
    return messagingData;
  }
}

/**
 * Cosmos Hub specific transformer
 */
export class CosmosTransformer extends GenericTransformer {
  constructor(chainInfo?: Partial<ChainInfo>) {
    super({
      chainId: chainInfo?.chainId || 'cosmoshub-4',
      bech32Prefix: chainInfo?.bech32Prefix || 'cosmos',
      chainType: ChainType.Cosmos,
      denom: chainInfo?.denom || 'uatom',
      displayDenom: chainInfo?.displayDenom || 'ATOM',
      ...chainInfo
    });
  }

  // Cosmos Hub specific transformations can be added here
}

/**
 * Osmosis specific transformer
 */
export class OsmosisTransformer extends GenericTransformer {
  constructor(chainInfo?: Partial<ChainInfo>) {
    super({
      chainId: chainInfo?.chainId || 'osmosis-1',
      bech32Prefix: chainInfo?.bech32Prefix || 'osmo',
      chainType: ChainType.Osmosis,
      denom: chainInfo?.denom || 'uosmo',
      displayDenom: chainInfo?.displayDenom || 'OSMO',
      ...chainInfo
    });
  }

  // Process Osmosis specific events like swaps and LP operations
  override extractMessagingData(decodedTx: DecodedTxResult): TransformedMessageData[] {
    const genericMessages = super.extractMessagingData(decodedTx);
    const osmosisMessages: TransformedMessageData[] = [];
    
    // Process Osmosis-specific events
    decodedTx.decodedEvents.forEach(event => {
      // Handle swap events
      if (event.type === 'token_swapped') {
        const tokenIn = event.attributes['token_in'] || [];
        const tokenOut = event.attributes['token_out'] || [];
        const moduleAccount = event.attributes['module_account'] || [];
        
        if (tokenIn.length > 0 && tokenOut.length > 0) {
          osmosisMessages.push({
            messageType: 'swap',
            action: 'token_swapped',
            module: 'gamm',
            metadata: {
              tokenIn: tokenIn[0],
              tokenOut: tokenOut[0],
              moduleAccount: moduleAccount[0] || ''
            }
          });
        }
      }
      
      // Handle liquidity pool events
      if (event.type === 'pool_joined' || event.type === 'pool_exited') {
        const poolId = event.attributes['pool_id'] || [];
        
        if (poolId.length > 0) {
          osmosisMessages.push({
            messageType: event.type,
            action: event.type,
            module: 'gamm',
            metadata: {
              poolId: poolId[0],
              tokens: event.attributes['tokens'] || []
            }
          });
        }
      }
    });
    
    return [...genericMessages, ...osmosisMessages];
  }
}

/**
 * Sei specific transformer
 */
export class SeiTransformer extends GenericTransformer {
  constructor(chainInfo?: Partial<ChainInfo>) {
    super({
      chainId: chainInfo?.chainId || 'sei-chain',
      bech32Prefix: chainInfo?.bech32Prefix || 'sei',
      chainType: ChainType.Sei,
      denom: chainInfo?.denom || 'usei',
      displayDenom: chainInfo?.displayDenom || 'SEI',
      ...chainInfo
    });
  }

  // Add Sei-specific transformations here
}

/**
 * Create appropriate transformer based on chain type
 */
export function createTransformer(chainType: ChainType, chainInfo?: Partial<ChainInfo>): ChainTransformer {
  switch (chainType) {
    case ChainType.Cosmos:
      return new CosmosTransformer(chainInfo);
    case ChainType.Osmosis:
      return new OsmosisTransformer(chainInfo);
    case ChainType.Sei:
      return new SeiTransformer(chainInfo);
    case ChainType.Generic:
    default:
      return new GenericTransformer(chainInfo);
  }
}