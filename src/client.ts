import WebSocket from 'ws';
import { promises as fs } from 'fs';
import path from 'path';

interface FilterFiles {
  [key: string]: string;
}

interface TransferData {
  senders: Set<string>;
  receivers: Set<string>;
  recipients: Set<string>;
  spenders: Set<string>;
  amounts: Set<string>;
  [key: string]: Set<string>; // Index signature to allow dynamic access
}

export interface TendermintWSClientConfig {
  wsEndpoint?: string;
  subscriptionQuery?: string;
  filterFiles?: FilterFiles;
  // Optional wallet address for monitoring (can be an array for multiple wallets)
  walletAddresses?: string | string[];
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  // If provided, only process WASM messages matching this contract address (can be an array)
  wasmContractFilter?: string | string[] | null;
  // Custom event filters
  eventFilters?: {
    type?: string | string[];
    attributes?: {[key: string]: string | string[]};
  }[];
}

class TendermintWSClient {
  wsEndpoint: string;
  subscriptionQuery: string;
  filterFiles: FilterFiles;
  walletAddresses: string[];
  maxReconnectAttempts: number;
  reconnectDelay: number;
  wasmContractFilter: string[] | null;
  eventFilters: {
    type?: string | string[];
    attributes?: {[key: string]: string | string[]};
  }[];

  ws: WebSocket | null;
  filters: { [key: string]: string[] };
  reconnectAttempts: number;

  constructor({
    wsEndpoint = 'wss://sei-rpc.polkachu.com/websocket',
    subscriptionQuery = "tm.event='Tx'",
    filterFiles = {},
    walletAddresses = [],
    maxReconnectAttempts = 5,
    reconnectDelay = 5000,
    wasmContractFilter = null,
    eventFilters = [],
  }: TendermintWSClientConfig = {}) {
    this.wsEndpoint = wsEndpoint;
    this.subscriptionQuery = subscriptionQuery;
    this.filterFiles = filterFiles;
    
    // Convert walletAddresses to array if string is provided
    this.walletAddresses = typeof walletAddresses === 'string' 
      ? [walletAddresses] 
      : Array.isArray(walletAddresses) ? walletAddresses : [];
    
    this.maxReconnectAttempts = maxReconnectAttempts;
    this.reconnectDelay = reconnectDelay;
    
    // Convert wasmContractFilter to array if string is provided
    this.wasmContractFilter = wasmContractFilter === null 
      ? null 
      : typeof wasmContractFilter === 'string' 
        ? [wasmContractFilter] 
        : Array.isArray(wasmContractFilter) ? wasmContractFilter : null;
    
    this.eventFilters = eventFilters;

    this.ws = null;
    this.filters = {};
    this.reconnectAttempts = 0;
  }

  async loadFilters(): Promise<void> {
    try {
      for (const [key, filePath] of Object.entries(this.filterFiles)) {
        try {
          // Read the file from the filesystem
          const fileContent = await fs.readFile(path.resolve(process.cwd(), filePath), 'utf-8');
          const filterValues = JSON.parse(fileContent);
          
          if (Array.isArray(filterValues)) {
            // Simply use the address values as provided.
            this.filters[key] = filterValues;
          } else {
            throw new Error(`Filter file ${filePath} must contain an array`);
          }
        } catch (error) {
          console.error(`Error loading filter file ${filePath}:`, error);
          throw error;
        }
      }
    } catch (error) {
      console.error('Error loading filters:', error);
      throw error;
    }
  }

  async connect(): Promise<void> {
    try {
      await this.loadFilters();
    } catch (error) {
      console.error('Failed to load filters, continuing without filters:', error);
    }
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsEndpoint);
        
        this.ws.on('open', () => {
          console.log('Connected to WebSocket');
          this.subscribe();
          this.reconnectAttempts = 0;
          resolve();
        });
        
        this.ws.on('message', (data: WebSocket.Data) => {
          let message;
          try {
            message = JSON.parse(data.toString());
          } catch (err) {
            console.error('Error parsing JSON:', err);
            return;
          }
          this.handleMessage(message);
        });
        
        this.ws.on('close', () => this.handleReconnect());
        
