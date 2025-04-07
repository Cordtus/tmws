// src/core/parser.ts
import {
  TendermintEvent,
  DecodedTendermintEvent,
  TxResult,
  DecodedTxResult,
  TransferData,
  WSMessage,
  SwapTransactionDetails,
  StakingTransactionDetails,
  IBCTransferDetails,
  EnhancedDecodedTxResult,
  EventType
} from './events.js';

export class MessageParser {
  /**
   * Decode a base64 encoded string
   */
  static decodeBase64(str: string): string {
    try {
      return Buffer.from(str, 'base64').toString('utf-8');
    } catch (error) {
      console.error('Error decoding base64:', error);
      return str; // Return original if decoding fails
    }
  }

  static decodeCosmosAddress(key: string, value: string): string {
    // If key suggests this is an address (common in Cosmos transactions)
    const addressKeys = ['sender', 'recipient', 'receiver', 'delegator', 'validator'];
    
    if (addressKeys.includes(key) && value.includes('osmo1')) {
      return value; // Already decoded
    }
    
    // For bech32 addresses (like osmo1...), don't decode even if they look like base64
    if (/^osmo1[a-zA-Z0-9]{38,58}$/.test(value)) {
      return value;
    }
    
    try {
      // Check if it's base64
      if (this.isBase64(value)) {
        const decoded = Buffer.from(value, 'base64').toString('utf-8');
        
        // If decoded looks like an address, return it
        if (/^osmo1[a-zA-Z0-9]{38,58}$/.test(decoded)) {
          return decoded;
        }
      }
      
      return value;
    } catch {
      return value;
    }
  }

  /**
   * Extract TxResult from a WebSocket message
   */
  static extractTxResult(message: WSMessage): TxResult | null {
    if (message.result?.data?.value?.TxResult) {
      const txResult = message.result.data.value.TxResult;
      
      // Try to find the hash in various possible locations
      let txhash = undefined;
      
      // Check in the direct TxResult object
      if (txResult.hash) {
        txhash = txResult.hash;
      } 
      // Check in the parent data value
      else if (message.result.data.value.hash) {
        txhash = message.result.data.value.hash;
      } 
      // Check in tx_result if it exists
      else if (txResult.tx_result && txResult.tx_result.hash) {
        txhash = txResult.tx_result.hash;
      } 
      // Check in events if they exist at the root level
      else if (message.events && message.events['tx.hash'] && message.events['tx.hash'].length > 0) {
        txhash = message.events['tx.hash'][0];
      }
      // Check for events in the result
      else if (message.result.events && message.result.events['tx.hash'] && message.result.events['tx.hash'].length > 0) {
        txhash = message.result.events['tx.hash'][0];
      }
      // If still no hash and we have tx data, log it
      else if (txResult.tx) {
        // Sometimes the hash is derived from the tx itself
        const tx = txResult.tx;
        if (typeof tx === 'string') {
          // If tx is a base64 string, we could hash it, but that's complex
          console.log('Found tx data but couldn\'t extract hash');
        }
      }
      
      // Get events, which might be in different places depending on chain
      let events = txResult.result?.events || txResult.tx_result?.events || [];
      
      // If no events found in the TxResult structure, check if they exist at the root level
      if (events.length === 0 && message.events) {
        // We need to convert the flat events format to the array of event objects format
        events = this.convertFlatEventsToEventObjects(message.events);
      }
      
      // Also check for events in message.result.events
      if (events.length === 0 && message.result.events) {
        events = this.convertFlatEventsToEventObjects(message.result.events);
      }
      
      return {
        height: txResult.height,
        txhash: txhash,
        events: events,
        gasWanted: txResult.result?.gas_wanted || txResult.tx_result?.gas_wanted || '0',
        gasUsed: txResult.result?.gas_used || txResult.tx_result?.gas_used || '0',
      };
    }
    return null;
  }

  /**
   * Convert flat events object to array of TendermintEvent objects
   * This handles the case where events are in the format:
   * { "event.key": ["value1", "value2"], "event.key2": ["value3"] }
   */
  static convertFlatEventsToEventObjects(flatEvents: Record<string, string[]>): TendermintEvent[] {
    const eventTypes = new Set<string>();
    
    // Extract event types from event keys (e.g., "transfer.amount" -> "transfer")
    Object.keys(flatEvents).forEach(key => {
      const parts = key.split('.');
      if (parts.length > 1) {
        eventTypes.add(parts[0]);
      }
    });
    
    // Create event objects for each event type
    const events: TendermintEvent[] = [];
    
    eventTypes.forEach(eventType => {
      const attributes: Array<{key: string; value: string; index?: boolean}> = [];
      
      // Find all attributes for this event type
      Object.entries(flatEvents).forEach(([key, values]) => {
        if (key.startsWith(`${eventType}.`)) {
          const attributeKey = key.substring(eventType.length + 1);
          
          // Each value gets its own attribute entry
          values.forEach(value => {
            attributes.push({
              key: attributeKey,
              value: value,
              index: true // Assume all are indexed since we can't determine from this format
            });
          });
        }
      });
      
      if (attributes.length > 0) {
        events.push({
          type: eventType,
          attributes: attributes
        });
      }
    });
    
    return events;
  }

