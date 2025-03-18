import WebSocket from 'ws';
import { promises as fs } from 'fs';
import path from 'path';
class TendermintWSClient {
    constructor({ wsEndpoint = 'wss://sei-rpc.polkachu.com/websocket', subscriptionQuery = "tm.event='Tx'", filterFiles = {}, walletAddresses = [], maxReconnectAttempts = 5, reconnectDelay = 5000, wasmContractFilter = null, eventFilters = [], } = {}) {
        this.wsEndpoint = wsEndpoint;
        this.subscriptionQuery = subscriptionQuery;
        this.filterFiles = filterFiles;
        // Convert walletAddresses to array if string is provided
        this.walletAddresses = typeof walletAddresses === 'string'
            ? [walletAddresses]
            : Array.isArray(walletAddresses) ? walletAddresses : [];
        this.maxReconnectAttempts = maxReconnectAttempts;
        this.reconnectDelay = reconnectDelay;
        // Convert wasmContractFilter to array if string is provided
        this.wasmContractFilter = wasmContractFilter === null
            ? null
            : typeof wasmContractFilter === 'string'
                ? [wasmContractFilter]
                : Array.isArray(wasmContractFilter) ? wasmContractFilter : null;
        this.eventFilters = eventFilters;
        this.ws = null;
        this.filters = {};
        this.reconnectAttempts = 0;
    }
    async loadFilters() {
        try {
            for (const [key, filePath] of Object.entries(this.filterFiles)) {
                try {
                    // Read the file from the filesystem
                    const fileContent = await fs.readFile(path.resolve(process.cwd(), filePath), 'utf-8');
                    const filterValues = JSON.parse(fileContent);
                    if (Array.isArray(filterValues)) {
                        // Simply use the address values as provided.
                        this.filters[key] = filterValues;
                    }
                    else {
                        throw new Error(`Filter file ${filePath} must contain an array`);
                    }
                }
                catch (error) {
                    console.error(`Error loading filter file ${filePath}:`, error);
                    throw error;
                }
            }
        }
        catch (error) {
            console.error('Error loading filters:', error);
            throw error;
        }
    }
    async connect() {
        try {
            await this.loadFilters();
        }
        catch (error) {
            console.error('Failed to load filters, continuing without filters:', error);
        }
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.wsEndpoint);
                this.ws.on('open', () => {
                    console.log('Connected to WebSocket');
                    this.subscribe();
                    this.reconnectAttempts = 0;
                    resolve();
                });
                this.ws.on('message', (data) => {
                    let message;
                    try {
                        message = JSON.parse(data.toString());
                    }
                    catch (err) {
                        console.error('Error parsing JSON:', err);
                        return;
                    }
                    this.handleMessage(message);
                });
                this.ws.on('close', () => this.handleReconnect());
                this.ws.on('error', (error) => {
                    console.error('WebSocket error:', error.message);
                    reject(error);
                });
            }
            catch (error) {
                console.error('Error initializing WebSocket connection:', error);
                reject(error);
            }
        });
    }
    handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => {
                this.connect().catch((err) => {
                    console.error('Reconnect failed:', err);
                });
            }, this.reconnectDelay);
        }
        else {
            console.error('Max reconnect attempts reached. Connection closed.');
        }
    }
    subscribe() {
        if (!this.ws) {
            console.error('Cannot subscribe: WebSocket is not initialized');
            return;
        }
        const subscribeMsg = {
            jsonrpc: '2.0',
            method: 'subscribe',
            id: Date.now(),
            params: [this.subscriptionQuery]
        };
        this.ws.send(JSON.stringify(subscribeMsg));
        console.log('Subscription sent:', subscribeMsg);
    }
    decodeBase64(str) {
        try {
            return Buffer.from(str, 'base64').toString('utf-8');
        }
        catch (error) {
            console.error('Error decoding base64:', error);
            return str; // Return original if decoding fails
        }
    }
    // Returns false if the message includes unwanted events (e.g. aggregate_vote.exchange_rates)
    filterUnwanted(message) {
        if (message.id && message.result) {
            if (message.result.events && message.result.events['aggregate_vote.exchange_rates']) {
                return false;
            }
        }
        return true;
    }
    getEventsFromMessage(message) {
        if (message.result &&
            message.result.data &&
            message.result.data.value &&
            message.result.data.value.TxResult &&
            message.result.data.value.TxResult.result &&
            message.result.data.value.TxResult.result.events) {
            return message.result.data.value.TxResult.result.events;
        }
        return null;
    }
    extractTransferData(events) {
        const transferData = {
            senders: new Set(),
            receivers: new Set(),
            recipients: new Set(),
            spenders: new Set(),
            amounts: new Set()
        };
        events.forEach(event => {
            if (!event.attributes)
                return;
            event.attributes.forEach((attr) => {
                const key = this.decodeBase64(attr.key);
                const value = this.decodeBase64(attr.value);
                switch (key) {
                    case 'sender':
                        transferData.senders.add(value);
                        break;
                    case 'receiver':
                        transferData.receivers.add(value);
                        break;
                    case 'recipient':
                        transferData.recipients.add(value);
                        break;
                    case 'spender':
                        transferData.spenders.add(value);
                        break;
                    case 'amount':
                        transferData.amounts.add(value);
                        break;
                }
            });
        });
        return {
            senders: Array.from(transferData.senders),
            receivers: Array.from(transferData.receivers),
            recipients: Array.from(transferData.recipients),
            spenders: Array.from(transferData.spenders),
            amounts: Array.from(transferData.amounts)
        };
    }
    matchesFilters(events) {
        if (!this.filters || Object.keys(this.filters).length === 0)
            return true;
        return events.some(event => {
            if (!event.attributes)
                return false;
            return event.attributes.some((attr) => {
                const key = this.decodeBase64(attr.key);
                const value = this.decodeBase64(attr.value);
                return Object.entries(this.filters).some(([filterKey, filterValues]) => {
                    return (key === filterKey || (key === 'receiver' && filterKey === 'recipient')) &&
                        filterValues.includes(value);
                });
            });
        });
    }
    handleMessage(message) {
        if (!this.filterUnwanted(message))
            return;
        if (message.id && message.result && !message.result.events) {
            console.log('Subscription confirmation received:', message.result);
            return;
        }
        const events = this.getEventsFromMessage(message);
        if (!events) {
            // This is often just a subscription confirmation or other non-event message
            // So we don't need to log this as an error in most cases
            return;
        }
        // Apply multiple different filter types
        let shouldProcess = true;
        // 1. Check WASM contract filter if provided
        if (this.wasmContractFilter) {
            const matchingWasmEvents = events.filter(event => {
                if (event.type === 'message') {
                    const actionAttr = event.attributes?.find((attr) => this.decodeBase64(attr.key) === 'action');
                    if (actionAttr && this.decodeBase64(actionAttr.value).includes('wasm')) {
                        const contractAttr = event.attributes?.find((attr) => this.decodeBase64(attr.key) === 'contract');
                        if (contractAttr) {
                            const contractValue = this.decodeBase64(contractAttr.value);
                            return this.wasmContractFilter.includes(contractValue);
                        }
                    }
                }
                return false;
            });
            if (matchingWasmEvents.length > 0) {
                console.log(`Found ${matchingWasmEvents.length} WASM events matching contract filter`);
                matchingWasmEvents.forEach(event => {
                    console.log('WASM message with matching contract:', event);
                });
            }
            else {
                // No matching WASM contract events
                shouldProcess = false;
            }
        }
        // 2. Check custom attribute filters from filter files
        if (shouldProcess && Object.keys(this.filters).length > 0) {
            if (!this.matchesFilters(events)) {
                shouldProcess = false;
            }
        }
        // 3. Check custom event filters
        if (shouldProcess && this.eventFilters.length > 0) {
            const matchesEventFilter = events.some(event => {
                return this.eventFilters.some(filter => {
                    // Check event type
                    if (filter.type) {
                        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
                        if (!types.includes(event.type)) {
                            return false;
                        }
                    }
                    // Check event attributes
                    if (filter.attributes && event.attributes) {
                        return Object.entries(filter.attributes).some(([attrKey, attrValues]) => {
                            const attrValuesList = Array.isArray(attrValues) ? attrValues : [attrValues];
                            return event.attributes.some((attr) => {
                                const key = this.decodeBase64(attr.key);
                                const value = this.decodeBase64(attr.value);
                                return key === attrKey && attrValuesList.includes(value);
                            });
                        });
                    }
                    // If we only checked for type and no attributes were specified, it's a match
                    return filter.attributes ? false : true;
                });
            });
            if (!matchesEventFilter) {
                shouldProcess = false;
            }
        }
        // Skip further processing if none of the filters matched
        if (!shouldProcess) {
            return;
        }
        const transferData = this.extractTransferData(events);
        console.log('Transfer Data:', transferData);
        // Additional processing for specific message actions and wallet matching.
        if (this.walletAddresses.length > 0) {
            const walletMatches = [];
            events.forEach(event => {
                if (event.type === 'message') {
                    const actionAttr = event.attributes?.find((attr) => this.decodeBase64(attr.key) === 'action');
                    if (!actionAttr)
                        return;
                    const action = this.decodeBase64(actionAttr.value);
                    // Monitor all cosmos staking and distribution messages
                    if (action.startsWith('/cosmos.staking.') || action.startsWith('/cosmos.distribution.')) {
                        console.log(`Action: ${action}`);
                        // Check for wallet addresses in any attribute
                        event.attributes?.forEach((attr) => {
                            const key = this.decodeBase64(attr.key);
                            const value = this.decodeBase64(attr.value);
                            // Check if any of our watched wallet addresses is involved
                            const matchingWallet = this.walletAddresses.find(address => value === address);
                            if (matchingWallet && ['sender', 'recipient', 'delegator', 'validator', 'spender'].includes(key)) {
                                walletMatches.push({
                                    action,
                                    role: key,
                                    address: matchingWallet
                                });
                            }
                        });
                    }
                }
            });
            if (walletMatches.length > 0) {
                console.log(`Wallet Address Matched ${walletMatches.length} times:`, walletMatches);
            }
        }
    }
    disconnect() {
        if (this.ws) {
            this.ws.close();
            console.log('WebSocket connection closed.');
        }
    }
}
export default TendermintWSClient;
