import { B3dmError, B3DM_ERROR_CODES } from '../utils/B3dmConstants.js';

/**
 * Efficient property accessor for batch data queries
 * Provides optimized access patterns for frequently accessed properties
 */
export class PropertyAccessor {
    constructor(batchTable, options = {}) {
        this.batchTable = batchTable;
        this.options = {
            enableCaching: true,
            cacheSize: 1000,
            preloadSmallProperties: true,
            smallPropertyThreshold: 100,
            enableStatistics: false,
            ...options
        };

        // Property caches
        this.propertyCache = new Map();
        this.valueCache = new Map();
        this.accessStats = new Map();

        // Initialize optimized accessors
        this.initializeAccessors();
    }

    /**
     * Initializes optimized property accessors
     * @private
     */
    initializeAccessors() {
        if (!this.batchTable) return;

        const propertyNames = this.batchTable.getPropertyNames();
        
        for (const propertyName of propertyNames) {
            const propertyDef = this.batchTable.getPropertyDefinition(propertyName);
            
            if (propertyDef) {
                // Pre-load small properties if enabled
                if (this.options.preloadSmallProperties && 
                    propertyDef.getLength() <= this.options.smallPropertyThreshold) {
                    this.preloadProperty(propertyName, propertyDef);
                }

                // Initialize access statistics
                if (this.options.enableStatistics) {
                    this.accessStats.set(propertyName, {
                        accessCount: 0,
                        lastAccessed: 0,
                        cacheHits: 0,
                        cacheMisses: 0
                    });
                }
            }
        }
    }

    /**
     * Gets a property value for a specific batch ID
     * @param {number} batchId - The batch ID
     * @param {string} propertyName - The property name
     * @returns {*} The property value
     */
    getProperty(batchId, propertyName) {
        this.updateAccessStats(propertyName);

        // Check value cache first
        const cacheKey = `${propertyName}_${batchId}`;
        if (this.options.enableCaching && this.valueCache.has(cacheKey)) {
            this.updateCacheStats(propertyName, true);
            return this.valueCache.get(cacheKey);
        }

        // Check if property is pre-loaded
        if (this.propertyCache.has(propertyName)) {
            const preloadedValues = this.propertyCache.get(propertyName);
            const value = batchId < preloadedValues.length ? preloadedValues[batchId] : undefined;
            this.cacheValue(cacheKey, value);
            this.updateCacheStats(propertyName, true);
            return value;
        }

        // Get value from batch table
        try {
            const value = this.batchTable.getProperty(batchId, propertyName);
            this.cacheValue(cacheKey, value);
            this.updateCacheStats(propertyName, false);
            return value;
        } catch (error) {
            throw new B3dmError(
                `Failed to access property '${propertyName}' for batch ${batchId}: ${error.message}`,
                B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                { propertyName, batchId, originalError: error }
            );
        }
    }

    /**
     * Gets multiple property values for a batch ID
     * @param {number} batchId - The batch ID
     * @param {Array<string>} propertyNames - Array of property names
     * @returns {Object} Object with property name -> value mappings
     */
    getProperties(batchId, propertyNames) {
        const result = {};
        
        for (const propertyName of propertyNames) {
            result[propertyName] = this.getProperty(batchId, propertyName);
        }
        
        return result;
    }

    /**
     * Gets all properties for a batch ID
     * @param {number} batchId - The batch ID
     * @returns {Object} Object with all property values
     */
    getBatch(batchId) {
        if (!this.batchTable) return {};

        const propertyNames = this.batchTable.getPropertyNames();
        return this.getProperties(batchId, propertyNames);
    }

    /**
     * Gets a property value for multiple batch IDs
     * @param {Array<number>} batchIds - Array of batch IDs
     * @param {string} propertyName - The property name
     * @returns {Array} Array of property values
     */
    getBulkProperty(batchIds, propertyName) {
        return batchIds.map(batchId => this.getProperty(batchId, propertyName));
    }

    /**
     * Gets multiple batches efficiently
     * @param {Array<number>} batchIds - Array of batch IDs
     * @param {Array<string>} propertyNames - Optional array of property names to include
     * @returns {Array<Object>} Array of batch objects
     */
    getBulkBatches(batchIds, propertyNames = null) {
        const targetProperties = propertyNames || (this.batchTable ? this.batchTable.getPropertyNames() : []);
        
        return batchIds.map(batchId => {
            const batch = { _batchId: batchId };
            for (const propertyName of targetProperties) {
                batch[propertyName] = this.getProperty(batchId, propertyName);
            }
            return batch;
        });
    }

    /**
     * Gets batches within a range
     * @param {number} startBatchId - Start batch ID (inclusive)
     * @param {number} endBatchId - End batch ID (inclusive)
     * @param {Array<string>} propertyNames - Optional array of property names to include
     * @returns {Array<Object>} Array of batch objects
     */
    getBatchRange(startBatchId, endBatchId, propertyNames = null) {
        const batchIds = [];
        for (let i = startBatchId; i <= endBatchId; i++) {
            batchIds.push(i);
        }
        return this.getBulkBatches(batchIds, propertyNames);
    }

