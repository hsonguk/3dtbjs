import { B3dmError, B3DM_ERROR_CODES } from '../utils/B3dmConstants.js';

/**
 * Processor for B3DM batch table data
 * Handles property access, data transformation, and batch-specific processing
 */
export class BatchProcessor {
    constructor(options = {}) {
        this.options = {
            enableCaching: true,
            processHierarchicalData: true,
            optimizePropertyAccess: true,
            validatePropertyAccess: true,
            maxCacheSize: 1000,
            ...options
        };
        
        // Cache for processed batch data
        this.propertyCache = new Map();
        this.batchCache = new Map();
    }

    /**
     * Processes batch table data into an optimized format
     * @param {BatchTable} batchTable - The parsed batch table
     * @returns {Promise<Object>} Processed batch data
     */
    async process(batchTable) {
        if (!batchTable) {
            return null;
        }

        try {
            const processedData = {
                batchLength: batchTable.getBatchLength(),
                propertyCount: batchTable.getPropertyNames().length,
                properties: await this.processProperties(batchTable),
                accessors: this.createPropertyAccessors(batchTable),
                metadata: this.extractBatchMetadata(batchTable),
                statistics: await this.calculateBatchStatistics(batchTable)
            };

            // Optimize property access if enabled
            if (this.options.optimizePropertyAccess) {
                processedData.optimizedAccessors = this.createOptimizedAccessors(batchTable, processedData);
            }

            // Validate processed data
            if (this.options.validatePropertyAccess) {
                this.validateProcessedData(processedData, batchTable);
            }

            return processedData;

        } catch (error) {
            if (error instanceof B3dmError) {
                throw error;
            }
            
            throw new B3dmError(
                `Failed to process batch table: ${error.message}`,
                B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                { originalError: error }
            );
        }
    }

    /**
     * Processes all properties in the batch table
     * @param {BatchTable} batchTable - The batch table
     * @returns {Promise<Object>} Processed properties
     * @private
     */
    async processProperties(batchTable) {
        const properties = {};
        const propertyNames = batchTable.getPropertyNames();

        for (const propertyName of propertyNames) {
            try {
                const processedProperty = await this.processProperty(batchTable, propertyName);
                if (processedProperty) {
                    properties[propertyName] = processedProperty;
                }
            } catch (error) {
                console.warn(`Failed to process batch property '${propertyName}':`, error.message);
                // Continue processing other properties
            }
        }

        return properties;
    }

    /**
     * Processes a single batch property
     * @param {BatchTable} batchTable - The batch table
     * @param {string} propertyName - Name of the property
     * @returns {Promise<Object>} Processed property data
     * @private
     */
    async processProperty(batchTable, propertyName) {
        // Check cache first
        const cacheKey = `${propertyName}_${batchTable.getBatchLength()}`;
        if (this.options.enableCaching && this.propertyCache.has(cacheKey)) {
            return this.propertyCache.get(cacheKey);
        }

        const propertyDef = batchTable.getPropertyDefinition(propertyName);
        if (!propertyDef) {
            return null;
        }

        const processedProperty = {
            name: propertyName,
            type: this.determinePropertyType(propertyDef),
            isConstant: !propertyDef.usesBinaryData(),
            isBinary: propertyDef.usesBinaryData(),
            length: propertyDef.getLength(),
            accessor: this.createPropertyAccessor(batchTable, propertyName)
        };

        // Process property values based on type
        if (processedProperty.isConstant) {
            processedProperty.value = propertyDef.getValue(0);
            processedProperty.allValues = [processedProperty.value];
        } else {
            // For binary properties, create efficient access patterns
            processedProperty.binaryInfo = {
                byteOffset: propertyDef.byteOffset,
                componentType: propertyDef.componentType,
                type: propertyDef.type,
                count: propertyDef.count
            };

            // Pre-load values if the property is small enough
            if (processedProperty.length <= 1000) {
                processedProperty.allValues = this.preloadPropertyValues(propertyDef);
            }
        }

        // Calculate statistics for numeric properties
        if (this.isNumericProperty(processedProperty)) {
            processedProperty.statistics = await this.calculatePropertyStatistics(processedProperty, propertyDef);
        }

        // Handle hierarchical data if enabled
        if (this.options.processHierarchicalData) {
            processedProperty.hierarchy = this.analyzePropertyHierarchy(processedProperty);
        }

        // Cache the result
        if (this.options.enableCaching && this.propertyCache.size < this.options.maxCacheSize) {
            this.propertyCache.set(cacheKey, processedProperty);
        }

        return processedProperty;
    }

