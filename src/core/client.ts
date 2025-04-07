// src/client.ts
import WebSocket from 'ws';
import { 
  TMEventEmitter, 
  EventType, 
  TxHandlerFn, 
  ErrorHandlerFn, 
  ConnectionHandlerFn,
  ReconnectHandlerFn,
  WSMessage,
  DecodedTxResult
} from './events.js';
import { MessageParser } from './parser.js';
import { FilterManager, FilterFiles, EventFilter } from '../filters/filters.js';
import { 
  ChainTransformer, 
  ChainType, 
  createTransformer,
  ChainInfo,
  TransformedMessageData
} from '../transformers/transformers.js';
import { AdvancedFilterEngine, AdvancedFilter } from '../filters/advanced-filters.js';

export interface TendermintWSClientConfig {
  // WebSocket connection
  wsEndpoint?: string;
  subscriptionQuery?: string;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  debug?: boolean;
  
  // Basic filters
  filterFiles?: FilterFiles;
  walletAddresses?: string | string[];
  wasmContractFilter?: string | string[] | null;
  eventFilters?: EventFilter[];
  
  // Advanced filters
  advancedFilters?: AdvancedFilter[];
  
  // Chain configuration
  chainType?: ChainType;
  chainInfo?: Partial<ChainInfo>;
  
  // Event handling
  logToConsole?: boolean;
  excludeUnwantedEvents?: boolean;
}

/**
 * Tendermint WebSocket Client for capturing and filtering blockchain events
 */
class TendermintWSClient extends TMEventEmitter {
  // WebSocket connection configuration
  public wsEndpoint: string;
  public subscriptionQuery: string;
  public maxReconnectAttempts: number;
  public reconnectDelay: number;
  
  // WebSocket instance
  public ws: WebSocket | null = null;
  public reconnectAttempts: number = 0;
  public connected: boolean = false;
  
  // Filters
  public filterManager: FilterManager;
  public advancedFilterEngine: AdvancedFilterEngine;
  public filterFiles: FilterFiles;
  
  // Chain-specific transformation
  public transformer: ChainTransformer;
  
  // Configuration
  public logToConsole: boolean;
  public excludeUnwantedEvents: boolean;

  /**
   * Create a new Tendermint WebSocket client
   */
  constructor({
    // WebSocket connection options
    wsEndpoint = 'wss://sei-rpc.polkachu.com/websocket',
    subscriptionQuery = "tm.event='Tx'",
    maxReconnectAttempts = 5,
    reconnectDelay = 5000,
    
    // Basic filtering options
    filterFiles = {},
    walletAddresses = [],
    wasmContractFilter = null,
    eventFilters = [],
    
    // Advanced filtering
    advancedFilters = [],
    
    // Chain configuration
    chainType = ChainType.Generic,
    chainInfo = {},
    
    // Event handling options
    logToConsole = true,
    excludeUnwantedEvents = true,
  }: TendermintWSClientConfig = {}) {
    super();
    
    // Set connection properties
    this.wsEndpoint = wsEndpoint;
    this.subscriptionQuery = subscriptionQuery;
    this.maxReconnectAttempts = maxReconnectAttempts;
    this.reconnectDelay = reconnectDelay;
    
    // Set filter configuration
    this.filterFiles = filterFiles;
    
    // Initialize filter managers
    this.filterManager = new FilterManager({
      filterFiles,
      walletAddresses,
      wasmContractFilter,
      eventFilters,
    });
    
    this.advancedFilterEngine = new AdvancedFilterEngine(advancedFilters);
    
    // Create chain-specific transformer
    this.transformer = createTransformer(chainType, chainInfo);
    
    // Set other configuration options
    this.logToConsole = logToConsole;
    this.excludeUnwantedEvents = excludeUnwantedEvents;
    
    // Configure default logging if enabled
    if (this.logToConsole) {
      this.setupDefaultLogging();
    }
  }

  /**
   * Set up default logging for events
   */
  public setupDefaultLogging(): void {
    this.onConnected(() => console.log('Connected to WebSocket'));
    this.onDisconnected(() => console.log('Disconnected from WebSocket'));
    this.onReconnecting((attempt, max) => console.log(`Reconnecting (${attempt}/${max})...`));
    this.onSubscriptionConfirmed(msg => console.log('Subscription confirmed:', msg.result));
    this.onError(err => console.error('WebSocket error:', err.message));
    
    // Log filtered transactions
    this.onFilteredTx(tx => {
      console.log('Filtered transaction:', {
        txhash: tx.txhash,
        height: tx.height,
        matchedFilters: tx.matchedFilters
      });
    });
    
    // Log WASM transactions
    this.onWasmTx(tx => {
      console.log('WASM transaction:', {
        txhash: tx.txhash,
        height: tx.height,
        contractAddresses: tx.decodedEvents
          .filter(event => event.type === 'message' && event.attributes.action?.some(a => a.includes('wasm')))
          .flatMap(event => event.attributes.contract || [])
      });
    });
    
    // Log wallet transactions
    this.onWalletTx(tx => {
      console.log('Wallet transaction:', {
        txhash: tx.txhash,
        height: tx.height,
        walletMatches: tx.matchedFilters?.find(f => f.filterType === 'walletAddress')?.matches
      });
    });
  }

