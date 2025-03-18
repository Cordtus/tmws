import WebSocket from 'ws';
interface FilterFiles {
    [key: string]: string;
}
export interface TendermintWSClientConfig {
    wsEndpoint?: string;
    subscriptionQuery?: string;
    filterFiles?: FilterFiles;
    walletAddresses?: string | string[];
    maxReconnectAttempts?: number;
    reconnectDelay?: number;
    wasmContractFilter?: string | string[] | null;
    eventFilters?: {
        type?: string | string[];
        attributes?: {
            [key: string]: string | string[];
        };
    }[];
}
declare class TendermintWSClient {
    wsEndpoint: string;
    subscriptionQuery: string;
    filterFiles: FilterFiles;
    walletAddresses: string[];
    maxReconnectAttempts: number;
    reconnectDelay: number;
    wasmContractFilter: string[] | null;
    eventFilters: {
        type?: string | string[];
        attributes?: {
            [key: string]: string | string[];
        };
    }[];
    ws: WebSocket | null;
    filters: {
        [key: string]: string[];
    };
    reconnectAttempts: number;
    constructor({ wsEndpoint, subscriptionQuery, filterFiles, walletAddresses, maxReconnectAttempts, reconnectDelay, wasmContractFilter, eventFilters, }?: TendermintWSClientConfig);
    loadFilters(): Promise<void>;
    connect(): Promise<void>;
    handleReconnect(): void;
    subscribe(): void;
    decodeBase64(str: string): string;
    filterUnwanted(message: any): boolean;
    getEventsFromMessage(message: any): any[] | null;
    extractTransferData(events: any[]): {
        senders: string[];
        receivers: string[];
        recipients: string[];
        spenders: string[];
        amounts: string[];
    };
    matchesFilters(events: any[]): boolean;
    handleMessage(message: any): void;
    disconnect(): void;
}
export default TendermintWSClient;