    /**
     * Creates property accessors for efficient data access
     * @param {BatchTable} batchTable - The batch table
     * @returns {Object} Property accessors
     * @private
     */
    createPropertyAccessors(batchTable) {
        const accessors = {};
        const propertyNames = batchTable.getPropertyNames();

        for (const propertyName of propertyNames) {
            accessors[propertyName] = this.createPropertyAccessor(batchTable, propertyName);
        }

        // Create batch accessor for getting all properties of a batch
        accessors._getBatch = (batchId) => {
            const batch = {};
            for (const propertyName of propertyNames) {
                batch[propertyName] = batchTable.getProperty(batchId, propertyName);
            }
            return batch;
        };

        // Create bulk accessor for getting property values for multiple batches
        accessors._getBulkProperty = (propertyName, batchIds) => {
            return batchIds.map(batchId => batchTable.getProperty(batchId, propertyName));
        };

        return accessors;
    }

    /**
     * Creates an optimized accessor for a specific property
     * @param {BatchTable} batchTable - The batch table
     * @param {string} propertyName - Name of the property
     * @returns {Function} Property accessor function
     * @private
     */
    createPropertyAccessor(batchTable, propertyName) {
        const propertyDef = batchTable.getPropertyDefinition(propertyName);
        
        if (!propertyDef) {
            return () => undefined;
        }

        // For constant properties, return the constant value
        if (!propertyDef.usesBinaryData()) {
            const constantValue = propertyDef.getValue(0);
            return () => constantValue;
        }

        // For binary properties, create optimized accessor
        return (batchId) => {
            try {
                return propertyDef.getValue(batchId);
            } catch (error) {
                console.warn(`Error accessing property '${propertyName}' for batch ${batchId}:`, error.message);
                return undefined;
            }
        };
    }

    /**
     * Creates optimized accessors for frequently accessed properties
     * @param {BatchTable} batchTable - The batch table
     * @param {Object} processedData - The processed data
     * @returns {Object} Optimized accessors
     * @private
     */
    createOptimizedAccessors(batchTable, processedData) {
        const optimized = {};

        // Create optimized accessors for small properties (pre-loaded)
        for (const [propertyName, propertyData] of Object.entries(processedData.properties)) {
            if (propertyData.allValues && propertyData.allValues.length <= 1000) {
                optimized[propertyName] = (batchId) => {
                    return batchId < propertyData.allValues.length ? propertyData.allValues[batchId] : undefined;
                };
            }
        }

        // Create batch range accessor for efficient bulk operations
        optimized._getBatchRange = (startBatchId, endBatchId) => {
            const batches = [];
            for (let i = startBatchId; i <= endBatchId && i < processedData.batchLength; i++) {
                batches.push(processedData.accessors._getBatch(i));
            }
            return batches;
        };

        // Create filtered accessor
        optimized._getFilteredBatches = (filterFn) => {
            const filteredBatches = [];
            for (let i = 0; i < processedData.batchLength; i++) {
                const batch = processedData.accessors._getBatch(i);
                if (filterFn(batch, i)) {
                    filteredBatches.push({ batchId: i, data: batch });
                }
            }
            return filteredBatches;
        };

        return optimized;
    }

    /**
     * Extracts metadata from the batch table
     * @param {BatchTable} batchTable - The batch table
     * @returns {Object} Batch metadata
     * @private
     */
    extractBatchMetadata(batchTable) {
        const propertyNames = batchTable.getPropertyNames();
        const metadata = {
            batchLength: batchTable.getBatchLength(),
            propertyCount: propertyNames.length,
            properties: propertyNames,
            hasBinaryData: !!batchTable.binary,
            binarySize: batchTable.binary ? batchTable.binary.byteLength : 0,
            propertyTypes: {}
        };

        // Analyze property types
        for (const propertyName of propertyNames) {
            const propertyDef = batchTable.getPropertyDefinition(propertyName);
            metadata.propertyTypes[propertyName] = {
                isConstant: !propertyDef.usesBinaryData(),
                isBinary: propertyDef.usesBinaryData(),
                length: propertyDef.getLength()
            };
        }

        return metadata;
    }

