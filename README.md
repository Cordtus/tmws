# TMWS - Tendermint WebSocket Client

TMWS is a TypeScript library for connecting to Tendermint WebSocket endpoints and processing blockchain events with filtering capabilities. Works with any Tendermint-based blockchain in the Cosmos ecosystem.

## Features

- **WebSocket Connection**
  - Connect to any Tendermint RPC WebSocket endpoint
  - Automatic reconnection with configurable retry settings
  - Typed event system for processing transactions

- **Filtering**
  - Filter by transaction type, event attributes, or message content
  - Pattern matching: exact, contains, regex, prefix/suffix
  - Logical operators (AND, OR, NOT) for complex filtering
  - Filter by wallet addresses or contract interactions
  - Load filter configurations from JSON files

- **Chain-Specific Support**
  - Built-in transformers for Cosmos Hub, Osmosis, and Sei
  - Chain-specific event parsing and data extraction
  - Extensible for additional Cosmos chains

- **Technical Details**
  - TypeScript with type definitions
  - ESM modules
  - Event-driven architecture

## Installation

```bash
# Install with yarn
yarn add tmws

# Or with npm
npm install tmws
```

## Quick Start

```typescript
import TendermintWSClient from 'tmws';

// Create a client with default configuration (connects to Sei)
const client = new TendermintWSClient();

// Listen for transactions
client.onTx(tx => {
  console.log(`New transaction: ${tx.txhash}`);
});

// Connect to WebSocket and start processing events
client.connect()
  .then(() => console.log('Connected to WebSocket'))
  .catch(error => console.error('Connection error:', error));

// Graceful shutdown
process.on('SIGINT', () => {
  client.disconnect();
  process.exit(0);
});
```

## Configuration

```typescript
import TendermintWSClient, { ChainType } from 'tmws';

const client = new TendermintWSClient({
  // WebSocket connection
  wsEndpoint: 'wss://rpc.osmosis.zone/websocket',
  subscriptionQuery: "tm.event='Tx'",
  maxReconnectAttempts: 10,
  reconnectDelay: 3000,
  
  // Chain configuration
  chainType: ChainType.Osmosis,
  chainInfo: {
    chainId: 'osmosis-1',
    bech32Prefix: 'osmo',
    denom: 'uosmo',
    displayDenom: 'OSMO'
  },
  
  // Basic filtering
  walletAddresses: ['osmo1...'],
  wasmContractFilter: ['osmo1...'],
  eventFilters: [
    {
      type: 'token_swapped',
      attributes: {
        token_in: 'uosmo'
      }
    }
  ],
  
  // Load filters from JSON files
  filterFiles: {
    recipient: './config/recipients.json',
    sender: './config/senders.json'
  },
  
  // Event handling options
  logToConsole: true,
  excludeUnwantedEvents: true
});
```

## Event System

```typescript
// Listen for all transactions
client.onTx(tx => {
  console.log('Transaction:', tx.txhash);
});

// Listen for filtered transactions
client.onFilteredTx(tx => {
  console.log('Filtered transaction:', tx.txhash);
});

// Listen for WASM contract interactions
client.onWasmTx(tx => {
  console.log('WASM transaction:', tx.txhash);
});

// Listen for transactions involving monitored wallets
client.onWalletTx(tx => {
  console.log('Wallet transaction:', tx.txhash);
});

// Listen for staking operations
client.onStakingTx(tx => {
  console.log('Staking transaction:', tx.txhash);
});

// Connection events
client.onConnected(() => console.log('Connected'));
client.onDisconnected(() => console.log('Disconnected'));
client.onReconnecting((attempt, max) => console.log(`Reconnecting ${attempt}/${max}`));
client.onError(error => console.error('Error:', error.message));
```

## Advanced Filtering

```typescript
import { AdvancedFilter, MatchType } from 'tmws';

// Create advanced filter
const filter: AdvancedFilter = {
  name: 'large_swap_filter',
  eventType: 'token_swapped',
  allOf: [
    {
      key: 'token_in',
      value: 'uosmo',
      matchType: MatchType.Exact
    }
  ],
  anyOf: [
    {
      key: 'amount',
      value: '1000000',
      matchType: MatchType.Contains
    }
  ],
  noneOf: [
    {
      key: 'fee',
      value: '0',
      matchType: MatchType.Exact
    }
  ]
};

// Add filter to client
client.addFilter(filter);
```

