import { 
    FEATURE_TABLE_PROPERTIES,
    COMPONENT_TYPES,
    DATA_TYPES,
    COMPONENT_TYPE_SIZES,
    DATA_TYPE_COMPONENTS,
    B3dmError,
    B3DM_ERROR_CODES
} from '../utils/B3dmConstants.js';
import { TypedArrayUtils } from '../utils/TypedArrayUtils.js';

/**
 * Validator for B3DM table structures (feature and batch tables)
 * Provides comprehensive validation with detailed error reporting
 */
export class TableValidator {
    constructor(options = {}) {
        this.options = {
            strictMode: false,
            validateBinaryData: true,
            validatePropertyTypes: true,
            allowUnknownProperties: true,
            maxPropertyCount: 1000,
            maxBinarySize: 100 * 1024 * 1024, // 100MB
            ...options
        };
    }

    /**
     * Validates feature table structure
     * @param {FeatureTable} featureTable - The parsed feature table
     * @param {Object} header - The B3DM header
     * @returns {Object} Validation result
     */
    validateFeatureTable(featureTable, header) {
        const result = {
            isValid: true,
            warnings: [],
            errors: []
        };

        try {
            // Validate basic structure
            this.validateFeatureTableStructure(featureTable, result);
            
            // Validate required properties
            this.validateFeatureTableProperties(featureTable, result);
            
            // Validate binary data consistency
            if (this.options.validateBinaryData && featureTable.hasBinaryData()) {
                this.validateFeatureTableBinary(featureTable, header, result);
            }
            
            // Validate property types
            if (this.options.validatePropertyTypes) {
                this.validateFeatureTablePropertyTypes(featureTable, result);
            }
            
            // Performance and size checks
            this.checkFeatureTablePerformance(featureTable, result);

            result.isValid = result.errors.length === 0;

        } catch (error) {
            result.errors.push(`Feature table validation failed: ${error.message}`);
            result.isValid = false;
        }

        return result;
    }

    /**
     * Validates batch table structure
     * @param {BatchTable} batchTable - The parsed batch table
     * @param {Object} header - The B3DM header
     * @param {FeatureTable} featureTable - The feature table (for consistency checks)
     * @returns {Object} Validation result
     */
    validateBatchTable(batchTable, header, featureTable) {
        const result = {
            isValid: true,
            warnings: [],
            errors: []
        };

        try {
            // Validate basic structure
            this.validateBatchTableStructure(batchTable, result);
            
            // Validate consistency with feature table
            if (featureTable) {
                this.validateBatchTableConsistency(batchTable, featureTable, result);
            }
            
            // Validate binary data
            if (this.options.validateBinaryData && batchTable.binary) {
                this.validateBatchTableBinary(batchTable, header, result);
            }
            
            // Validate property definitions
            if (this.options.validatePropertyTypes) {
                this.validateBatchTableProperties(batchTable, result);
            }
            
            // Performance checks
            this.checkBatchTablePerformance(batchTable, result);

            result.isValid = result.errors.length === 0;

        } catch (error) {
            result.errors.push(`Batch table validation failed: ${error.message}`);
            result.isValid = false;
        }

        return result;
    }

    /**
     * Validates feature table basic structure
     * @param {FeatureTable} featureTable - The feature table
     * @param {Object} result - Validation result to update
     * @private
     */
    validateFeatureTableStructure(featureTable, result) {
        if (!featureTable) {
            result.errors.push('Feature table is null or undefined');
            return;
        }

        if (!featureTable.json || typeof featureTable.json !== 'object') {
            result.errors.push('Feature table JSON is missing or invalid');
            return;
        }

        // Check property count
        const propertyCount = Object.keys(featureTable.json).length;
        if (propertyCount > this.options.maxPropertyCount) {
            result.warnings.push(`Large number of properties: ${propertyCount} (max recommended: ${this.options.maxPropertyCount})`);
        }
    }

    /**
     * Validates feature table required properties
     * @param {FeatureTable} featureTable - The feature table
     * @param {Object} result - Validation result to update
     * @private
     */
    validateFeatureTableProperties(featureTable, result) {
        const json = featureTable.json;
        
        // Validate BATCH_LENGTH
        const batchLength = json[FEATURE_TABLE_PROPERTIES.BATCH_LENGTH];
        if (batchLength !== undefined) {
            if (typeof batchLength !== 'number' || batchLength < 0 || !Number.isInteger(batchLength)) {
                result.errors.push(`Invalid BATCH_LENGTH: ${batchLength} (must be non-negative integer)`);
            } else if (batchLength === 0) {
                result.warnings.push('BATCH_LENGTH is 0 - no batches to process');
            } else if (batchLength > 1000000) {
                result.warnings.push(`Very large BATCH_LENGTH: ${batchLength} - may impact performance`);
            }
        } else if (this.options.strictMode) {
            result.errors.push('BATCH_LENGTH is required in feature table');
        }

        // Validate RTC_CENTER
        const rtcCenter = json[FEATURE_TABLE_PROPERTIES.RTC_CENTER];
        if (rtcCenter !== undefined) {
            if (!Array.isArray(rtcCenter) || rtcCenter.length !== 3) {
                result.errors.push(`Invalid RTC_CENTER: must be array of 3 numbers, got ${JSON.stringify(rtcCenter)}`);
            } else {
                for (let i = 0; i < 3; i++) {
                    if (typeof rtcCenter[i] !== 'number' || !isFinite(rtcCenter[i])) {
                        result.errors.push(`Invalid RTC_CENTER[${i}]: ${rtcCenter[i]} (must be finite number)`);
                    }
                }
                
                // Check for very large coordinates
                const magnitude = Math.sqrt(rtcCenter[0] ** 2 + rtcCenter[1] ** 2 + rtcCenter[2] ** 2);
                if (magnitude > 1e10) {
                    result.warnings.push(`Very large RTC_CENTER magnitude: ${magnitude.toExponential(2)}`);
                }
            }
        }
    }