    /**
     * Calculates statistics for the batch table
     * @param {BatchTable} batchTable - The batch table
     * @returns {Promise<Object>} Batch statistics
     * @private
     */
    async calculateBatchStatistics(batchTable) {
        const statistics = {
            totalBatches: batchTable.getBatchLength(),
            totalProperties: batchTable.getPropertyNames().length,
            constantProperties: 0,
            binaryProperties: 0,
            numericProperties: 0,
            memoryUsage: this.estimateMemoryUsage(batchTable)
        };

        const propertyNames = batchTable.getPropertyNames();
        for (const propertyName of propertyNames) {
            const propertyDef = batchTable.getPropertyDefinition(propertyName);
            
            if (!propertyDef.usesBinaryData()) {
                statistics.constantProperties++;
            } else {
                statistics.binaryProperties++;
            }

            // Check if property is numeric
            if (this.isNumericPropertyDef(propertyDef)) {
                statistics.numericProperties++;
            }
        }

        return statistics;
    }

    /**
     * Pre-loads property values for small properties
     * @param {BatchProperty} propertyDef - The property definition
     * @returns {Array} Pre-loaded values
     * @private
     */
    preloadPropertyValues(propertyDef) {
        const values = [];
        const length = propertyDef.getLength();
        
        for (let i = 0; i < length; i++) {
            try {
                values.push(propertyDef.getValue(i));
            } catch (error) {
                console.warn(`Error pre-loading property value at index ${i}:`, error.message);
                values.push(undefined);
            }
        }
        
        return values;
    }

    /**
     * Determines the type of a property
     * @param {BatchProperty} propertyDef - The property definition
     * @returns {string} Property type
     * @private
     */
    determinePropertyType(propertyDef) {
        if (!propertyDef.usesBinaryData()) {
            const value = propertyDef.getValue(0);
            return typeof value;
        }

        return propertyDef.type || 'unknown';
    }

    /**
     * Checks if a processed property contains numeric data
     * @param {Object} processedProperty - The processed property
     * @returns {boolean} True if numeric
     * @private
     */
    isNumericProperty(processedProperty) {
        if (processedProperty.isConstant) {
            return typeof processedProperty.value === 'number';
        }

        // Check binary property type
        const numericTypes = ['SCALAR', 'VEC2', 'VEC3', 'VEC4'];
        return numericTypes.includes(processedProperty.binaryInfo?.type);
    }

    /**
     * Checks if a property definition is numeric
     * @param {BatchProperty} propertyDef - The property definition
     * @returns {boolean} True if numeric
     * @private
     */
    isNumericPropertyDef(propertyDef) {
        if (!propertyDef.usesBinaryData()) {
            const value = propertyDef.getValue(0);
            return typeof value === 'number';
        }

        const numericComponentTypes = [5120, 5121, 5122, 5123, 5124, 5125, 5126];
        return numericComponentTypes.includes(propertyDef.componentType);
    }

    /**
     * Calculates statistics for a numeric property
     * @param {Object} processedProperty - The processed property
     * @param {BatchProperty} propertyDef - The property definition
     * @returns {Promise<Object>} Property statistics
     * @private
     */
    async calculatePropertyStatistics(processedProperty, propertyDef) {
        if (processedProperty.isConstant) {
            const value = processedProperty.value;
            return {
                min: value,
                max: value,
                mean: value,
                count: 1,
                sum: value,
                standardDeviation: 0
            };
        }

        // For binary properties, calculate statistics from sample or all values
        const sampleSize = Math.min(processedProperty.length, 10000);
        const values = [];
        
        for (let i = 0; i < sampleSize; i++) {
            const index = Math.floor((i / sampleSize) * processedProperty.length);
            try {
                const value = propertyDef.getValue(index);
                if (typeof value === 'number' && isFinite(value)) {
                    values.push(value);
                } else if (Array.isArray(value)) {
                    // For vector types, include all components
                    values.push(...value.filter(v => typeof v === 'number' && isFinite(v)));
                }
            } catch (error) {
                // Skip invalid values
            }
        }

        if (values.length === 0) {
            return null;
        }

        const min = Math.min(...values);
        const max = Math.max(...values);
        const sum = values.reduce((a, b) => a + b, 0);
        const mean = sum / values.length;
        
        const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
        const standardDeviation = Math.sqrt(variance);

        return {
            min,
            max,
            mean,
            sum,
            count: values.length,
            standardDeviation,
            range: max - min,
            isSample: sampleSize < processedProperty.length
        };
    }