    /**
     * Filters batches based on a predicate function
     * @param {Function} predicate - Function that takes (batchData, batchId) and returns boolean
     * @param {Array<string>} propertyNames - Optional array of property names to include
     * @returns {Array<Object>} Array of filtered batch objects
     */
    filterBatches(predicate, propertyNames = null) {
        if (!this.batchTable) return [];

        const batchLength = this.batchTable.getBatchLength();
        const filteredBatches = [];
        
        for (let batchId = 0; batchId < batchLength; batchId++) {
            const batchData = this.getBatch(batchId);
            if (predicate(batchData, batchId)) {
                if (propertyNames) {
                    const filteredBatch = { _batchId: batchId };
                    for (const propertyName of propertyNames) {
                        filteredBatch[propertyName] = batchData[propertyName];
                    }
                    filteredBatches.push(filteredBatch);
                } else {
                    batchData._batchId = batchId;
                    filteredBatches.push(batchData);
                }
            }
        }
        
        return filteredBatches;
    }

    /**
     * Finds batches where a property matches a specific value
     * @param {string} propertyName - The property name
     * @param {*} value - The value to match
     * @param {Function} compareFn - Optional comparison function
     * @returns {Array<Object>} Array of matching batch objects
     */
    findBatchesByProperty(propertyName, value, compareFn = null) {
        const compare = compareFn || ((a, b) => a === b);
        
        return this.filterBatches((batchData) => {
            return compare(batchData[propertyName], value);
        });
    }

    /**
     * Gets unique values for a property across all batches
     * @param {string} propertyName - The property name
     * @returns {Array} Array of unique values
     */
    getUniquePropertyValues(propertyName) {
        if (!this.batchTable) return [];

        const batchLength = this.batchTable.getBatchLength();
        const uniqueValues = new Set();
        
        for (let batchId = 0; batchId < batchLength; batchId++) {
            const value = this.getProperty(batchId, propertyName);
            if (value !== undefined && value !== null) {
                uniqueValues.add(value);
            }
        }
        
        return Array.from(uniqueValues);
    }

    /**
     * Groups batches by property value
     * @param {string} propertyName - The property name to group by
     * @returns {Map} Map of property value -> array of batch objects
     */
    groupBatchesByProperty(propertyName) {
        if (!this.batchTable) return new Map();

        const groups = new Map();
        const batchLength = this.batchTable.getBatchLength();
        
        for (let batchId = 0; batchId < batchLength; batchId++) {
            const value = this.getProperty(batchId, propertyName);
            const batchData = this.getBatch(batchId);
            batchData._batchId = batchId;
            
            if (!groups.has(value)) {
                groups.set(value, []);
            }
            groups.get(value).push(batchData);
        }
        
        return groups;
    }

    /**
     * Pre-loads a property's values into cache
     * @param {string} propertyName - The property name
     * @param {Object} propertyDef - The property definition
     * @private
     */
    preloadProperty(propertyName, propertyDef) {
        try {
            const values = [];
            const length = propertyDef.getLength();
            
            for (let i = 0; i < length; i++) {
                values.push(propertyDef.getValue(i));
            }
            
            this.propertyCache.set(propertyName, values);
        } catch (error) {
            console.warn(`Failed to preload property '${propertyName}':`, error.message);
        }
    }

    /**
     * Caches a property value
     * @param {string} cacheKey - The cache key
     * @param {*} value - The value to cache
     * @private
     */
    cacheValue(cacheKey, value) {
        if (!this.options.enableCaching) return;

        // Implement LRU cache behavior
        if (this.valueCache.size >= this.options.cacheSize) {
            const firstKey = this.valueCache.keys().next().value;
            this.valueCache.delete(firstKey);
        }
        
        this.valueCache.set(cacheKey, value);
    }

    /**
     * Updates access statistics
     * @param {string} propertyName - The property name
     * @private
     */
    updateAccessStats(propertyName) {
        if (!this.options.enableStatistics) return;

        const stats = this.accessStats.get(propertyName);
        if (stats) {
            stats.accessCount++;
            stats.lastAccessed = Date.now();
        }
    }

    /**
     * Updates cache statistics
     * @param {string} propertyName - The property name
     * @param {boolean} isHit - Whether it was a cache hit
     * @private
     */
    updateCacheStats(propertyName, isHit) {
        if (!this.options.enableStatistics) return;

        const stats = this.accessStats.get(propertyName);
        if (stats) {
            if (isHit) {
                stats.cacheHits++;
            } else {
                stats.cacheMisses++;
            }
        }
    }