  /**
   * Connect to the WebSocket endpoint and load filters
   */
  async connect(): Promise<void> {
    try {
      // Load filters from files first
      await this.filterManager.loadFilters(this.filterFiles);
    } catch (error) {
      console.error('Failed to load filters, continuing without filters:', error);
    }
    
    return new Promise((resolve, reject) => {
      try {
        // Initialize WebSocket connection
        this.ws = new WebSocket(this.wsEndpoint);
        
        // Set up event handlers
        this.ws.on('open', () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.emit(EventType.Connected);
          this.subscribe();
          resolve();
        });
        
        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleWebSocketMessage(data);
        });
        
        this.ws.on('close', () => {
          this.connected = false;
          this.emit(EventType.Disconnected);
          this.handleReconnect();
        });
        
        this.ws.on('error', (error: Error) => {
          this.emit(EventType.Error, error);
          reject(error);
        });
      } catch (error) {
        if (error instanceof Error) {
          this.emit(EventType.Error, error);
          reject(error);
        } else {
          const wsError = new Error('Unknown WebSocket error');
          this.emit(EventType.Error, wsError);
          reject(wsError);
        }
      }
    });
  }

  /**
   * Handle WebSocket message data
   */
  public handleWebSocketMessage(data: WebSocket.Data): void {
    let message: WSMessage;
    
    try {
      message = JSON.parse(data.toString());
    } catch (err) {
      console.error('Error parsing JSON:', err);
      return;
    }
    
    // Emit the raw message first
    this.emit(EventType.Message, message);
    
    // Skip unwanted events if configured
    if (this.excludeUnwantedEvents && MessageParser.containsUnwantedEvents(message)) {
      return;
    }
    
    // Check if this is a subscription confirmation
    if (MessageParser.isSubscriptionConfirmation(message)) {
      this.emit(EventType.SubscriptionConfirmed, message);
      return;
    }
    
    // Process transaction events
    const decodedTx = MessageParser.processTxMessage(message);
    if (!decodedTx) return;
    
    // Apply chain-specific transformations
    const transformedTx = this.transformer.transformEvents(decodedTx);
    
    // Emit the transaction event
    this.emit(EventType.Tx, transformedTx);
    
    // Apply basic filters
    const { passed, matchedFilters } = this.filterManager.applyFilters(transformedTx);
    
    // Apply advanced filters if basic filters pass
    if (passed) {
      const advancedFilterResult = this.advancedFilterEngine.applyFilters(transformedTx);
      
      // Add matched filters to the transaction data
      const finalTx: DecodedTxResult = {
        ...transformedTx,
        matchedFilters
      };
      
      // Emit filtered transaction event
      this.emit(EventType.FilteredTx, finalTx);
      
      // Emit specialized events based on matched filter types
      if (matchedFilters.some(f => f.filterType === 'wasmContract')) {
        this.emit(EventType.WasmTx, finalTx);
      }
      
      if (matchedFilters.some(f => f.filterType === 'walletAddress')) {
        this.emit(EventType.WalletTx, finalTx);
      }
      
      // Detect and emit staking transactions
      const hasStakingOp = transformedTx.decodedEvents.some(event => 
        event.type === 'message' && 
        event.attributes.action?.some(action => 
          action.includes('cosmos.staking') || 
          action.includes('cosmos.distribution')
        )
      );
      
      if (hasStakingOp) {
        this.emit(EventType.StakingTx, finalTx);
      }
    }
  }

  /**
   * Handle reconnection logic
   */
  public handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.emit(EventType.Reconnecting, this.reconnectAttempts, this.maxReconnectAttempts);
      
      setTimeout(() => {
        this.connect().catch((err) => {
          this.emit(EventType.Error, err instanceof Error ? err : new Error(String(err)));
        });
      }, this.reconnectDelay);
    } else {
      console.error('Max reconnect attempts reached. Connection closed.');
    }
  }

  /**
   * Send subscription request to the WebSocket
   */
  public subscribe(): void {
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
  }

  public decodeBase64(str: string): string {
    return MessageParser.decodeBase64(str);
  }
  
  public filterUnwanted(message: any): boolean {
    return !MessageParser.containsUnwantedEvents(message);
  }

  /**
   * Get chain info
   */
  getChainInfo(): ChainInfo {
    return this.transformer.getChainInfo();
  }

  /**
   * Add an advanced filter
   */
  addFilter(filter: AdvancedFilter): void {
    this.advancedFilterEngine.addFilter(filter);
  }

  /**
   * Process messaging data from a transaction
   */
  parseMessagingData(tx: DecodedTxResult): TransformedMessageData[] {
    return this.transformer.extractMessagingData(tx);
  }

  /**
   * Disconnect from the WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
    }
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  // Event handler typed methods (for improved developer experience)
  onTx(handler: TxHandlerFn): this {
    return super.onTx(handler);
  }

  onFilteredTx(handler: TxHandlerFn): this {
    return super.onFilteredTx(handler);
  }

  onWasmTx(handler: TxHandlerFn): this {
    return super.onWasmTx(handler);
  }

  onWalletTx(handler: TxHandlerFn): this {
    return super.onWalletTx(handler);
  }

  onStakingTx(handler: TxHandlerFn): this {
    return super.onStakingTx(handler);
  }

  onError(handler: ErrorHandlerFn): this {
    return super.onError(handler);
  }

  onConnected(handler: ConnectionHandlerFn): this {
    return super.onConnected(handler);
  }

  onDisconnected(handler: ConnectionHandlerFn): this {
    return super.onDisconnected(handler);
  }

  onReconnecting(handler: ReconnectHandlerFn): this {
    return super.onReconnecting(handler);
  }
}

export default TendermintWSClient;