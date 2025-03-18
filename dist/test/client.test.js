import TendermintWSClient from '../src/client.js';
describe('TendermintWSClient', () => {
    test('should create an instance with default values', () => {
        const client = new TendermintWSClient();
        expect(client.wsEndpoint).toBe('wss://sei-rpc.polkachu.com/websocket');
        expect(client.subscriptionQuery).toBe("tm.event='Tx'");
        expect(client.walletAddresses).toEqual([]);
        expect(client.maxReconnectAttempts).toBe(5);
        expect(client.reconnectDelay).toBe(5000);
        expect(client.wasmContractFilter).toBeNull();
        expect(client.eventFilters).toEqual([]);
    });
    test('should create an instance with custom values', () => {
        const config = {
            wsEndpoint: 'wss://custom-endpoint.com/websocket',
            subscriptionQuery: "tm.event='custom'",
            walletAddresses: ['custom-wallet-address', 'another-wallet'],
            maxReconnectAttempts: 10,
            reconnectDelay: 10000,
            wasmContractFilter: ['custom-contract', 'another-contract'],
            eventFilters: [{ type: 'transfer' }],
        };
        const client = new TendermintWSClient(config);
        expect(client.wsEndpoint).toBe(config.wsEndpoint);
        expect(client.subscriptionQuery).toBe(config.subscriptionQuery);
        expect(client.walletAddresses).toEqual(config.walletAddresses);
        expect(client.maxReconnectAttempts).toBe(config.maxReconnectAttempts);
        expect(client.reconnectDelay).toBe(config.reconnectDelay);
        expect(client.wasmContractFilter).toEqual(config.wasmContractFilter);
        expect(client.eventFilters).toEqual(config.eventFilters);
    });
    test('decodeBase64 should correctly decode base64 strings', () => {
        const client = new TendermintWSClient();
        const encoded = Buffer.from('test string').toString('base64');
        expect(client.decodeBase64(encoded)).toBe('test string');
    });
    test('filterUnwanted should filter out aggregate_vote.exchange_rates events', () => {
        const client = new TendermintWSClient();
        const unwantedMessage = {
            id: 1,
            result: {
                events: {
                    'aggregate_vote.exchange_rates': ['some value']
                }
            }
        };
        const wantedMessage = {
            id: 1,
            result: {
                events: {
                    'transfer.amount': ['some value']
                }
            }
        };
        expect(client.filterUnwanted(unwantedMessage)).toBe(false);
        expect(client.filterUnwanted(wantedMessage)).toBe(true);
    });
});
