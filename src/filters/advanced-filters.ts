// src/advanced-filters.ts
import { DecodedTendermintEvent, DecodedTxResult } from '../core/events.js';

/**
 * Types of pattern matching that can be used in filters
 */
export enum MatchType {
  Exact = 'exact',
  Contains = 'contains',
  StartsWith = 'startsWith',
  EndsWith = 'endsWith',
  Regex = 'regex'
}

/**
 * A single attribute condition for filtering
 */
export interface AttributeCondition {
  key: string;
  value?: string | string[];
  matchType?: MatchType;
  negated?: boolean;
}

/**
 * A complex filter that can combine multiple conditions
 */
export interface AdvancedFilter {
  // Optional name for the filter
  name?: string;
  
  // Event type to match
  eventType?: string | string[];
  
  // Logical combination of conditions
  anyOf?: AttributeCondition[];
  allOf?: AttributeCondition[];
  noneOf?: AttributeCondition[];
  
  // Match conditions on specific message types (Cosmos SDK specific)
  messageType?: string | string[];
  
  // Nested filters for complex logic
  or?: AdvancedFilter[];
  and?: AdvancedFilter[];
  
  // Filter for specific transactions by hash
  txHash?: string | string[];
  
  // Filter events by a numeric range (e.g., block height)
  range?: {
    field: string;
    min?: number;
    max?: number;
  };
}

/**
 * Class to handle advanced filtering of Tendermint events
 */
export class AdvancedFilterEngine {
  private filters: AdvancedFilter[] = [];

  constructor(filters: AdvancedFilter[] = []) {
    this.filters = filters;
  }

  /**
   * Add a new advanced filter
   */
  addFilter(filter: AdvancedFilter): void {
    this.filters.push(filter);
  }

  /**
   * Clear all registered filters
   */
  clearFilters(): void {
    this.filters = [];
  }

  /**
   * Check if a transaction matches any of the registered filters
   */
  matchesAnyFilter(tx: DecodedTxResult): boolean {
    if (this.filters.length === 0) return true;
    return this.filters.some(filter => this.matchesFilter(tx, filter));
  }

  /**
   * Apply all registered filters and return the passing filters
   */
  applyFilters(tx: DecodedTxResult): { 
    passed: boolean; 
    matchedFilters: string[] 
  } {
    if (this.filters.length === 0) return { passed: true, matchedFilters: [] };
    
    const matchedFilters = this.filters
      .filter(filter => this.matchesFilter(tx, filter))
      .map(filter => filter.name || 'unnamed_filter');
    
    return {
      passed: matchedFilters.length > 0,
      matchedFilters
    };
  }

  /**
   * Check if a transaction matches a specific filter
   */
  private matchesFilter(tx: DecodedTxResult, filter: AdvancedFilter): boolean {
    // Check txHash if specified
    if (filter.txHash) {
      const hashes = Array.isArray(filter.txHash) ? filter.txHash : [filter.txHash];
      if (!hashes.includes(tx.txhash)) return false;
    }
    
    // Check range condition if specified
    if (filter.range) {
      const { field, min, max } = filter.range;
      const value = Number(tx[field as keyof DecodedTxResult]);
      
      if (isNaN(value)) return false;
      if (min !== undefined && value < min) return false;
      if (max !== undefined && value > max) return false;
    }
    
    // Check nested OR conditions
    if (filter.or && filter.or.length > 0) {
      if (!filter.or.some((subFilter: AdvancedFilter) => this.matchesFilter(tx, subFilter))) {
        return false;
      }
    }
    
    // Check nested AND conditions
    if (filter.and && filter.and.length > 0) {
      if (!filter.and.every((subFilter: AdvancedFilter) => this.matchesFilter(tx, subFilter))) {
        return false;
      }
    }
    
    // Get matching events based on the filter's event type
    const matchingEvents = this.getMatchingEvents(tx.decodedEvents, filter);
    if (matchingEvents.length === 0) return false;
    
    // Check anyOf conditions - any single match is enough
    if (filter.anyOf && filter.anyOf.length > 0) {
      const anyMatches = matchingEvents.some((event: DecodedTendermintEvent) => 
        filter.anyOf!.some((condition: AttributeCondition) => this.matchesCondition(event, condition))
      );
      if (!anyMatches) return false;
    }
    
    // Check allOf conditions - all must match at least once
    if (filter.allOf && filter.allOf.length > 0) {
      const allMatch = filter.allOf.every((condition: AttributeCondition) => 
        matchingEvents.some((event: DecodedTendermintEvent) => this.matchesCondition(event, condition))
      );
      if (!allMatch) return false;
    }
    
    // Check noneOf conditions - none should match
    if (filter.noneOf && filter.noneOf.length > 0) {
      const noneMatch = !matchingEvents.some((event: DecodedTendermintEvent) => 
        filter.noneOf!.some((condition: AttributeCondition) => this.matchesCondition(event, condition))
      );
      if (!noneMatch) return false;
    }
    
    // Check messageType filter (specific to Cosmos SDK)
    if (filter.messageType) {
      const messageTypes = Array.isArray(filter.messageType) ? filter.messageType : [filter.messageType];
      const messageEvents = matchingEvents.filter((event: DecodedTendermintEvent) => event.type === 'message');
      
      if (messageEvents.length === 0) return false;
      
      const actionAttrMatch = messageEvents.some((event: DecodedTendermintEvent) => {
        const actions = event.attributes['action'] || [];
        return actions.some((action: string) => {
          return messageTypes.some((msgType: string) => action.includes(msgType));
        });
      });
      
      if (!actionAttrMatch) return false;
    }
    
    // If we got here, the filter matches
    return true;
  }

  /**
   * Get events matching a filter's event type
   */
  private getMatchingEvents(events: DecodedTendermintEvent[], filter: AdvancedFilter): DecodedTendermintEvent[] {
    if (!filter.eventType) return events;
    
    const eventTypes = Array.isArray(filter.eventType) ? filter.eventType : [filter.eventType];
    return events.filter(event => eventTypes.includes(event.type));
  }

  /**
   * Check if an event matches a specific attribute condition
   */
  private matchesCondition(event: DecodedTendermintEvent, condition: AttributeCondition): boolean {
    const { key, value, matchType = MatchType.Exact, negated = false } = condition;
    
    // If the key doesn't exist in the event attributes, it's a non-match
    if (!event.attributes[key]) return negated;
    
    // If no value was specified, just checking for key existence
    if (value === undefined) return !negated;
    
    const eventValues = event.attributes[key];
    const valuesToMatch = Array.isArray(value) ? value : [value];
    
    // Check if any of the event values match any of the condition values
    const matches = eventValues.some((eventValue: string) => {
      return valuesToMatch.some((condValue: string) => {
        switch (matchType) {
          case MatchType.Contains:
            return eventValue.includes(condValue);
          case MatchType.StartsWith:
            return eventValue.startsWith(condValue);
          case MatchType.EndsWith:
            return eventValue.endsWith(condValue);
          case MatchType.Regex:
            try {
              return new RegExp(condValue).test(eventValue);
            } catch (error) {
              console.error(`Invalid regex pattern: ${condValue}`, error);
              return false;
            }
          case MatchType.Exact:
          default:
            return eventValue === condValue;
        }
      });
    });
    
    return negated ? !matches : matches;
  }
}