    /**
     * Validates feature table binary data consistency
     * @param {FeatureTable} featureTable - The feature table
     * @param {Object} header - The B3DM header
     * @param {Object} result - Validation result to update
     * @private
     */
    validateFeatureTableBinary(featureTable, header, result) {
        const binary = featureTable.binary;
        
        if (!binary && header.featureTableBinaryByteLength > 0) {
            result.errors.push('Header indicates binary data but none found');
            return;
        }

        if (binary && binary.byteLength !== header.featureTableBinaryByteLength) {
            result.errors.push(`Binary size mismatch: header says ${header.featureTableBinaryByteLength}, got ${binary.byteLength}`);
        }

        if (binary && binary.byteLength > this.options.maxBinarySize) {
            result.warnings.push(`Large binary data: ${(binary.byteLength / 1024 / 1024).toFixed(1)}MB`);
        }

        // Validate binary property references
        this.validateBinaryPropertyReferences(featureTable, result);
    }

    /**
     * Validates feature table property types
     * @param {FeatureTable} featureTable - The feature table
     * @param {Object} result - Validation result to update
     * @private
     */
    validateFeatureTablePropertyTypes(featureTable, result) {
        for (const [propertyName, property] of Object.entries(featureTable.properties)) {
            this.validatePropertyDefinition(propertyName, property, result, 'feature table');
        }
    }

    /**
     * Validates batch table basic structure
     * @param {BatchTable} batchTable - The batch table
     * @param {Object} result - Validation result to update
     * @private
     */
    validateBatchTableStructure(batchTable, result) {
        if (!batchTable) {
            result.errors.push('Batch table is null or undefined');
            return;
        }

        if (!batchTable.json || typeof batchTable.json !== 'object') {
            result.errors.push('Batch table JSON is missing or invalid');
            return;
        }

        // Check for empty batch table
        if (Object.keys(batchTable.json).length === 0) {
            result.warnings.push('Batch table is empty');
        }
    }

    /**
     * Validates batch table consistency with feature table
     * @param {BatchTable} batchTable - The batch table
     * @param {FeatureTable} featureTable - The feature table
     * @param {Object} result - Validation result to update
     * @private
     */
    validateBatchTableConsistency(batchTable, featureTable, result) {
        const batchLength = featureTable.getBatchLength();
        
        if (batchLength === undefined || batchLength === 0) {
            result.warnings.push('Batch table present but BATCH_LENGTH is 0 or undefined');
            return;
        }

        // Validate that batch table properties have correct count
        for (const [propertyName, propertyDef] of Object.entries(batchTable.json)) {
            if (typeof propertyDef === 'object' && propertyDef.byteOffset !== undefined) {
                // This is a binary property - validate count matches batch length
                const componentType = propertyDef.componentType || COMPONENT_TYPES.FLOAT;
                const type = propertyDef.type || DATA_TYPES.SCALAR;
                
                try {
                    const expectedSize = TypedArrayUtils.calculateByteSize(type, componentType, batchLength);
                    const availableSize = batchTable.binary ? 
                        batchTable.binary.byteLength - propertyDef.byteOffset : 0;
                    
                    if (availableSize < expectedSize) {
                        result.errors.push(`Batch property ${propertyName}: insufficient binary data (need ${expectedSize}, have ${availableSize})`);
                    }
                } catch (error) {
                    result.errors.push(`Batch property ${propertyName}: ${error.message}`);
                }
            }
        }
    }

    /**
     * Validates batch table binary data
     * @param {BatchTable} batchTable - The batch table
     * @param {Object} header - The B3DM header
     * @param {Object} result - Validation result to update
     * @private
     */
    validateBatchTableBinary(batchTable, header, result) {
        const binary = batchTable.binary;
        
        if (!binary && header.batchTableBinaryByteLength > 0) {
            result.errors.push('Header indicates batch table binary data but none found');
            return;
        }

        if (binary && binary.byteLength !== header.batchTableBinaryByteLength) {
            result.errors.push(`Batch table binary size mismatch: header says ${header.batchTableBinaryByteLength}, got ${binary.byteLength}`);
        }
    }

