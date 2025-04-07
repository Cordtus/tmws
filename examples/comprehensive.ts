// examples/comprehensive.ts
import TendermintWSClient, {
  ChainType,
  EventType,
  MatchType,
  AdvancedFilter,
  DecodedTxResult,
  TransformedMessageData
} from '../src/index.js';

/**
 * This example demonstrates all the capabilities of the enhanced TendermintWSClient
 */
async function main() {
  // Create a client with multiple filtering options
  const client = new TendermintWSClient({
    // Connect to Osmosis as an example
    wsEndpoint: 'wss://rpc.osmosis.zone/websocket',
    
    // Subscribe to tx events
    subscriptionQuery: "tm.event='Tx'",
    
    // Set Osmosis chain type for proper transformations
    chainType: ChainType.Osmosis,
    chainInfo: {
      chainId: 'osmosis-1',
      bech32Prefix: 'osmo',
      denom: 'uosmo',
      displayDenom: 'OSMO'
    },
    
    // Monitor specific wallet addresses
    walletAddresses: [
      'osmo1abcdef123456789abcdef123456789abcdef12'
    ],
    
    // Filter specific WASM contracts
    wasmContractFilter: [
      'osmo14v72w8sdjh438uwunzdkc6pfp8xr5kxpxvwqjv'
    ],
    
    // Use basic event filters
    eventFilters: [
      // Monitor IBC transfers
      {
        type: 'send_packet',
        attributes: {
          packet_src_port: 'transfer'
        }
      }
    ],
    
    // Add reconnection settings
    maxReconnectAttempts: 10,
    reconnectDelay: 3000,
    
    // Enable console logging
    logToConsole: true,
    
    // Exclude unwanted blockchain events
    excludeUnwantedEvents: true
  });

  // Register advanced filters for custom event detection
  const swapFilter: AdvancedFilter = {
    name: 'token_swap_filter',
    eventType: 'token_swapped',
    allOf: [
      {
        key: 'module',
        value: 'gamm',
        matchType: MatchType.Exact
      }
    ]
  };

  const ibcTransferFilter: AdvancedFilter = {
    name: 'ibc_transfer_filter',
    eventType: 'send_packet',
    allOf: [
      {
        key: 'packet_src_port',
        value: 'transfer'
      }
    ]
  };

  // Add advanced filters to the client
  client.addFilter(swapFilter);
  client.addFilter(ibcTransferFilter);

  // Set up custom event handlers that go beyond the default logging
  
  // Handle specific token swaps
  client.onFilteredTx((tx: DecodedTxResult) => {
    // Only process transactions that match our swap filter
    if (tx.matchedFilters?.some((f: any) => f.filterType === 'eventFilter')) {
      const messagingData = client.parseMessagingData(tx);
      
      // Find swap operations
      const swapOps = messagingData.filter((msg: TransformedMessageData) => msg.messageType === 'swap');
      
      if (swapOps.length > 0) {
        console.log('🔄 Token Swap Detected:');
        swapOps.forEach((swap: TransformedMessageData) => {
          console.log(`  - TokenIn: ${swap.metadata?.tokenIn}`);
          console.log(`  - TokenOut: ${swap.metadata?.tokenOut}`);
        });
      }
    }
  });

  // Handle IBC transfers
  client.on(EventType.FilteredTx, (tx: DecodedTxResult) => {
    const hasIbcEvent = tx.decodedEvents.some(
      (event: any) => event.type === 'send_packet' && 
              event.attributes['packet_src_port']?.includes('transfer')
    );
    
    if (hasIbcEvent) {
      console.log('🌉 IBC Transfer Detected:');
      console.log(`  - TxHash: ${tx.txhash}`);
      
      // Extract sender and receiver if available
      const senders = tx.transferData?.senders || [];
      const recipients = tx.transferData?.recipients || [];
      
      if (senders.length > 0) {
        console.log(`  - Sender: ${senders[0]}`);
      }
      
      if (recipients.length > 0) {
        console.log(`  - Recipient: ${recipients[0]}`);
      }
    }
  });

  // Handle staking operations
  client.onStakingTx((tx: DecodedTxResult) => {
    console.log('🥩 Staking Operation Detected:');
    console.log(`  - TxHash: ${tx.txhash}`);
    
    // Get specific staking actions
    const stakingEvents = tx.decodedEvents.filter(
      (event: any) => event.type === 'message' && 
              event.attributes['action']?.some(
                (action: string) => action.includes('cosmos.staking')
              )
    );
    
    stakingEvents.forEach((event: any) => {
      const actions = event.attributes['action'] || [];
      const delegator = event.attributes['delegator']?.[0] || 'unknown';
      const validator = event.attributes['validator']?.[0] || 'unknown';
      
      actions.forEach((action: string) => {
        console.log(`  - Action: ${action}`);
        console.log(`  - Delegator: ${delegator}`);
        console.log(`  - Validator: ${validator}`);
      });
    });
  });

  // Connect to WebSocket and start processing events
  try {
    console.log('Connecting to Osmosis WebSocket...');
    await client.connect();
    console.log('Connected and listening for events...');
  } catch (error) {
    console.error('Failed to connect:', error);
    process.exit(1);
  }

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down...');
    client.disconnect();
    process.exit(0);
  });

  console.log('Client running. Press Ctrl+C to stop.');
}

main().catch(console.error);