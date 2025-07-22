import { BinaryReader } from '../utils/BinaryReader.js';
import { TypedArrayUtils } from '../utils/TypedArrayUtils.js';
import { 
    B3dmError, 
    B3DM_ERROR_CODES, 
    B3DM_HEADER_BYTE_LENGTH,
    FEATURE_TABLE_PROPERTIES,
    COMPONENT_TYPES,
    DATA_TYPES
} from '../utils/B3dmConstants.js';

/**
 * Parser for B3DM feature table data
 * Handles both JSON schema and binary data portions of the feature table
 */
export class FeatureTableParser {
    constructor(options = {}) {
        this.options = {
            validateJSON: true,
            validateBinary: true,
            allowMissingProperties: false,
            ...options
        };
    }

    /**
     * Parses the feature table from B3DM data
     * @param {ArrayBuffer} arrayBuffer - The B3DM file data
     * @param {Object} header - The parsed B3DM header
     * @returns {Object} Parsed feature table with JSON and binary data
     */
    parse(arrayBuffer, header) {
        try {
            // Calculate offsets
            const jsonOffset = B3DM_HEADER_BYTE_LENGTH;
            const binaryOffset = jsonOffset + header.featureTableJSONByteLength;

            // Parse JSON portion
            const jsonData = this.parseJSON(arrayBuffer, jsonOffset, header.featureTableJSONByteLength);
            
            // Parse binary portion if present
            const binaryData = header.featureTableBinaryByteLength > 0 ? 
                this.parseBinary(arrayBuffer, binaryOffset, header.featureTableBinaryByteLength) : null;

            // Create feature table object
            const featureTable = new FeatureTable(jsonData, binaryData, this.options);

            // Validate the parsed data
            if (this.options.validateJSON || this.options.validateBinary) {
                this.validateFeatureTable(featureTable, header);
            }

            return featureTable;

        } catch (error) {
            if (error instanceof B3dmError) {
                throw error;
            }
            
            throw new B3dmError(
                `Failed to parse feature table: ${error.message}`,
                B3DM_ERROR_CODES.FEATURE_TABLE_ERROR,
                { originalError: error }
            );
        }
    }

    /**
     * Parses the JSON portion of the feature table
     * @param {ArrayBuffer} arrayBuffer - The B3DM file data
     * @param {number} offset - Offset to JSON data
     * @param {number} length - Length of JSON data
     * @returns {Object} Parsed JSON data
     * @private
     */
    parseJSON(arrayBuffer, offset, length) {
        if (length === 0) {
            return {};
        }

        try {
            const reader = new BinaryReader(arrayBuffer, offset, length);
            const jsonString = reader.readString(length, 'utf-8');
            
            // Remove any null padding
            const cleanJsonString = jsonString.replace(/\0+$/, '');
            
            if (cleanJsonString.trim() === '') {
                return {};
            }

            return JSON.parse(cleanJsonString);

        } catch (error) {
            throw new B3dmError(
                `Failed to parse feature table JSON: ${error.message}`,
                B3DM_ERROR_CODES.FEATURE_TABLE_ERROR,
                { offset, length, originalError: error }
            );
        }
    }

    /**
     * Parses the binary portion of the feature table
     * @param {ArrayBuffer} arrayBuffer - The B3DM file data
     * @param {number} offset - Offset to binary data
     * @param {number} length - Length of binary data
     * @returns {ArrayBuffer} Binary data slice
     * @private
     */
    parseBinary(arrayBuffer, offset, length) {
        if (length === 0) {
            return null;
        }

        try {
            return arrayBuffer.slice(offset, offset + length);
        } catch (error) {
            throw new B3dmError(
                `Failed to extract feature table binary data: ${error.message}`,
                B3DM_ERROR_CODES.FEATURE_TABLE_ERROR,
                { offset, length, originalError: error }
            );
        }
    }

    /**
     * Validates the parsed feature table
     * @param {FeatureTable} featureTable - The parsed feature table
     * @param {Object} header - The B3DM header
     * @private
     */
    validateFeatureTable(featureTable, header) {
        // Validate required properties
        if (!this.options.allowMissingProperties) {
            if (featureTable.getBatchLength() === undefined) {
                throw new B3dmError(
                    'Feature table missing required BATCH_LENGTH property',
                    B3DM_ERROR_CODES.FEATURE_TABLE_ERROR
                );
            }
        }

        // Validate binary data consistency
        if (this.options.validateBinary && featureTable.binary) {
            this.validateBinaryConsistency(featureTable);
        }
    }

    /**
     * Validates binary data consistency with JSON schema
     * @param {FeatureTable} featureTable - The feature table to validate
     * @private
     */
    validateBinaryConsistency(featureTable, header) {
        const json = featureTable.json;
        const binary = featureTable.binary;

        if (!binary) return;

        let expectedBinarySize = 0;

        // Check each property that references binary data
        for (const [propertyName, propertyDef] of Object.entries(json)) {
            if (typeof propertyDef === 'object' && propertyDef.byteOffset !== undefined) {
                const byteOffset = propertyDef.byteOffset;
                const componentType = propertyDef.componentType || COMPONENT_TYPES.FLOAT;
                const type = propertyDef.type || DATA_TYPES.SCALAR;
                
                // Calculate expected size for this property
                const batchLength = featureTable.getBatchLength() || 1;
                const propertySize = TypedArrayUtils.calculateByteSize(type, componentType, batchLength);
                
                expectedBinarySize = Math.max(expectedBinarySize, byteOffset + propertySize);
            }
        }

        if (expectedBinarySize > binary.byteLength) {
            throw new B3dmError(
                `Feature table binary data too small: need ${expectedBinarySize} bytes, got ${binary.byteLength}`,
                B3DM_ERROR_CODES.FEATURE_TABLE_ERROR,
                { expected: expectedBinarySize, actual: binary.byteLength }
            );
        }
    }
}

