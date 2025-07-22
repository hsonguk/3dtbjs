import { B3dmError, B3DM_ERROR_CODES, FEATURE_TABLE_PROPERTIES } from '../utils/B3dmConstants.js';

/**
 * Processor for B3DM feature table data
 * Handles coordinate transformations, validation, and data preparation
 */
export class FeatureProcessor {
    constructor(options = {}) {
        this.options = {
            validateBatchLength: true,
            applyRtcCenter: true,
            validateCoordinates: true,
            enableCaching: true,
            ...options
        };
        
        // Cache for processed data
        this.cache = new Map();
    }

    /**
     * Processes feature table data into a usable format
     * @param {FeatureTable} featureTable - The parsed feature table
     * @returns {Promise<Object>} Processed feature data
     */
    async process(featureTable) {
        if (!featureTable) {
            return null;
        }

        try {
            // Check cache first
            const cacheKey = this.generateCacheKey(featureTable);
            if (this.options.enableCaching && this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey);
            }

            // Process the feature table
            const processedData = {
                batchLength: this.processBatchLength(featureTable),
                rtcCenter: this.processRtcCenter(featureTable),
                properties: this.processProperties(featureTable),
                transformations: this.calculateTransformations(featureTable),
                metadata: this.extractMetadata(featureTable)
            };

            // Validate processed data
            if (this.options.validateBatchLength || this.options.validateCoordinates) {
                this.validateProcessedData(processedData, featureTable);
            }

            // Cache the result
            if (this.options.enableCaching) {
                this.cache.set(cacheKey, processedData);
            }

            return processedData;

        } catch (error) {
            if (error instanceof B3dmError) {
                throw error;
            }
            
            throw new B3dmError(
                `Failed to process feature table: ${error.message}`,
                B3DM_ERROR_CODES.FEATURE_TABLE_ERROR,
                { originalError: error }
            );
        }
    }

    /**
     * Processes the batch length property
     * @param {FeatureTable} featureTable - The feature table
     * @returns {number} The batch length
     * @private
     */
    processBatchLength(featureTable) {
        const batchLength = featureTable.getBatchLength();
        
        if (batchLength === undefined || batchLength === null) {
            if (this.options.validateBatchLength) {
                throw new B3dmError(
                    'BATCH_LENGTH is required in feature table',
                    B3DM_ERROR_CODES.FEATURE_TABLE_ERROR
                );
            }
            return 0;
        }

        if (typeof batchLength !== 'number' || batchLength < 0) {
            throw new B3dmError(
                `Invalid BATCH_LENGTH: ${batchLength} (must be a non-negative number)`,
                B3DM_ERROR_CODES.FEATURE_TABLE_ERROR,
                { batchLength }
            );
        }

        return Math.floor(batchLength);
    }

    /**
     * Processes the RTC center coordinates
     * @param {FeatureTable} featureTable - The feature table
     * @returns {Object|null} Processed RTC center data
     * @private
     */
    processRtcCenter(featureTable) {
        const rtcCenter = featureTable.getRtcCenter();
        
        if (!rtcCenter) {
            return null;
        }

        if (!Array.isArray(rtcCenter) || rtcCenter.length !== 3) {
            throw new B3dmError(
                `Invalid RTC_CENTER: must be array of 3 numbers, got ${JSON.stringify(rtcCenter)}`,
                B3DM_ERROR_CODES.FEATURE_TABLE_ERROR,
                { rtcCenter }
            );
        }

        const [x, y, z] = rtcCenter;
        
        if (!this.isValidCoordinate(x) || !this.isValidCoordinate(y) || !this.isValidCoordinate(z)) {
            throw new B3dmError(
                `Invalid RTC_CENTER coordinates: [${x}, ${y}, ${z}]`,
                B3DM_ERROR_CODES.FEATURE_TABLE_ERROR,
                { rtcCenter }
            );
        }

        return {
            x: x,
            y: y,
            z: z,
            vector: [x, y, z],
            magnitude: Math.sqrt(x * x + y * y + z * z),
            isSignificant: this.isSignificantRtcCenter([x, y, z])
        };
    }

    /**
     * Processes custom properties from the feature table
     * @param {FeatureTable} featureTable - The feature table
     * @returns {Object} Processed properties
     * @private
     */
    processProperties(featureTable) {
        const properties = {};
        const propertyNames = featureTable.getPropertyNames();

        for (const propertyName of propertyNames) {
            try {
                const propertyData = this.processProperty(featureTable, propertyName);
                if (propertyData !== null) {
                    properties[propertyName] = propertyData;
                }
            } catch (error) {
                console.warn(`Failed to process property ${propertyName}:`, error);
                // Continue processing other properties
            }
        }

        return properties;
    }

    /**
     * Processes a single property
     * @param {FeatureTable} featureTable - The feature table
     * @param {string} propertyName - Name of the property
     * @returns {Object|null} Processed property data
     * @private
     */
    processProperty(featureTable, propertyName) {
        const property = featureTable.properties[propertyName];
        if (!property) {
            return null;
        }

        const propertyData = {
            name: propertyName,
            isConstant: property.isConstantProperty,
            isBinary: property.isBinaryProperty,
            type: property.type,
            componentType: property.componentType
        };

        if (property.isConstantProperty) {
            propertyData.value = property.constantValue;
            propertyData.count = 1;
        } else if (property.isBinaryProperty) {
            propertyData.values = property.getAllValues();
            propertyData.count = Array.isArray(propertyData.values) ? propertyData.values.length : 1;
            propertyData.byteOffset = property.byteOffset;
            
            // Calculate statistics for numeric properties
            if (this.isNumericProperty(property)) {
                propertyData.statistics = this.calculatePropertyStatistics(propertyData.values);
            }
        }

        return propertyData;
    }

    /**
     * Calculates transformations needed for the feature data
     * @param {FeatureTable} featureTable - The feature table
     * @returns {Object} Transformation data
     * @private
     */
    calculateTransformations(featureTable) {
        const transformations = {
            hasRtcTransform: false,
            rtcMatrix: null,
            coordinateSystem: 'local'
        };

        const rtcCenter = featureTable.getRtcCenter();
        if (rtcCenter && this.options.applyRtcCenter) {
            transformations.hasRtcTransform = true;
            transformations.rtcMatrix = this.createRtcTransformMatrix(rtcCenter);
            transformations.coordinateSystem = 'rtc';
        }

        return transformations;
    }

    /**
     * Extracts metadata from the feature table
     * @param {FeatureTable} featureTable - The feature table
     * @returns {Object} Metadata
     * @private
     */
    extractMetadata(featureTable) {
        const summary = featureTable.getSummary();
        
        return {
            batchLength: summary.batchLength,
            propertyCount: summary.propertyCount,
            hasBinaryData: summary.hasBinaryData,
            binarySize: summary.binarySize,
            properties: summary.properties,
            estimatedMemoryUsage: this.estimateMemoryUsage(featureTable)
        };
    }

    /**
     * Validates the processed data
     * @param {Object} processedData - The processed data
     * @param {FeatureTable} featureTable - The original feature table
     * @private
     */
    validateProcessedData(processedData, featureTable) {
        // Validate batch length consistency
        if (this.options.validateBatchLength) {
            const batchLength = processedData.batchLength;
            
            for (const [propertyName, propertyData] of Object.entries(processedData.properties)) {
                if (propertyData.isBinary && !propertyData.isConstant) {
                    const expectedCount = batchLength;
                    if (propertyData.count !== expectedCount) {
                        console.warn(`Property ${propertyName} count (${propertyData.count}) doesn't match batch length (${expectedCount})`);
                    }
                }
            }
        }

        // Validate RTC center coordinates
        if (this.options.validateCoordinates && processedData.rtcCenter) {
            const rtc = processedData.rtcCenter;
            if (rtc.magnitude > 1e10) { // Very large coordinates might indicate an issue
                console.warn(`RTC_CENTER has very large magnitude: ${rtc.magnitude}`);
            }
        }
    }

    /**
     * Checks if a coordinate value is valid
     * @param {*} value - The value to check
     * @returns {boolean} True if valid
     * @private
     */
    isValidCoordinate(value) {
        return typeof value === 'number' && 
               !isNaN(value) && 
               isFinite(value);
    }

    /**
     * Checks if RTC center is significant enough to apply
     * @param {Array<number>} rtcCenter - The RTC center coordinates
     * @returns {boolean} True if significant
     * @private
     */
    isSignificantRtcCenter(rtcCenter) {
        const [x, y, z] = rtcCenter;
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        
        // Consider RTC significant if any coordinate is larger than typical mesh bounds
        return magnitude > 1000 || Math.abs(x) > 1000 || Math.abs(y) > 1000 || Math.abs(z) > 1000;
    }

    /**
     * Checks if a property contains numeric data
     * @param {FeatureProperty} property - The property to check
     * @returns {boolean} True if numeric
     * @private
     */
    isNumericProperty(property) {
        if (property.isConstantProperty) {
            return typeof property.constantValue === 'number';
        }
        
        // Check if the component type is numeric
        const numericTypes = [5120, 5121, 5122, 5123, 5124, 5125, 5126]; // All numeric component types
        return numericTypes.includes(property.componentType);
    }

    /**
     * Calculates statistics for numeric property values
     * @param {Array|number} values - The property values
     * @returns {Object} Statistics
     * @private
     */
    calculatePropertyStatistics(values) {
        if (typeof values === 'number') {
            return { min: values, max: values, mean: values, count: 1 };
        }

        if (!Array.isArray(values) || values.length === 0) {
            return { min: 0, max: 0, mean: 0, count: 0 };
        }

        // Flatten array if it contains sub-arrays (for VEC2, VEC3, etc.)
        const flatValues = values.flat();
        const numericValues = flatValues.filter(v => typeof v === 'number' && !isNaN(v));

        if (numericValues.length === 0) {
            return { min: 0, max: 0, mean: 0, count: 0 };
        }

        const min = Math.min(...numericValues);
        const max = Math.max(...numericValues);
        const sum = numericValues.reduce((a, b) => a + b, 0);
        const mean = sum / numericValues.length;

        return { min, max, mean, count: numericValues.length };
    }

    /**
     * Creates an RTC transformation matrix
     * @param {Array<number>} rtcCenter - The RTC center coordinates
     * @returns {Array<number>} 4x4 transformation matrix (column-major)
     * @private
     */
    createRtcTransformMatrix(rtcCenter) {
        const [x, y, z] = rtcCenter;
        
        // Create translation matrix in column-major order
        return [
            1, 0, 0, 0,  // Column 1
            0, 1, 0, 0,  // Column 2
            0, 0, 1, 0,  // Column 3
            x, y, z, 1   // Column 4 (translation)
        ];
    }

    /**
     * Estimates memory usage for the feature table
     * @param {FeatureTable} featureTable - The feature table
     * @returns {number} Estimated memory usage in bytes
     * @private
     */
    estimateMemoryUsage(featureTable) {
        let totalSize = 0;
        
        // JSON data size (rough estimate)
        totalSize += JSON.stringify(featureTable.json).length * 2; // UTF-16 encoding
        
        // Binary data size
        if (featureTable.binary) {
            totalSize += featureTable.binary.byteLength;
        }
        
        // Property processing overhead (rough estimate)
        totalSize += Object.keys(featureTable.properties).length * 1000;
        
        return totalSize;
    }

    /**
     * Generates a cache key for the feature table
     * @param {FeatureTable} featureTable - The feature table
     * @returns {string} Cache key
     * @private
     */
    generateCacheKey(featureTable) {
        const summary = featureTable.getSummary();
        return `ft_${summary.batchLength}_${summary.propertyCount}_${summary.binarySize}`;
    }

    /**
     * Clears the processing cache
     */
    clearCache() {
        this.cache.clear();
    }
}