    /**
     * Gets access statistics for all properties
     * @returns {Object} Statistics object
     */
    getAccessStats() {
        if (!this.options.enableStatistics) {
            return { message: 'Statistics not enabled' };
        }

        const stats = {};
        for (const [propertyName, propertyStats] of this.accessStats) {
            const total = propertyStats.cacheHits + propertyStats.cacheMisses;
            stats[propertyName] = {
                ...propertyStats,
                cacheHitRate: total > 0 ? (propertyStats.cacheHits / total * 100).toFixed(2) + '%' : '0%'
            };
        }
        
        return {
            properties: stats,
            cacheSize: this.valueCache.size,
            maxCacheSize: this.options.cacheSize,
            preloadedProperties: this.propertyCache.size
        };
    }

    /**
     * Clears all caches
     */
    clearCache() {
        this.propertyCache.clear();
        this.valueCache.clear();
        
        if (this.options.enableStatistics) {
            for (const stats of this.accessStats.values()) {
                stats.cacheHits = 0;
                stats.cacheMisses = 0;
            }
        }
    }

    /**
     * Gets information about available properties
     * @returns {Object} Property information
     */
    getPropertyInfo() {
        if (!this.batchTable) {
            return { properties: [], batchLength: 0 };
        }

        const propertyNames = this.batchTable.getPropertyNames();
        const properties = {};
        
        for (const propertyName of propertyNames) {
            const propertyDef = this.batchTable.getPropertyDefinition(propertyName);
            properties[propertyName] = {
                length: propertyDef.getLength(),
                usesBinaryData: propertyDef.usesBinaryData(),
                isPreloaded: this.propertyCache.has(propertyName)
            };
        }
        
        return {
            properties,
            propertyNames,
            batchLength: this.batchTable.getBatchLength()
        };
    }

    /**
     * Creates a query builder for complex batch queries
     * @returns {BatchQueryBuilder} Query builder instance
     */
    createQuery() {
        return new BatchQueryBuilder(this);
    }
}

/**
 * Query builder for complex batch table queries
 */
export class BatchQueryBuilder {
    constructor(propertyAccessor) {
        this.accessor = propertyAccessor;
        this.filters = [];
        this.selectedProperties = null;
        this.sortBy = null;
        this.sortOrder = 'asc';
        this.limitCount = null;
        this.offsetCount = 0;
    }

    /**
     * Selects specific properties to include in results
     * @param {...string} propertyNames - Property names to select
     * @returns {BatchQueryBuilder} This builder for chaining
     */
    select(...propertyNames) {
        this.selectedProperties = propertyNames;
        return this;
    }

    /**
     * Adds a filter condition
     * @param {string} propertyName - Property name to filter on
     * @param {*} value - Value to match
     * @param {Function} compareFn - Optional comparison function
     * @returns {BatchQueryBuilder} This builder for chaining
     */
    where(propertyName, value, compareFn = null) {
        const compare = compareFn || ((a, b) => a === b);
        this.filters.push((batchData) => compare(batchData[propertyName], value));
        return this;
    }

    /**
     * Adds a custom filter function
     * @param {Function} filterFn - Filter function that takes (batchData, batchId) and returns boolean
     * @returns {BatchQueryBuilder} This builder for chaining
     */
    filter(filterFn) {
        this.filters.push(filterFn);
        return this;
    }

    /**
     * Sorts results by a property
     * @param {string} propertyName - Property name to sort by
     * @param {string} order - Sort order ('asc' or 'desc')
     * @returns {BatchQueryBuilder} This builder for chaining
     */
    orderBy(propertyName, order = 'asc') {
        this.sortBy = propertyName;
        this.sortOrder = order;
        return this;
    }

    /**
     * Limits the number of results
     * @param {number} count - Maximum number of results
     * @returns {BatchQueryBuilder} This builder for chaining
     */
    limit(count) {
        this.limitCount = count;
        return this;
    }

    /**
     * Skips a number of results
     * @param {number} count - Number of results to skip
     * @returns {BatchQueryBuilder} This builder for chaining
     */
    offset(count) {
        this.offsetCount = count;
        return this;
    }

    /**
     * Executes the query and returns results
     * @returns {Array<Object>} Query results
     */
    execute() {
        // Apply filters
        let results = this.accessor.filterBatches((batchData, batchId) => {
            return this.filters.every(filter => filter(batchData, batchId));
        }, this.selectedProperties);

        // Apply sorting
        if (this.sortBy) {
            results.sort((a, b) => {
                const aVal = a[this.sortBy];
                const bVal = b[this.sortBy];
                
                let comparison = 0;
                if (aVal < bVal) comparison = -1;
                else if (aVal > bVal) comparison = 1;
                
                return this.sortOrder === 'desc' ? -comparison : comparison;
            });
        }

        // Apply offset and limit
        if (this.offsetCount > 0) {
            results = results.slice(this.offsetCount);
        }
        
        if (this.limitCount !== null) {
            results = results.slice(0, this.limitCount);
        }

        return results;
    }

    /**
     * Gets the count of matching results without returning the data
     * @returns {number} Number of matching results
     */
    count() {
        const results = this.accessor.filterBatches((batchData, batchId) => {
            return this.filters.every(filter => filter(batchData, batchId));
        });
        
        return results.length;
    }
}