    /**
     * Analyzes property hierarchy for hierarchical data
     * @param {Object} processedProperty - The processed property
     * @returns {Object|null} Hierarchy information
     * @private
     */
    analyzePropertyHierarchy(processedProperty) {
        // This is a placeholder for hierarchical data analysis
        // In a full implementation, this would analyze parent-child relationships
        // in batch table data
        return null;
    }

    /**
     * Estimates memory usage for the batch table
     * @param {BatchTable} batchTable - The batch table
     * @returns {Object} Memory usage estimate
     * @private
     */
    estimateMemoryUsage(batchTable) {
        let totalMemory = 0;
        
        // JSON data
        const jsonSize = JSON.stringify(batchTable.json).length * 2; // UTF-16
        totalMemory += jsonSize;
        
        // Binary data
        const binarySize = batchTable.binary ? batchTable.binary.byteLength : 0;
        totalMemory += binarySize;
        
        // Processing overhead (rough estimate)
        const propertyCount = batchTable.getPropertyNames().length;
        const processingOverhead = propertyCount * 1000; // 1KB per property
        totalMemory += processingOverhead;

        return {
            json: jsonSize,
            binary: binarySize,
            processing: processingOverhead,
            total: totalMemory,
            formatted: this.formatBytes(totalMemory)
        };
    }

    /**
     * Formats bytes into human-readable string
     * @param {number} bytes - Number of bytes
     * @returns {string} Formatted string
     * @private
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Validates the processed data
     * @param {Object} processedData - The processed data
     * @param {BatchTable} batchTable - The original batch table
     * @private
     */
    validateProcessedData(processedData, batchTable) {
        // Validate batch length consistency
        if (processedData.batchLength !== batchTable.getBatchLength()) {
            throw new B3dmError(
                `Batch length mismatch: processed ${processedData.batchLength}, original ${batchTable.getBatchLength()}`,
                B3DM_ERROR_CODES.BATCH_TABLE_ERROR
            );
        }

        // Validate property count
        if (processedData.propertyCount !== batchTable.getPropertyNames().length) {
            throw new B3dmError(
                `Property count mismatch: processed ${processedData.propertyCount}, original ${batchTable.getPropertyNames().length}`,
                B3DM_ERROR_CODES.BATCH_TABLE_ERROR
            );
        }

        // Test a few random property accesses
        const propertyNames = batchTable.getPropertyNames();
        if (propertyNames.length > 0 && processedData.batchLength > 0) {
            const testProperty = propertyNames[0];
            const testBatchId = Math.floor(processedData.batchLength / 2);
            
            try {
                const originalValue = batchTable.getProperty(testBatchId, testProperty);
                const processedValue = processedData.accessors[testProperty](testBatchId);
                
                if (originalValue !== processedValue) {
                    console.warn(`Property accessor validation warning: values don't match for ${testProperty}[${testBatchId}]`);
                }
            } catch (error) {
                console.warn(`Property accessor validation failed:`, error.message);
            }
        }
    }

    /**
     * Clears all caches
     */
    clearCache() {
        this.propertyCache.clear();
        this.batchCache.clear();
    }

    /**
     * Gets cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return {
            propertyCache: {
                size: this.propertyCache.size,
                maxSize: this.options.maxCacheSize
            },
            batchCache: {
                size: this.batchCache.size,
                maxSize: this.options.maxCacheSize
            }
        };
    }
}