  /**
   * Decode all attributes in Tendermint events
   */
  static decodeEvents(events: TendermintEvent[]): DecodedTendermintEvent[] {
    return events.map(event => {
      const decodedAttributes: Record<string, string[]> = {};
      const rawAttributes = event.attributes.map(attr => {
        // Check if key and value need decoding (might be pre-decoded in some formats)
        const keyIsBase64 = this.isBase64(attr.key);
        const valueIsBase64 = this.isBase64(attr.value);
        
        const decodedKey = keyIsBase64 ? this.decodeBase64(attr.key) : attr.key;
        
        // Special handling for addresses
        let decodedValue: string;
        if (valueIsBase64) {
          decodedValue = this.decodeBase64(attr.value);
          
          // Special check for address fields
          if (decodedKey === 'sender' || decodedKey === 'recipient' || 
              decodedKey === 'delegator' || decodedKey === 'validator') {
            decodedValue = this.decodeCosmosAddress(decodedKey, attr.value);
          }
        } else {
          decodedValue = attr.value;
        }
        
        // Group decoded attributes by key
        if (!decodedAttributes[decodedKey]) {
          decodedAttributes[decodedKey] = [];
        }
        decodedAttributes[decodedKey].push(decodedValue);
        
        return {
          ...attr,
          decodedKey,
          decodedValue
        };
      });
  
      return {
        type: event.type,
        attributes: decodedAttributes,
        rawAttributes
      };
    });
  }