    /**
     * Validates batch table properties
     * @param {BatchTable} batchTable - The batch table
     * @param {Object} result - Validation result to update
     * @private
     */
    validateBatchTableProperties(batchTable, result) {
        for (const [propertyName, propertyDef] of Object.entries(batchTable.json)) {
            this.validateBatchPropertyDefinition(propertyName, propertyDef, result);
        }
    }

    /**
     * Validates binary property references
     * @param {FeatureTable} featureTable - The feature table
     * @param {Object} result - Validation result to update
     * @private
     */
    validateBinaryPropertyReferences(featureTable, result) {
        const binary = featureTable.binary;
        if (!binary) return;

        for (const [propertyName, propertyDef] of Object.entries(featureTable.json)) {
            if (typeof propertyDef === 'object' && propertyDef.byteOffset !== undefined) {
                const byteOffset = propertyDef.byteOffset;
                
                if (byteOffset < 0 || byteOffset >= binary.byteLength) {
                    result.errors.push(`Property ${propertyName}: invalid byteOffset ${byteOffset} (binary size: ${binary.byteLength})`);
                    continue;
                }

                // Validate component type and data type
                const componentType = propertyDef.componentType;
                const type = propertyDef.type;

                if (componentType !== undefined && !Object.values(COMPONENT_TYPES).includes(componentType)) {
                    result.errors.push(`Property ${propertyName}: invalid componentType ${componentType}`);
                }

                if (type !== undefined && !Object.values(DATA_TYPES).includes(type)) {
                    result.errors.push(`Property ${propertyName}: invalid type ${type}`);
                }
            }
        }
    }

    /**
     * Validates a property definition
     * @param {string} propertyName - Name of the property
     * @param {FeatureProperty} property - The property object
     * @param {Object} result - Validation result to update
     * @param {string} context - Context for error messages
     * @private
     */
    validatePropertyDefinition(propertyName, property, result, context) {
        if (!property) {
            result.errors.push(`${context} property ${propertyName} is null or undefined`);
            return;
        }

        if (property.isBinaryProperty) {
            if (property.byteOffset < 0) {
                result.errors.push(`${context} property ${propertyName}: negative byteOffset ${property.byteOffset}`);
            }

            if (property.componentType !== undefined && !Object.values(COMPONENT_TYPES).includes(property.componentType)) {
                result.errors.push(`${context} property ${propertyName}: invalid componentType ${property.componentType}`);
            }

            if (property.type !== undefined && !Object.values(DATA_TYPES).includes(property.type)) {
                result.errors.push(`${context} property ${propertyName}: invalid type ${property.type}`);
            }
        }
    }

    /**
     * Validates a batch property definition
     * @param {string} propertyName - Name of the property
     * @param {*} propertyDef - The property definition
     * @param {Object} result - Validation result to update
     * @private
     */
    validateBatchPropertyDefinition(propertyName, propertyDef, result) {
        if (typeof propertyDef === 'object' && propertyDef !== null) {
            // Binary property
            if (propertyDef.byteOffset !== undefined) {
                if (typeof propertyDef.byteOffset !== 'number' || propertyDef.byteOffset < 0) {
                    result.errors.push(`Batch property ${propertyName}: invalid byteOffset ${propertyDef.byteOffset}`);
                }

                if (propertyDef.componentType !== undefined && !Object.values(COMPONENT_TYPES).includes(propertyDef.componentType)) {
                    result.errors.push(`Batch property ${propertyName}: invalid componentType ${propertyDef.componentType}`);
                }

                if (propertyDef.type !== undefined && !Object.values(DATA_TYPES).includes(propertyDef.type)) {
                    result.errors.push(`Batch property ${propertyName}: invalid type ${propertyDef.type}`);
                }
            }
        }
        // Constant properties (primitive values) are always valid
    }

    /**
     * Checks feature table performance characteristics
     * @param {FeatureTable} featureTable - The feature table
     * @param {Object} result - Validation result to update
     * @private
     */
    checkFeatureTablePerformance(featureTable, result) {
        const summary = featureTable.getSummary();
        
        if (summary.propertyCount > 50) {
            result.warnings.push(`Many properties in feature table: ${summary.propertyCount} - consider consolidation`);
        }

        if (summary.binarySize > 10 * 1024 * 1024) { // 10MB
            result.warnings.push(`Large feature table binary data: ${(summary.binarySize / 1024 / 1024).toFixed(1)}MB`);
        }
    }

    /**
     * Checks batch table performance characteristics
     * @param {BatchTable} batchTable - The batch table
     * @param {Object} result - Validation result to update
     * @private
     */
    checkBatchTablePerformance(batchTable, result) {
        const propertyCount = Object.keys(batchTable.json).length;
        
        if (propertyCount > 100) {
            result.warnings.push(`Many properties in batch table: ${propertyCount} - may impact performance`);
        }

        if (batchTable.binary && batchTable.binary.byteLength > 50 * 1024 * 1024) { // 50MB
            result.warnings.push(`Large batch table binary data: ${(batchTable.binary.byteLength / 1024 / 1024).toFixed(1)}MB`);
        }
    }
}