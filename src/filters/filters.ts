// src/filters.ts
import { promises as fs } from 'fs';
import path from 'path';
import { DecodedTendermintEvent, DecodedTxResult } from '../core/events.js';

export interface FilterFiles {
  [key: string]: string;
}

export interface EventFilter {
  type?: string | string[];
  attributes?: {
    [key: string]: string | string[];
  };
}

export interface FilterConfig {
  filterFiles?: FilterFiles;
  walletAddresses?: string | string[];
  wasmContractFilter?: string | string[] | null;
  eventFilters?: EventFilter[];
}

export class FilterManager {
  private filters: Record<string, string[]> = {};
  private walletAddresses: string[] = [];
  private wasmContractFilter: string[] | null = null;
  private eventFilters: EventFilter[] = [];

  constructor(config: FilterConfig = {}) {
    // Convert walletAddresses to array if string is provided
    this.walletAddresses = typeof config.walletAddresses === 'string'
      ? [config.walletAddresses]
      : Array.isArray(config.walletAddresses) ? config.walletAddresses : [];

    // Convert wasmContractFilter to array if string is provided
    this.wasmContractFilter = config.wasmContractFilter === null
      ? null
      : typeof config.wasmContractFilter === 'string'
        ? [config.wasmContractFilter]
        : Array.isArray(config.wasmContractFilter) ? config.wasmContractFilter : null;

    // Set event filters
    this.eventFilters = config.eventFilters || [];
  }

  /**
   * Load filters from JSON files
   */
  async loadFilters(filterFiles: FilterFiles = {}): Promise<void> {
    try {
      for (const [key, filePath] of Object.entries(filterFiles)) {
        try {
          // Read the file from the filesystem
          const fileContent = await fs.readFile(path.resolve(process.cwd(), filePath), 'utf-8');
          const filterValues = JSON.parse(fileContent);

          if (Array.isArray(filterValues)) {
            // Simply use the address values as provided.
            this.filters[key] = filterValues;
          } else {
            throw new Error(`Filter file ${filePath} must contain an array`);
          }
        } catch (error) {
          console.error(`Error loading filter file ${filePath}:`, error);
          throw error;
        }
      }
    } catch (error) {
      console.error('Error loading filters:', error);
      throw error;
    }
  }

  /**
   * Check if a decoded transaction matches WASM contract filter
   */
  private checkWasmContractFilter(decodedTx: DecodedTxResult): boolean {
    if (!this.wasmContractFilter) return true;

    const matchingEvents = decodedTx.decodedEvents.filter(event => {
      if (event.type === 'message') {
        const actions = event.attributes['action'] || [];
        const contracts = event.attributes['contract'] || [];

        return actions.some(action => action.includes('wasm')) &&
               contracts.some(contract => this.wasmContractFilter!.includes(contract));
      }
      return false;
    });

    return matchingEvents.length > 0;
  }

  /**
   * Check if a decoded transaction matches wallet address filter
   */
  private checkWalletAddressFilter(decodedTx: DecodedTxResult): { matches: boolean, matchDetails: any[] } {
    if (this.walletAddresses.length === 0) return { matches: true, matchDetails: [] };

    const matchDetails: Array<{ action: string; role: string; address: string }> = [];

    decodedTx.decodedEvents.forEach(event => {
      if (event.type === 'message') {
        const actions = event.attributes['action'] || [];
        
        actions.forEach(action => {
          if (action.startsWith('/cosmos.staking.') || 
              action.startsWith('/cosmos.distribution.') ||
              action.startsWith('/ibc.') ||
              action.includes('wasm')) {
            
            // Check for wallet addresses in relevant attributes
            const relevantKeys = ['sender', 'recipient', 'delegator', 'validator', 'spender'];
            
            relevantKeys.forEach(key => {
              const values = event.attributes[key] || [];
              
              values.forEach(value => {
                // Check if any of our watched wallet addresses is involved
                const matchingWallet = this.walletAddresses.find(address => value === address);
                
                if (matchingWallet) {
                  matchDetails.push({
                    action,
                    role: key,
                    address: matchingWallet
                  });
                }
              });
            });
          }
        });
      }
    });

    return { 
      matches: matchDetails.length > 0,
      matchDetails
    };
  }

