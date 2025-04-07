// config/default.ts
export default {
  // WebSocket endpoints for different chains
  endpoints: {
    cosmos: 'wss://rpc.cosmos.network/websocket',
    osmosis: 'wss://rpc.osmosis.zone/websocket',
    sei: 'wss://sei-rpc.polkachu.com/websocket',
    juno: 'wss://rpc.juno.omniflix.co/websocket',
    terra: 'wss://terra-rpc.polkachu.com/websocket'
  },
  
  // Default connection settings
  connection: {
    maxReconnectAttempts: 5,
    reconnectDelay: 5000,
    subscriptionQuery: "tm.event='Tx'"
  },
  
  // Logging options
  logging: {
    logToConsole: true,
    excludeUnwantedEvents: true,
    debug: false
  },
  
  // Filter settings
  filters: {
    // Common event types to filter by
    eventTypes: {
      transfer: 'transfer',
      message: 'message',
      wasm: 'wasm',
      swap: 'token_swapped',
      ibc: 'send_packet',
      staking: 'delegate'
    },
    
    // Default filter paths
    filterPaths: {
      recipients: './config/recipients.json',
      senders: './config/senders.json',
      contracts: './config/contracts.json'
    }
  }
};