        this.ws.on('error', (error: Error) => {
          console.error('WebSocket error:', error.message);
          reject(error);
        });
      } catch (error) {
        console.error('Error initializing WebSocket connection:', error);
        reject(error);
      }
    });
  }

  handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(() => {
        this.connect().catch((err) => {
          console.error('Reconnect failed:', err);
        });
      }, this.reconnectDelay);
    } else {
      console.error('Max reconnect attempts reached. Connection closed.');
    }
  }

  subscribe(): void {
    if (!this.ws) {
      console.error('Cannot subscribe: WebSocket is not initialized');
      return;
    }
    
    const subscribeMsg = {
      jsonrpc: '2.0',
      method: 'subscribe',
      id: Date.now(),
      params: [this.subscriptionQuery]
    };
    
    this.ws.send(JSON.stringify(subscribeMsg));
    console.log('Subscription sent:', subscribeMsg);
  }

  decodeBase64(str: string): string {
    try {
      return Buffer.from(str, 'base64').toString('utf-8');
    } catch (error) {
      console.error('Error decoding base64:', error);
      return str; // Return original if decoding fails
    }
  }

  // Returns false if the message includes unwanted events (e.g. aggregate_vote.exchange_rates)
  filterUnwanted(message: any): boolean {
    if (message.id && message.result) {
      if (message.result.events && message.result.events['aggregate_vote.exchange_rates']) {
        return false;
      }
    }
    return true;
  }

  getEventsFromMessage(message: any): any[] | null {
    if (
      message.result &&
      message.result.data &&
      message.result.data.value &&
      message.result.data.value.TxResult &&
      message.result.data.value.TxResult.result &&
      message.result.data.value.TxResult.result.events
    ) {
      return message.result.data.value.TxResult.result.events;
    }
    return null;
  }

  extractTransferData(events: any[]): {
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
      if (!event.attributes) return;
      
      event.attributes.forEach((attr: any) => {
        const key = this.decodeBase64(attr.key);
        const value = this.decodeBase64(attr.value);
        
        switch (key) {
          case 'sender':
            transferData.senders.add(value);
            break;
          case 'receiver':
            transferData.receivers.add(value);
            break;
          case 'recipient':
            transferData.recipients.add(value);
            break;
          case 'spender':
            transferData.spenders.add(value);
            break;
          case 'amount':
            transferData.amounts.add(value);
            break;
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

  matchesFilters(events: any[]): boolean {
    if (!this.filters || Object.keys(this.filters).length === 0) return true;
    
    return events.some(event => {
      if (!event.attributes) return false;
      
      return event.attributes.some((attr: any) => {
        const key = this.decodeBase64(attr.key);
        const value = this.decodeBase64(attr.value);
        
        return Object.entries(this.filters).some(([filterKey, filterValues]) => {
          return (key === filterKey || (key === 'receiver' && filterKey === 'recipient')) &&
                 filterValues.includes(value);
        });
      });
    });
  }

  handleMessage(message: any): void {
    if (!this.filterUnwanted(message)) return;
    
    if (message.id && message.result && !message.result.events) {
      console.log('Subscription confirmation received:', message.result);
      return;
    }
    
    const events = this.getEventsFromMessage(message);
    if (!events) {
      // This is often just a subscription confirmation or other non-event message
      // So we don't need to log this as an error in most cases
      return;
    }

    // Apply multiple different filter types
    let shouldProcess = true;
    
    // 1. Check WASM contract filter if provided
    if (this.wasmContractFilter) {
      const matchingWasmEvents = events.filter(event => {
        if (event.type === 'message') {
          const actionAttr = event.attributes?.find((attr: any) => 
            this.decodeBase64(attr.key) === 'action'
          );
          
          if (actionAttr && this.decodeBase64(actionAttr.value).includes('wasm')) {
            const contractAttr = event.attributes?.find((attr: any) => 
              this.decodeBase64(attr.key) === 'contract'
            );
            
            if (contractAttr) {
              const contractValue = this.decodeBase64(contractAttr.value);
              return this.wasmContractFilter!.includes(contractValue);
            }
          }
        }
        return false;
      });
      
      if (matchingWasmEvents.length > 0) {
        console.log(`Found ${matchingWasmEvents.length} WASM events matching contract filter`);
        matchingWasmEvents.forEach(event => {
          console.log('WASM message with matching contract:', event);
        });
      } else {
        // No matching WASM contract events
        shouldProcess = false;
      }
    }
    
    // 2. Check custom attribute filters from filter files
    if (shouldProcess && Object.keys(this.filters).length > 0) {
      if (!this.matchesFilters(events)) {
        shouldProcess = false;
      }
    }
    
    // 3. Check custom event filters
    if (shouldProcess && this.eventFilters.length > 0) {
      const matchesEventFilter = events.some(event => {
        return this.eventFilters.some(filter => {
          // Check event type
          if (filter.type) {
            const types = Array.isArray(filter.type) ? filter.type : [filter.type];
            if (!types.includes(event.type)) {
              return false;
            }
          }
          
          // Check event attributes
          if (filter.attributes && event.attributes) {
            return Object.entries(filter.attributes).some(([attrKey, attrValues]) => {
              const attrValuesList = Array.isArray(attrValues) ? attrValues : [attrValues];
              
              return event.attributes.some((attr: any) => {
                const key = this.decodeBase64(attr.key);
                const value = this.decodeBase64(attr.value);
                return key === attrKey && attrValuesList.includes(value);
              });
            });
          }
          
          // If we only checked for type and no attributes were specified, it's a match
          return filter.attributes ? false : true;
        });
      });
      
      if (!matchesEventFilter) {
        shouldProcess = false;
      }
    }
    
    // Skip further processing if none of the filters matched
    if (!shouldProcess) {
      return;
    }

    const transferData = this.extractTransferData(events);
    console.log('Transfer Data:', transferData);

    // Additional processing for specific message actions and wallet matching.
    if (this.walletAddresses.length > 0) {
      const walletMatches: { action: string; role: string; address: string; }[] = [];
      
      events.forEach(event => {
        if (event.type === 'message') {
          const actionAttr = event.attributes?.find((attr: any) => 
            this.decodeBase64(attr.key) === 'action'
          );
          
          if (!actionAttr) return;
          
          const action = this.decodeBase64(actionAttr.value);
          
          // Monitor all cosmos staking and distribution messages
          if (action.startsWith('/cosmos.staking.') || action.startsWith('/cosmos.distribution.')) {
            console.log(`Action: ${action}`);
            
            // Check for wallet addresses in any attribute
            event.attributes?.forEach((attr: any) => {
              const key = this.decodeBase64(attr.key);
              const value = this.decodeBase64(attr.value);
              
              // Check if any of our watched wallet addresses is involved
              const matchingWallet = this.walletAddresses.find(address => value === address);
              
              if (matchingWallet && ['sender', 'recipient', 'delegator', 'validator', 'spender'].includes(key)) {
                walletMatches.push({
                  action,
                  role: key,
                  address: matchingWallet
                });
              }
            });
          }
        }
      });
      
      if (walletMatches.length > 0) {
        console.log(`Wallet Address Matched ${walletMatches.length} times:`, walletMatches);
      }
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      console.log('WebSocket connection closed.');
    }
  }
}

export default TendermintWSClient;