  /**
   * Check if a decoded transaction matches loaded JSON filters
   */
  private checkJsonFilters(decodedTx: DecodedTxResult): boolean {
    if (Object.keys(this.filters).length === 0) return true;
    
    return decodedTx.decodedEvents.some(event => {
      return Object.entries(this.filters).some(([filterKey, filterValues]) => {
        const attributeValues = event.attributes[filterKey] || [];
        // Also check 'receiver' if filter is for 'recipient'
        const receiverValues = filterKey === 'recipient' ? (event.attributes['receiver'] || []) : [];
        
        return attributeValues.some(value => filterValues.includes(value)) ||
               receiverValues.some(value => filterValues.includes(value));
      });
    });
  }

  /**
   * Check if a decoded transaction matches custom event filters
   */
  private checkEventFilters(decodedTx: DecodedTxResult): boolean {
    if (this.eventFilters.length === 0) return true;
    
    return decodedTx.decodedEvents.some(event => {
      return this.eventFilters.some(filter => {
        // Check event type
        if (filter.type) {
          const types = Array.isArray(filter.type) ? filter.type : [filter.type];
          if (!types.includes(event.type)) {
            return false;
          }
        }
        
        // Check event attributes
        if (filter.attributes && Object.keys(filter.attributes).length > 0) {
          return Object.entries(filter.attributes).some(([attrKey, attrValues]) => {
            const eventAttrValues = event.attributes[attrKey] || [];
            const attrValuesList = Array.isArray(attrValues) ? attrValues : [attrValues];
            
            return eventAttrValues.some(value => attrValuesList.includes(value));
          });
        }
        
        // If we only checked for type and no attributes were specified, it's a match
        return filter.attributes ? false : true;
      });
    });
  }

  /**
   * Apply all filters to a decoded transaction
   */
  applyFilters(decodedTx: DecodedTxResult): { 
    passed: boolean; 
    matchedFilters: { 
      filterType: string; 
      matches: any;
    }[] 
  } {
    const matchedFilters: { filterType: string; matches: any; }[] = [];
    
    // Apply WASM contract filter
    const wasmMatch = this.checkWasmContractFilter(decodedTx);
    if (this.wasmContractFilter && wasmMatch) {
      matchedFilters.push({ 
        filterType: 'wasmContract', 
        matches: { contractAddresses: this.wasmContractFilter } 
      });
    }
    
    // Apply wallet address filter
    const { matches: walletMatch, matchDetails } = this.checkWalletAddressFilter(decodedTx);
    if (this.walletAddresses.length > 0 && walletMatch) {
      matchedFilters.push({ 
        filterType: 'walletAddress', 
        matches: matchDetails 
      });
    }
    
    // Apply JSON filters
    const jsonMatch = this.checkJsonFilters(decodedTx);
    if (Object.keys(this.filters).length > 0 && jsonMatch) {
      matchedFilters.push({ 
        filterType: 'jsonFilter', 
        matches: this.filters 
      });
    }
    
    // Apply event filters
    const eventMatch = this.checkEventFilters(decodedTx);
    if (this.eventFilters.length > 0 && eventMatch) {
      matchedFilters.push({ 
        filterType: 'eventFilter', 
        matches: this.eventFilters 
      });
    }
    
    // Determine if all applicable filters have passed
    let passed = true;
    
    // If any filter type has been configured but didn't match, fail
    if (this.wasmContractFilter && !wasmMatch) passed = false;
    if (this.walletAddresses.length > 0 && !walletMatch) passed = false;
    if (Object.keys(this.filters).length > 0 && !jsonMatch) passed = false;
    if (this.eventFilters.length > 0 && !eventMatch) passed = false;
    
    return { passed, matchedFilters };
  }
}