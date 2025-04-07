// examples/live-test.ts
import TendermintWSClient, {
  ChainType,
  EventType,
  AdvancedFilter,
  MatchType,
  DecodedTxResult
} from '../src/index.js';
import config from '../config/default.js';

/**
 * This script connects to a live Tendermint RPC endpoint and processes real events.
 */

// Select a chain to connect to (change this to test different chains)
const CHAIN = 'osmosis';

// Create client with selected chain configuration
const client = new TendermintWSClient({
  wsEndpoint: config.endpoints[CHAIN],
  // Use a type-safe approach for chainType
  chainType: CHAIN === 'osmosis' ? ChainType.Osmosis : 
             CHAIN === 'cosmos' ? ChainType.Cosmos :
             CHAIN === 'sei' ? ChainType.Sei :
             CHAIN === 'juno' ? ChainType.Juno :
             CHAIN === 'terra' ? ChainType.Terra :
             ChainType.Generic,
  
  // Connection settings
  subscriptionQuery: config.connection.subscriptionQuery,
  maxReconnectAttempts: config.connection.maxReconnectAttempts,
  reconnectDelay: config.connection.reconnectDelay,
  
  // Add basic filtering
  eventFilters: [
    // Example: Filter for token transfers
    {
      type: config.filters.eventTypes.transfer,
    }
  ],
  
  // Logging settings
  logToConsole: config.logging.logToConsole,
  excludeUnwantedEvents: config.logging.excludeUnwantedEvents,
  
  // Add debugging to see raw messages
  debug: true, // Override default to debug
});

// Add an advanced filter for high-value transactions (customize for your chain)
// This example looks for transactions with amounts over 1000 tokens
const highValueFilter: AdvancedFilter = {
  name: 'high_value_tx',
  anyOf: [
    {
      key: 'amount',
      value: '1000', // This is chain-specific; adjust based on denomination
      matchType: MatchType.Contains
    }
  ]
};

client.addFilter(highValueFilter);

// Set up event handlers
console.log('Setting up event handlers...');

// All transactions (unfiltered)
let txCount = 0;
client.onTx((tx: DecodedTxResult) => {
  txCount++;
  if (txCount % 10 === 0) {
    console.log(`Processed ${txCount} transactions`);
  }
});

// Filtered transactions
client.onFilteredTx((tx: DecodedTxResult) => {
  console.log('\n--------- FILTERED TRANSACTION ---------');
  console.log(`TxHash: ${tx.txhash}`);
  console.log(`Height: ${tx.height}`);
  
  // Show which filters matched
  if (tx.matchedFilters) {
    console.log('Matched filters:');
    tx.matchedFilters.forEach(filter => {
      console.log(`  - ${filter.filterType}`);
    });
  }
  
  // Show transfer details
  if (tx.transferData) {
    if (tx.transferData.senders.length > 0) {
      console.log(`Sender: ${tx.transferData.senders[0]}`);
    }
    if (tx.transferData.recipients.length > 0) {
      console.log(`Recipient: ${tx.transferData.recipients[0]}`);
    }
    if (tx.transferData.amounts.length > 0) {
      console.log(`Amount: ${tx.transferData.amounts[0]}`);
    }
  }
  
  // Parse message data
  const messages = client.parseMessagingData(tx);
  if (messages.length > 0) {
    console.log('\nMessage details:');
    messages.forEach(msg => {
      console.log(`  Type: ${msg.messageType}`);
      console.log(`  Action: ${msg.action}`);
      console.log(`  Module: ${msg.module}`);
      if (msg.sender) console.log(`  Sender: ${msg.sender}`);
      if (msg.recipient) console.log(`  Recipient: ${msg.recipient}`);
      if (msg.amount) console.log(`  Amount: ${JSON.stringify(msg.amount)}`);
      if (msg.contractAddress) console.log(`  Contract: ${msg.contractAddress}`);
    });
  }
  
  console.log('---------------------------------------\n');
});

// Handle WASM transactions (contract interactions)
client.onWasmTx((tx: DecodedTxResult) => {
  console.log('\n🧩 WASM Contract Interaction:');
  console.log(`TxHash: ${tx.txhash}`);
  
  // Find contract addresses
  const contracts = new Set<string>();
  tx.decodedEvents.forEach(event => {
    if (event.type === 'message' && event.attributes.action?.some(a => a.includes('wasm'))) {
      (event.attributes.contract || []).forEach(addr => contracts.add(addr));
    }
  });
  
  console.log(`Contracts: ${Array.from(contracts).join(', ')}`);
});

// Connection status
client.onConnected(() => {
  console.log(`Connected to ${config.endpoints[CHAIN]}`);
  console.log('Waiting for transactions...');
});

client.onDisconnected(() => {
  console.log('Disconnected from WebSocket');
});

client.onReconnecting((attempt, max) => {
  console.log(`Reconnecting (${attempt}/${max})...`);
});

client.onError((error) => {
  console.error('WebSocket error:', error.message);
});

// Connect to the WebSocket
console.log(`Connecting to ${config.endpoints[CHAIN]}...`);
client.connect()
  .catch(error => {
    console.error('Failed to connect:', error);
    process.exit(1);
  });

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  client.disconnect();
  console.log(`Total transactions processed: ${txCount}`);
  process.exit(0);
});

// Keep the process running
console.log('Press Ctrl+C to stop.');