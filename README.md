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

TMWS is designed to be easily integrated with existing database systems and data processing pipelines. Below are examples of how to use TMWS to feed blockchain data into common database systems.

### PostgreSQL Integration

```typescript
import TendermintWSClient, { DecodedTxResult } from 'tmws';
import { Pool } from 'pg';

// Create PostgreSQL connection pool
const pgPool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'blockchain_data',
  user: 'postgres',
  password: 'password'
});

// Initialize the client
const client = new TendermintWSClient({
  wsEndpoint: 'wss://rpc.osmosis.zone/websocket',
  chainType: ChainType.Osmosis
});

// Store transaction data in PostgreSQL
client.onFilteredTx(async (tx: DecodedTxResult) => {
  try {
    // Store base transaction data
    const txQuery = `
      INSERT INTO transactions (
        height, txhash, gas_wanted, gas_used, timestamp
      ) VALUES ($1, $2, $3, $4, NOW())
      RETURNING id
    `;
    
    const txResult = await pgPool.query(txQuery, [
      tx.height, 
      tx.txhash, 
      tx.gasWanted, 
      tx.gasUsed
    ]);
    
    const txId = txResult.rows[0].id;
    
    // Store transfer data if present
    if (tx.transferData && tx.transferData.senders.length > 0) {
      const transferQuery = `
        INSERT INTO transfers (
          tx_id, sender, recipient, amount, denom
        ) VALUES ($1, $2, $3, $4, $5)
      `;
      
      // Extract transfer details
      for (let i = 0; i < tx.transferData.senders.length; i++) {
        const sender = tx.transferData.senders[i];
        const recipient = tx.transferData.recipients[i] || '';
        
        // Parse amount to separate numeric value and denom
        const amountStr = tx.transferData.amounts[i] || '';
        const match = amountStr.match(/^([0-9]+)(.+)$/);
        
        if (match) {
          const amount = match[1];
          const denom = match[2];
          
          await pgPool.query(transferQuery, [
            txId, sender, recipient, amount, denom
          ]);
        }
      }
    }
    
    console.log(`Stored transaction ${tx.txhash} in PostgreSQL`);
  } catch (error) {
    console.error('Database error:', error);
  }
});

// Start processing events
client.connect().catch(console.error);
```

### MongoDB Integration

```typescript
import TendermintWSClient, { DecodedTxResult } from 'tmws';
import { MongoClient } from 'mongodb';

// Connect to MongoDB
async function startMonitoring() {
  const mongoClient = new MongoClient('mongodb://localhost:27017');
  await mongoClient.connect();
  
  const db = mongoClient.db('blockchain');
  const txCollection = db.collection('transactions');
  const transferCollection = db.collection('transfers');
  const swapCollection = db.collection('swaps');

  // Initialize TMWS client
  const client = new TendermintWSClient({
    wsEndpoint: 'wss://rpc.osmosis.zone/websocket',
    chainType: ChainType.Osmosis
  });

  // Store filtered transactions in MongoDB
  client.onFilteredTx(async (tx: DecodedTxResult) => {
    try {
      // Store base transaction
      const txResult = await txCollection.insertOne({
        txhash: tx.txhash,
        height: tx.height,
        gasWanted: tx.gasWanted,
        gasUsed: tx.gasUsed,
        timestamp: new Date()
      });
      
      // Process transfers
      if (tx.transferData && tx.transferData.senders.length > 0) {
        const transfers = [];
        
        for (let i = 0; i < tx.transferData.senders.length; i++) {
          transfers.push({
            txhash: tx.txhash,
            sender: tx.transferData.senders[i],
            recipient: tx.transferData.recipients[i] || '',
            amount: tx.transferData.amounts[i] || '',
            timestamp: new Date()
          });
        }
        
        if (transfers.length > 0) {
          await transferCollection.insertMany(transfers);
        }
      }
      
      // Process swap events
      const swapEvents = tx.decodedEvents.filter(event => event.type === 'token_swapped');
      if (swapEvents.length > 0) {
        const swaps = swapEvents.map(event => ({
          txhash: tx.txhash,
          height: tx.height,
          timestamp: new Date(),
          poolId: event.attributes['pool_id']?.[0] || '',
          tokensIn: event.attributes['tokens_in']?.[0] || '',
          tokensOut: event.attributes['tokens_out']?.[0] || '',
          sender: event.attributes['sender']?.[0] || ''
        }));
        
        await swapCollection.insertMany(swaps);
      }
      
      console.log(`Stored transaction ${tx.txhash} in MongoDB`);
    } catch (error) {
      console.error('MongoDB error:', error);
    }
  });

  await client.connect();
  console.log('Connected to WebSocket and MongoDB');
}

startMonitoring().catch(console.error);
```

### Kafka Integration for Event Streaming

For high-throughput event processing, use Kafka to stream blockchain events:

```typescript
import TendermintWSClient, { DecodedTxResult } from 'tmws';
import { Kafka } from 'kafkajs';

// Create Kafka client
const kafka = new Kafka({
  clientId: 'tmws-client',
  brokers: ['localhost:9092']
});

async function startStreaming() {
  const producer = kafka.producer();
  await producer.connect();
  
  const client = new TendermintWSClient({
    wsEndpoint: 'wss://rpc.osmosis.zone/websocket',
    chainType: ChainType.Osmosis
  });
  
  // Stream all transactions to Kafka
  client.onTx(async (tx: DecodedTxResult) => {
    // Determine message topic based on transaction type
    let topic = 'blockchain.transactions';
    
    // Check for specific event types to route to different topics
    if (tx.decodedEvents.some(e => e.type === 'token_swapped')) {
      topic = 'blockchain.swaps';
    } else if (tx.decodedEvents.some(e => e.type === 'withdraw_rewards')) {
      topic = 'blockchain.staking';
    }
    
    // Send to Kafka
    await producer.send({
      topic,
      messages: [{ 
        key: tx.txhash,
        value: JSON.stringify({
          txhash: tx.txhash,
          height: tx.height,
          events: tx.decodedEvents,
          transferData: tx.transferData,
          timestamp: new Date().toISOString()
        })
      }],
    });
  });
  
  await client.connect();
  console.log('Connected to WebSocket and streaming to Kafka');
}

startStreaming().catch(console.error);
```

## Performance Considerations

For high-throughput chains:

1. **Batch Inserts**: Group multiple transactions into batch inserts
2. **Connection Pooling**: Use connection pools to manage database connections
3. **Asynchronous Processing**: Use message queues to decouple WebSocket processing from database writes
4. **Checkpointing**: Maintain a record of processed block heights to support resuming after interruptions

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