/**
 * Feature table data structure that provides access to both JSON and binary data
 */
export class FeatureTable {
    constructor(jsonData, binaryData, options = {}) {
        this.json = jsonData || {};
        this.binary = binaryData;
        this.options = options;
        
        // Cache commonly accessed properties
        this._batchLength = this.json[FEATURE_TABLE_PROPERTIES.BATCH_LENGTH];
        this._rtcCenter = this.json[FEATURE_TABLE_PROPERTIES.RTC_CENTER];
        
        // Parse property definitions
        this.properties = this.parseProperties();
    }

    /**
     * Gets the batch length from the feature table
     * @returns {number|undefined} The batch length
     */
    getBatchLength() {
        return this._batchLength;
    }

    /**
     * Gets the RTC center coordinates
     * @returns {Array<number>|undefined} The RTC center [x, y, z]
     */
    getRtcCenter() {
        return this._rtcCenter;
    }

    /**
     * Checks if the feature table has binary data
     * @returns {boolean} True if binary data is present
     */
    hasBinaryData() {
        return this.binary !== null && this.binary !== undefined;
    }

    /**
     * Gets a property value by name and index
     * @param {string} propertyName - Name of the property
     * @param {number} index - Index of the element (for array properties)
     * @returns {*} The property value
     */
    getProperty(propertyName, index = 0) {
        const property = this.properties[propertyName];
        if (!property) {
            return undefined;
        }

        return property.getValue(index);
    }

    /**
     * Gets all values for a property
     * @param {string} propertyName - Name of the property
     * @returns {Array|*} Array of values or single value
     */
    getPropertyArray(propertyName) {
        const property = this.properties[propertyName];
        if (!property) {
            return undefined;
        }

        return property.getAllValues();
    }

    /**
     * Lists all available property names
     * @returns {Array<string>} Array of property names
     */
    getPropertyNames() {
        return Object.keys(this.properties);
    }

    /**
     * Parses property definitions from JSON
     * @returns {Object} Map of property name to FeatureProperty
     * @private
     */
    parseProperties() {
        const properties = {};

        for (const [name, definition] of Object.entries(this.json)) {
            // Skip semantic properties
            if (name === FEATURE_TABLE_PROPERTIES.BATCH_LENGTH || 
                name === FEATURE_TABLE_PROPERTIES.RTC_CENTER) {
                continue;
            }

            properties[name] = new FeatureProperty(name, definition, this.binary);
        }

        return properties;
    }

    /**
     * Creates a summary of the feature table
     * @returns {Object} Feature table summary
     */
    getSummary() {
        return {
            batchLength: this.getBatchLength(),
            rtcCenter: this.getRtcCenter(),
            hasBinaryData: this.hasBinaryData(),
            binarySize: this.binary ? this.binary.byteLength : 0,
            propertyCount: Object.keys(this.properties).length,
            properties: Object.keys(this.properties)
        };
    }
}

/**
 * Represents a single property in the feature table
 */
export class FeatureProperty {
    constructor(name, definition, binaryData) {
        this.name = name;
        this.definition = definition;
        this.binaryData = binaryData;
        
        // Parse property metadata
        this.parseDefinition();
        
        // Create typed array if binary data is referenced
        if (this.isBinaryProperty && binaryData) {
            this.createTypedArray();
        }
    }

    /**
     * Parses the property definition
     * @private
     */
    parseDefinition() {
        if (typeof this.definition === 'object') {
            this.byteOffset = this.definition.byteOffset;
            this.componentType = this.definition.componentType || COMPONENT_TYPES.FLOAT;
            this.type = this.definition.type || DATA_TYPES.SCALAR;
            this.isBinaryProperty = this.byteOffset !== undefined;
            this.isConstantProperty = false;
        } else {
            // Constant value
            this.constantValue = this.definition;
            this.isBinaryProperty = false;
            this.isConstantProperty = true;
        }
    }

    /**
     * Creates typed array for binary property
     * @private
     */
    createTypedArray() {
        if (!this.isBinaryProperty || !this.binaryData) {
            return;
        }

        try {
            // For feature table, we typically don't know the count ahead of time
            // We'll calculate it based on available data
            const availableBytes = this.binaryData.byteLength - this.byteOffset;
            const elementSize = TypedArrayUtils.calculateByteSize(this.type, this.componentType, 1);
            const count = Math.floor(availableBytes / elementSize);

            this.typedArray = TypedArrayUtils.createTypedArray(
                this.binaryData,
                this.byteOffset,
                this.type,
                this.componentType,
                count
            );
        } catch (error) {
            throw new B3dmError(
                `Failed to create typed array for property ${this.name}: ${error.message}`,
                B3DM_ERROR_CODES.FEATURE_TABLE_ERROR,
                { propertyName: this.name, originalError: error }
            );
        }
    }

    /**
     * Gets the value at the specified index
     * @param {number} index - The index
     * @returns {*} The value
     */
    getValue(index) {
        if (this.isConstantProperty) {
            return this.constantValue;
        }

        if (this.isBinaryProperty && this.typedArray) {
            return TypedArrayUtils.getElement(this.typedArray, index, this.type);
        }

        return undefined;
    }

    /**
     * Gets all values as an array
     * @returns {Array|*} Array of values or constant value
     */
    getAllValues() {
        if (this.isConstantProperty) {
            return this.constantValue;
        }

        if (this.isBinaryProperty && this.typedArray) {
            return TypedArrayUtils.toArray(this.typedArray, this.type);
        }

        return [];
    }
}