  /**
   * Check if a string is likely Base64 encoded
   */
  static isBase64(str: string): boolean {
    // If the string is empty, it's not base64
    if (!str || str.length === 0) {
      return false;
    }
  
    // Quick check - if it contains characters outside of Base64 set, it's not Base64
    if (!/^[A-Za-z0-9+/=]+$/.test(str)) {
      return false;
    }
    
    // If it's very short, check if it looks like a simple string
    if (str.length < 10 && /^[a-zA-Z0-9_]+$/.test(str)) {
      return false;
    }
    
    try {
      // Try to decode and see if it's valid UTF-8
      const decoded = Buffer.from(str, 'base64').toString('utf-8');
      
      // Check if the decoded data contains unprintable characters
      // If it does, it's likely binary data, not a string that should be decoded
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(decoded)) {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract transfer data from decoded events
   */
  static extractTransferData(events: DecodedTendermintEvent[]): {
    senders: string[];
    receivers: string[];
    recipients: string[];
    spenders: string[];
    amounts: string[];
  } {
    const transferData: TransferData = {
      senders: new Set<string>(),
      receivers: new Set<string>(),
      recipients: new Set<string>(),
      spenders: new Set<string>(),
      amounts: new Set<string>()
    };

    events.forEach(event => {
      // Check for sender, receiver, recipient, spender, amount in attributes
      ['sender', 'receiver', 'recipient', 'spender', 'amount'].forEach(key => {
        if (event.attributes[key]) {
          event.attributes[key].forEach(value => {
            transferData[key === 'amount' ? 'amounts' : `${key}s`].add(value);
          });
        }
      });
    });

    return {
      senders: Array.from(transferData.senders),
      receivers: Array.from(transferData.receivers),
      recipients: Array.from(transferData.recipients),
      spenders: Array.from(transferData.spenders),
      amounts: Array.from(transferData.amounts)
    };
  }

  /**
   * Extract swap details from decoded events
   */
  static extractSwapDetails(events: DecodedTendermintEvent[]): SwapTransactionDetails[] {
    const swapDetails: SwapTransactionDetails[] = [];
    
    // Find token_swapped events
    events.forEach(event => {
      if (event.type === 'token_swapped') {
        const poolId = event.attributes['pool_id']?.[0];
        const tokenIn = event.attributes['tokens_in']?.[0];
        const tokenOut = event.attributes['tokens_out']?.[0];
        const sender = event.attributes['sender']?.[0];
        
        if (poolId && tokenIn && tokenOut) {
          const amountIn = tokenIn.replace(/[a-zA-Z\/]/g, '');
          const amountOut = tokenOut.replace(/[a-zA-Z\/]/g, '');
          
          swapDetails.push({
            poolId,
            tokenIn,
            tokenOut,
            amountIn: amountIn || tokenIn,
            amountOut: amountOut || tokenOut,
            sender: sender || ''
          });
        }
      }
    });
    
    return swapDetails;
  }

  /**
   * Extract staking details from decoded events
   */
  static extractStakingDetails(events: DecodedTendermintEvent[]): StakingTransactionDetails[] {
    const stakingDetails: StakingTransactionDetails[] = [];
    
    // Find withdraw_rewards events
    events.forEach(event => {
      if (event.type === 'withdraw_rewards') {
        const delegator = event.attributes['delegator']?.[0];
        const validator = event.attributes['validator']?.[0];
        const amount = event.attributes['amount']?.[0];
        
        if (delegator && validator) {
          // Parse amount to extract denom
          let amountValue = '';
          let denomValue = '';
          
          if (amount) {
            const match = amount.match(/^([0-9]+)(.+)$/);
            if (match) {
              amountValue = match[1];
              denomValue = match[2];
            } else {
              amountValue = amount;
            }
          }
          
          stakingDetails.push({
            action: 'withdraw_rewards',
            delegator,
            validator,
            amount: amountValue,
            denom: denomValue
          });
        }
      } else if (event.type === 'delegate' || event.attributes['action']?.some(a => a.includes('MsgDelegate'))) {
        // Handle delegate events
        const delegator = event.attributes['delegator']?.[0] || 
                         event.attributes['sender']?.[0];
        const validator = event.attributes['validator']?.[0];
        const amount = event.attributes['amount']?.[0];
        
        if (delegator && validator) {
          // Parse amount to extract denom
          let amountValue = '';
          let denomValue = '';
          
          if (amount) {
            const match = amount.match(/^([0-9]+)(.+)$/);
            if (match) {
              amountValue = match[1];
              denomValue = match[2];
            } else {
              amountValue = amount;
            }
          }
          
          stakingDetails.push({
            action: 'delegate',
            delegator,
            validator,
            amount: amountValue,
            denom: denomValue
          });
        }
      } else if (event.type === 'unbond' || event.attributes['action']?.some(a => a.includes('MsgUndelegate'))) {
        // Handle undelegate events
        const delegator = event.attributes['delegator']?.[0] || 
                         event.attributes['sender']?.[0];
        const validator = event.attributes['validator']?.[0];
        const amount = event.attributes['amount']?.[0];
        
        if (delegator && validator) {
          // Parse amount to extract denom
          let amountValue = '';
          let denomValue = '';
          
          if (amount) {
            const match = amount.match(/^([0-9]+)(.+)$/);
            if (match) {
              amountValue = match[1];
              denomValue = match[2];
            } else {
              amountValue = amount;
            }
          }
          
          stakingDetails.push({
            action: 'undelegate',
            delegator,
            validator,
            amount: amountValue,
            denom: denomValue
          });
        }
      } else if (event.type === 'redelegate' || event.attributes['action']?.some(a => a.includes('MsgBeginRedelegate'))) {
        // Handle redelegate events
        const delegator = event.attributes['delegator']?.[0] || 
                          event.attributes['sender']?.[0];
        const sourceValidator = event.attributes['source_validator']?.[0];
        const destinationValidator = event.attributes['destination_validator']?.[0];
        const amount = event.attributes['amount']?.[0];
        
        if (delegator && (sourceValidator || destinationValidator)) {
          // Parse amount to extract denom
          let amountValue = '';
          let denomValue = '';
          
          if (amount) {
            const match = amount.match(/^([0-9]+)(.+)$/);
            if (match) {
              amountValue = match[1];
              denomValue = match[2];
            } else {
              amountValue = amount;
            }
          }
          
          stakingDetails.push({
            action: 'redelegate',
            delegator,
            validator: destinationValidator || sourceValidator,
            amount: amountValue,
            denom: denomValue,
            sourceValidator,
            destinationValidator
          });
        }
      }
    });
    
    return stakingDetails;
  }

  /**
   * Extract IBC transfer details from decoded events
   */
  static extractIBCDetails(events: DecodedTendermintEvent[]): IBCTransferDetails[] {
    const ibcDetails: IBCTransferDetails[] = [];
    
    // Find send_packet events for IBC transfers
    events.forEach(event => {
      if (event.type === 'send_packet') {
        const sourcePort = event.attributes['packet_src_port']?.[0];
        const sourceChannel = event.attributes['packet_src_channel']?.[0];
        const destPort = event.attributes['packet_dst_port']?.[0];
        const destChannel = event.attributes['packet_dst_channel']?.[0];
        
        // Check for transfer events in the same transaction
        const transferEvents = events.filter(e => e.type === 'transfer');
        if (transferEvents.length > 0 && sourcePort === 'transfer') {
          transferEvents.forEach(te => {
            const sender = te.attributes['sender']?.[0];
            const receiver = te.attributes['recipient']?.[0];
            const amount = te.attributes['amount']?.[0];
            
            if (sender && receiver && amount && sourceChannel) {
              // Parse amount string to extract amount and denom
              const amountMatch = amount.match(/^([0-9]+)(.+)$/);
              if (amountMatch) {
                ibcDetails.push({
                  sender,
                  receiver,
                  sourceChannel,
                  sourcePort,
                  destChannel,
                  destPort,
                  amount: amountMatch[1],
                  denom: amountMatch[2]
                });
              } else {
                // If amount format is different, still add the entry with full amount string
                ibcDetails.push({
                  sender,
                  receiver,
                  sourceChannel,
                  sourcePort,
                  destChannel,
                  destPort,
                  amount,
                  denom: ''
                });
              }
            }
          });
        }
      }
    });
    
    return ibcDetails;
  }

  /**
   * Process a transaction message into a decoded result
   */
  static processTxMessage(message: WSMessage): DecodedTxResult | null {
    const txResult = this.extractTxResult(message);
    if (!txResult) return null;
  
    const decodedEvents = this.decodeEvents(txResult.events);
    const transferData = this.extractTransferData(decodedEvents);
  
    return {
      ...txResult,
      events: decodedEvents,
      decodedEvents,
      transferData
    };
  }

  /**
   * Process a transaction message into an enhanced decoded result with specific transaction details
   */
  static processEnhancedTxMessage(message: WSMessage): EnhancedDecodedTxResult | null {
    const baseTx = this.processTxMessage(message);
    if (!baseTx) return null;

    const swapDetails = this.extractSwapDetails(baseTx.decodedEvents);
    const stakingDetails = this.extractStakingDetails(baseTx.decodedEvents);
    const ibcDetails = this.extractIBCDetails(baseTx.decodedEvents);
    
    // Determine the main transaction type
    let txType = undefined;
    
    // Check message action events first
    const messageEvents = baseTx.decodedEvents.filter(e => e.type === 'message');
    if (messageEvents.length > 0) {
      const actions = messageEvents.flatMap(e => e.attributes['action'] || []);
      
      if (actions.some(a => a.includes('MsgSwapExactAmountIn') || a.includes('MsgSwap'))) {
        txType = EventType.Swap;
      } else if (actions.some(a => a.includes('MsgDelegate'))) {
        txType = EventType.Delegate;
      } else if (actions.some(a => a.includes('MsgUndelegate'))) {
        txType = EventType.Undelegate;
      } else if (actions.some(a => a.includes('MsgBeginRedelegate'))) {
        txType = EventType.Redelegate;
      } else if (actions.some(a => a.includes('MsgWithdrawDelegatorReward'))) {
        txType = EventType.WithdrawRewards;
      } else if (actions.some(a => a.includes('MsgVote'))) {
        txType = EventType.GovernanceVote;
      } else if (actions.some(a => a.includes('MsgDeposit'))) {
        txType = EventType.ProposalDeposit;
      }
    }
    
    // If no type determined from message actions, check specific events
    if (!txType) {
      if (swapDetails.length > 0) {
        txType = EventType.Swap;
      } else if (stakingDetails.length > 0) {
        if (stakingDetails[0].action === 'withdraw_rewards') {
          txType = EventType.WithdrawRewards;
        } else if (stakingDetails[0].action === 'delegate') {
          txType = EventType.Delegate;
        } else if (stakingDetails[0].action === 'undelegate') {
          txType = EventType.Undelegate;
        } else if (stakingDetails[0].action === 'redelegate') {
          txType = EventType.Redelegate;
        }
      } else if (ibcDetails.length > 0) {
        txType = EventType.IBCTransfer;
      } else if (baseTx.decodedEvents.some(e => e.type === 'transfer')) {
        txType = EventType.Transfer;
      } else if (baseTx.decodedEvents.some(e => e.type === 'withdraw_position')) {
        txType = EventType.Withdraw;
      }
    }
    
    return {
      ...baseTx,
      swapDetails,
      stakingDetails,
      ibcDetails,
      txType
    };
  }

  /**
   * Check if a message is a subscription confirmation
   */
  static isSubscriptionConfirmation(message: WSMessage): boolean {
    return message.id !== undefined && 
           message.result !== undefined && 
           !message.result.data && 
           !message.result.events;
  }

  /**
   * Check if message contains unwanted events (like oracle aggregate_vote)
   */
  static containsUnwantedEvents(message: WSMessage): boolean {
    // Check in result.events
    if (message.result?.events && 
        message.result.events['aggregate_vote.exchange_rates']) {
      return true;
    }
    
    // Check in root events
    if (message.events && 
        message.events['aggregate_vote.exchange_rates']) {
      return true;
    }
    
    return false;
  }
}