## Chain-Specific Features

```typescript
// Process transactions with chain-specific transformations
client.onTx(tx => {
  // Get parsed messaging data
  const messagingData = client.parseMessagingData(tx);
  
  // For Osmosis: find swap operations
  const swapOps = messagingData.filter(msg => msg.messageType === 'swap');
  
  if (swapOps.length > 0) {
    console.log('Swap operations:', swapOps);
  }
});
```

## Filter Files Format

Create JSON files containing arrays of addresses:

**config/recipients.json**
```json
[
  "osmo1wev8ptzj27aueu04wgvvl4gvurax6rj5yrag90",
  "osmo1z3t55m0l9h6wx7fv9j2wkchvfewnf74dcp5toz"
]
```

## Configuration Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `wsEndpoint` | string | `'wss://sei-rpc.polkachu.com/websocket'` | WebSocket endpoint for Tendermint RPC |
| `subscriptionQuery` | string | `"tm.event='Tx'"` | Tendermint subscription query filter |
| `maxReconnectAttempts` | number | `5` | Maximum reconnect attempts |
| `reconnectDelay` | number | `5000` | Delay between reconnect attempts (ms) |
| `filterFiles` | object | `{}` | Key-value pairs of filter names and file paths |
| `walletAddresses` | string \| string[] | `[]` | Wallet addresses to monitor |
| `wasmContractFilter` | string \| string[] | `null` | WASM contract addresses to filter by |
| `eventFilters` | Object[] | `[]` | Event filters by type and attributes |
| `advancedFilters` | AdvancedFilter[] | `[]` | Advanced filtering rules |
| `chainType` | ChainType | `ChainType.Generic` | Blockchain type for specialized processing |
| `chainInfo` | ChainInfo | `{}` | Additional chain configuration |
| `logToConsole` | boolean | `true` | Whether to log events to console |
| `excludeUnwantedEvents` | boolean | `true` | Whether to filter system events |

## Available Chain Types

```typescript
enum ChainType {
  Generic = 'generic',
  Cosmos = 'cosmos',
  Osmosis = 'osmosis',
  Sei = 'sei',
  Juno = 'juno',
  Terra = 'terra',
}
```

## Match Types for Advanced Filtering

```typescript
enum MatchType {
  Exact = 'exact',
  Contains = 'contains',
  StartsWith = 'startsWith',
  EndsWith = 'endsWith',
  Regex = 'regex'
}
```

## Database Integration

TMWS is designed to be easily integrated with existing database systems and data processing pipelines. Please see [INTEGRATING](./INTEGRATING.md) for examples on feeding blockchain data into common database systems.

### Performance Considerations

For high-throughput chains or chains with very short block time:

- **Batch Inserts**: Group multiple transactions into batch inserts
- **Connection Pooling**: Use connection pools to manage database connections
- **Asynchronous Processing**: Use message queues to decouple WebSocket processing from database writes
- **Checkpointing**: Maintain a record of processed block heights to support resuming after interruptions

Example checkpoint implementation:

```typescript
async function processWithCheckpoints() {
  const client = new TendermintWSClient({
    wsEndpoint: 'wss://rpc.osmosis.zone/websocket'
  });

  let lastProcessedHeight = await getLastProcessedHeightFromDB();
  console.log(`Resuming from height ${lastProcessedHeight}`);
  
  client.onFilteredTx(async (tx) => {
    const currentHeight = parseInt(tx.height);
    
    // Process transaction
    await storeTxInDatabase(tx);
    
    // Update checkpoint if we've moved to a new block
    if (currentHeight > lastProcessedHeight) {
      lastProcessedHeight = currentHeight;
      await updateCheckpointInDB(lastProcessedHeight);
    }
  });
  
  await client.connect();
}
```

## License

MIT