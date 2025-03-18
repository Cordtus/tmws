import TendermintWSClient from '../src/index.js';
/**
 * This example shows how to use the TMWS client to monitor different types
 * of blockchain events with various filtering options.
 */
// Create a client with multiple filtering options
const client = new TendermintWSClient({
    // Connect to Osmosis instead of Sei as an example
    wsEndpoint: 'wss://rpc.osmosis.zone/websocket',
    // Subscribe to tx events (you can also use other event types)
    subscriptionQuery: "tm.event='Tx'",
    // Monitor multiple wallet addresses
    walletAddresses: [
        'osmo1abcdef123456789abcdef123456789abcdef12',
        'osmo1fedcba987654321fedcba987654321fedcba98'
    ],
    // Monitor specific WASM contracts
    wasmContractFilter: [
        'osmo14v72w8sdjh438uwunzdkc6pfp8xr5kxpxvwqjv' // Example WASM contract address
    ],
    // Use various event filters
    eventFilters: [
        // Filter 1: Monitor IBC transfers
        {
            type: 'send_packet',
            attributes: {
                packet_src_port: 'transfer'
            }
        },
        // Filter 2: Monitor specific token swaps
        {
            type: 'token_swapped',
            attributes: {
                // You can use arrays to monitor multiple tokens
                token_in: [
                    'uosmo',
                    'ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2' // ATOM token on Osmosis
                ]
            }
        },
        // Filter 3: Monitor staking operations
        {
            type: 'message',
            attributes: {
                action: [
                    '/cosmos.staking.v1beta1.MsgDelegate',
                    '/cosmos.staking.v1beta1.MsgUndelegate',
                    '/cosmos.staking.v1beta1.MsgBeginRedelegate'
                ]
            }
        }
    ],
    // Add resilience with reconnection settings
    maxReconnectAttempts: 10,
    reconnectDelay: 3000,
});
// Connect to the WebSocket
console.log('Connecting to Osmosis WebSocket...');
client.connect()
    .then(() => console.log('Connected successfully!'))
    .catch(error => console.error('Connection error:', error));
// Process the events
console.log('Monitoring for events...');
// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down...');
    client.disconnect();
    process.exit(0);
});
// Keep the process running
console.log('Client running. Press Ctrl+C to stop.');
