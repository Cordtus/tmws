# TMWS

TMWS is a Tendermint WebSocket client library designed to capture and filter blockchain events from any Tendermint-based blockchain (Cosmos SDK), including support for WASM message filtering and external configuration.

## Features

- Connects to a Tendermint RPC WebSocket endpoint
- Supports subscription queries to filter events
- Dynamically loads filter configurations from JSON files
- Robust reconnection and error handling
- Filters for specific WASM contract events
- Monitors transactions related to a specific wallet address
- Decodes base64-encoded event data
- ESM TypeScript for modern applications

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/yourusername/tmws.git
cd tmws
yarn install
```

## Build

Compile the TypeScript files:

```bash
yarn build
```

## Usage

### Basic Example

```typescript
import TendermintWSClient from 'tmws';

const client = new TendermintWSClient({
  wsEndpoint: 'wss://rpc.cosmos.network/websocket',
  subscriptionQuery: "tm.event='Tx'",
});

client.connect().catch(error => console.error('Connection error:', error));

// Handle graceful shutdown
process.on('SIGINT', () => {
  client.disconnect();
  process.exit();
});
```

### Advanced Configuration

```typescript
import TendermintWSClient from 'tmws';

const client = new TendermintWSClient({
  // WebSocket endpoint for the Tendermint RPC
  wsEndpoint: 'wss://sei-rpc.polkachu.com/websocket',
  
  // Subscription query filter
  subscriptionQuery: "tm.event='Tx'",
  
  // WASM contract filtering - can be a single address or an array
  wasmContractFilter: [
    'sei1abcdef123456789abcdef123456789abcdef12',
    'sei1fedcba987654321fedcba987654321fedcba98'
  ],
  
  // Load filters from JSON files
  // Each file should contain an array of addresses to filter by
  filterFiles: { 
    recipient: './config/recipients.json',
    sender: './config/senders.json'
  },
  
  // Wallet addresses to monitor (can be a single address or an array)
  walletAddresses: [
    'sei1wev8ptzj27aueu04wgvvl4gvurax6rj5yrag90',
    'sei1z3t55m0l9h6wx7fv9j2wkchvfewnf74dcp5toz'
  ],
  
  // Custom event filters - filter by event type and attributes
  eventFilters: [
    {
      // Filter by event type
      type: 'transfer',
      // Filter by event attributes
      attributes: {
        recipient: ['sei1wev8ptzj27aueu04wgvvl4gvurax6rj5yrag90']
      }
    },
    {
      // Filter for staking messages
      type: 'message',
      attributes: {
        action: '/cosmos.staking.v1beta1.MsgDelegate'
      }
    }
  ],
  
  // Reconnection settings
  maxReconnectAttempts: 5,
  reconnectDelay: 5000,
});

client.connect()
  .then(() => {
    console.log('Successfully connected and subscribed!');
  })
  .catch(error => {
    console.error('Connection error:', error);
  });
```

### Filter Files

Create JSON files containing arrays of addresses to filter events by:

**config/recipients.json**
```json
[
  "sei1wev8ptzj27aueu04wgvvl4gvurax6rj5yrag90",
  "sei1z3t55m0l9h6wx7fv9j2wkchvfewnf74dcp5toz"
]
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `wsEndpoint` | string | `'wss://sei-rpc.polkachu.com/websocket'` | WebSocket endpoint for the Tendermint RPC |
| `subscriptionQuery` | string | `"tm.event='Tx'"` | Tendermint subscription query filter |
| `filterFiles` | object | `{}` | Key-value pairs of filter names and file paths |
| `walletAddresses` | string \| string[] | `[]` | Wallet address(es) to monitor |
| `maxReconnectAttempts` | number | `5` | Maximum number of reconnect attempts |
| `reconnectDelay` | number | `5000` | Delay between reconnect attempts in milliseconds |
| `wasmContractFilter` | string \| string[] \| null | `null` | WASM contract address(es) to filter by |
| `eventFilters` | Object[] | `[]` | Custom event filters by type and attributes |

## Events Handled

The client processes various types of Tendermint events, including:

- Transaction events (transfer, send, receive)
- WASM contract interactions
- Staking operations (delegate, undelegate, redelegate)
- Distribution events (withdraw rewards, set withdraw address)

## Running Tests

Run the tests using:

```bash
yarn test
```

## License

This project is licensed under the MIT License.