## Database Integration

TMWS can be integrated with various databases and data systems to store and analyze blockchain events. Below are examples of how to integrate with common database systems.

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
    // Insert base transaction data
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
    
    // Insert transfer data
    if (tx.transferData && tx.transferData.senders.length > 0) {
      const transferQuery = `
        INSERT INTO transfers (
          tx_id, sender, recipient, amount
        ) VALUES ($1, $2, $3, $4)
      `;
      
      for (let i = 0; i < tx.transferData.senders.length; i++) {
        await pgPool.query(transferQuery, [
          txId,
          tx.transferData.senders[i],
          tx.transferData.recipients[i] || '',
          tx.transferData.amounts[i] || ''
        ]);
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
async function connectToMongoDB() {
  const mongoClient = new MongoClient('mongodb://localhost:27017');
  await mongoClient.connect();
  
  const db = mongoClient.db('blockchain');
  const txCollection = db.collection('transactions');
  const transferCollection = db.collection('transfers');
  
  // Initialize TMWS client
  const wsClient = new TendermintWSClient({
    wsEndpoint: 'wss://rpc.osmosis.zone/websocket',
    chainType: ChainType.Osmosis
  });
  
  // Store transaction data
  wsClient.onFilteredTx(async (tx: DecodedTxResult) => {
    try {
      // Store base transaction
      const txResult = await txCollection.insertOne({
        txhash: tx.txhash,
        height: parseInt(tx.height),
        gasWanted: parseInt(tx.gasWanted),
        gasUsed: parseInt(tx.gasUsed),
        timestamp: new Date()
      });
      
      // Store transfer data
      if (tx.transferData && tx.transferData.senders.length > 0) {
        const transfers = tx.transferData.senders.map((sender, index) => ({
          txId: txResult.insertedId,
          txhash: tx.txhash,
          sender: sender,
          recipient: tx.transferData.recipients[index] || '',
          amount: tx.transferData.amounts[index] || '',
          timestamp: new Date()
        }));
        
        if (transfers.length > 0) {
          await transferCollection.insertMany(transfers);
        }
      }
      
      console.log(`Stored transaction ${tx.txhash} in MongoDB`);
    } catch (error) {
      console.error('MongoDB error:', error);
    }
  });
  
  await wsClient.connect();
  console.log('Connected to MongoDB and WebSocket');
}

connectToMongoDB().catch(console.error);
```

### TimescaleDB for Time-Series Analysis

```typescript
import TendermintWSClient, { DecodedTxResult } from 'tmws';
import { Pool } from 'pg';

// TimescaleDB uses the PostgreSQL interface
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'timescale_blockchain',
  user: 'postgres',
  password: 'password'
});

// Create hypertable (run once)
async function setupTimescaleDB() {
  const client = await pool.connect();
  try {
    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        time TIMESTAMPTZ NOT NULL,
        height BIGINT,
        txhash TEXT,
        gas_used BIGINT,
        gas_wanted BIGINT,
        tx_type TEXT
      );
    `);
    
    // Convert to hypertable
    await client.query(`
      SELECT create_hypertable('transactions', 'time', if_not_exists => TRUE);
    `);
  } finally {
    client.release();
  }
}

// Initialize TMWS client
const wsClient = new TendermintWSClient({
  wsEndpoint: 'wss://rpc.osmosis.zone/websocket',
  chainType: ChainType.Osmosis
});

// Store time-series data
wsClient.onFilteredTx(async (tx: DecodedTxResult) => {
  try {
    const query = `
      INSERT INTO transactions (time, height, txhash, gas_used, gas_wanted, tx_type)
      VALUES (NOW(), $1, $2, $3, $4, $5)
    `;
    
    // Determine transaction type
    let txType = 'unknown';
    if (tx.decodedEvents.some(e => e.type === 'token_swapped')) {
      txType = 'swap';
    } else if (tx.decodedEvents.some(e => e.type === 'transfer')) {
      txType = 'transfer';
    }
    
    await pool.query(query, [
      parseInt(tx.height),
      tx.txhash,
      parseInt(tx.gasUsed),
      parseInt(tx.gasWanted),
      txType
    ]);
    
    console.log(`Stored transaction ${tx.txhash} in TimescaleDB`);
  } catch (error) {
    console.error('TimescaleDB error:', error);
  }
});

// Start everything
async function main() {
  await setupTimescaleDB();
  await wsClient.connect();
  console.log('Connected to TimescaleDB and WebSocket');
}

main().catch(console.error);
```

### Message Queue Integration (Kafka)

```typescript
import TendermintWSClient, { DecodedTxResult } from 'tmws';
import { Kafka } from 'kafkajs';

// Create Kafka client
const kafka = new Kafka({
  clientId: 'tmws-client',
  brokers: ['localhost:9092']
});
const producer = kafka.producer();

// Initialize TMWS client
const client = new TendermintWSClient({
  wsEndpoint: 'wss://rpc.osmosis.zone/websocket',
  chainType: ChainType.Osmosis
});

// Stream transactions to Kafka
async function streamTransactionsToKafka() {
  await producer.connect();
  
  // Stream all transactions
  client.onTx(async (tx: DecodedTxResult) => {
    await producer.send({
      topic: 'blockchain-transactions',
      messages: [{ 
        key: tx.txhash, 
        value: JSON.stringify(tx)
      }],
    });
  });
  
  // Stream specific transaction types to dedicated topics
  client.onFilteredTx(async (tx: DecodedTxResult) => {
    // Determine transaction type
    if (tx.decodedEvents.some(e => e.type === 'token_swapped')) {
      await producer.send({
        topic: 'swap-transactions',
        messages: [{ 
          key: tx.txhash, 
          value: JSON.stringify(tx)
        }],
      });
    }
  });
  
  await client.connect();
  console.log('Connected and streaming to Kafka');
}

streamTransactionsToKafka().catch(console.error);
```

### ClickHouse for Analytics

```typescript
import TendermintWSClient, { DecodedTxResult } from 'tmws';
import { createClient } from '@clickhouse/client';

// Create ClickHouse client
const clickhouse = createClient({
  host: 'http://localhost:8123',
  username: 'default',
  password: ''
});

// Initialize TMWS client
const client = new TendermintWSClient({
  wsEndpoint: 'wss://rpc.osmosis.zone/websocket',
  chainType: ChainType.Osmosis
});

// Buffer for batch inserts
let transactionBuffer = [];
const BATCH_SIZE = 100;

// Store transactions in ClickHouse
client.onFilteredTx(async (tx: DecodedTxResult) => {
  // Add to buffer
  transactionBuffer.push({
    timestamp: new Date(),
    height: parseInt(tx.height),
    txhash: tx.txhash,
    gas_used: parseInt(tx.gasUsed),
    gas_wanted: parseInt(tx.gasWanted),
    sender: tx.transferData?.senders[0] || '',
    recipient: tx.transferData?.recipients[0] || '',
    amount: tx.transferData?.amounts[0] || ''
  });
  
  // Insert in batches
  if (transactionBuffer.length >= BATCH_SIZE) {
    try {
      await clickhouse.insert({
        table: 'transactions',
        values: transactionBuffer,
        format: 'JSONEachRow'
      });
      
      console.log(`Inserted ${transactionBuffer.length} transactions into ClickHouse`);
      transactionBuffer = [];
    } catch (error) {
      console.error('ClickHouse error:', error);
    }
  }
});

// Start processing events
client.connect().catch(console.error);
```
