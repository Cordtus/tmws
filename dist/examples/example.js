import TendermintWSClient from '../src';
const client = new TendermintWSClient({
    wsEndpoint: 'wss://sei-rpc.polkachu.com/websocket',
    subscriptionQuery: "tm.event='Tx'",
    // Replace with your target WASM contract address or set to null to disable this filter:
    wasmContractFilter: 'specific_contract_address_here',
    filterFiles: { recipient: './config/recipients.json' },
    walletAddress: 'sei1wev8ptzj27aueu04wgvvl4gvurax6rj5yrag90'
});
client.connect().catch(error => console.error('Connection error:', error));
process.on('SIGINT', () => {
    client.disconnect();
    process.exit();
});
