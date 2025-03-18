import TendermintWSClient from '../src/index.js';

// Create a sample configuration for the client
const client = new TendermintWSClient({
  // WebSocket endpoint for the Tendermint RPC
  wsEndpoint: 'wss://sei-rpc.polkachu.com/websocket',
  
  // Subscription query filter
  subscriptionQuery: "tm.event='Tx'",
  
  // WASM contract filtering - can be a single address or an array of addresses
  wasmContractFilter: [
    // 'sei14v72w8sdjh438uwunzdkc6pfp8xr5kxpxvwqjv',
    // 'sei1vg5lv9pwr4jxd8zs2v99hxtef797xz9ge3qmqm'
  ],
  
  // Load filters from JSON files (path is relative to project root)
  // Each file should contain an array of addresses to filter by
  filterFiles: { 
    // recipient: './config/recipients.json',
    // sender: './config/senders.json'
  },
  
  // Wallet addresses to monitor (can be a single address or an array)
  walletAddresses: [
    'sei1wev8ptzj27aueu04wgvvl4gvurax6rj5yrag90',
    // 'sei1z3t55m0l9h6wx7fv9j2wkchvfewnf74dcp5toz'
  ],
  
  // Custom event filters - filter by event type and attributes
  eventFilters: [
    // Example: Match all 'transfer' events with a specific recipient
    // {
    //   type: 'transfer',
    //   attributes: {
    //     recipient: 'sei1wev8ptzj27aueu04wgvvl4gvurax6rj5yrag90'
    //   }
    // },
    // Example: Match all 'message' events with a delegate action
    // {
    //   type: 'message',
    //   attributes: {
    //     action: '/cosmos.staking.v1beta1.MsgDelegate'
    //   }
    // }
  ],
  
  // Reconnection settings
  maxReconnectAttempts: 5,
  reconnectDelay: 5000,
});

// Connect to the WebSocket
console.log('Connecting to Tendermint WebSocket...');
client.connect()
  .then(() => {
    console.log('Successfully connected and subscribed!');
  })
  .catch(error => {
    console.error('Connection error:', error);
    process.exit(1);
  });

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  client.disconnect();
  process.exit(0);
});

// Keep the process running
console.log('Client running. Press Ctrl+C to stop.');