import { BinaryReader } from '../utils/BinaryReader.js';
import { TypedArrayUtils } from '../utils/TypedArrayUtils.js';
import {
    B3dmError,
    B3DM_ERROR_CODES,
    B3DM_HEADER_BYTE_LENGTH,
    COMPONENT_TYPES,
    DATA_TYPES
} from '../utils/B3dmConstants.js';

/**
 * Parser for B3DM batch table data
 * Handles both JSON schema and binary data portions of the batch table
 */
export class BatchTableParser {
    constructor(options = {}) {
        this.options = {
            validateJSON: true,
            validateBinary: true,
            allowHierarchicalData: true,
            maxPropertyDepth: 10,
            ...options
        };
    }

    /**
     * Parses the batch table from B3DM data
     * @param {ArrayBuffer} arrayBuffer - The B3DM file data
     * @param {Object} header - The parsed B3DM header
     * @returns {BatchTable} Parsed batch table with JSON and binary data
     */
    parse(arrayBuffer, header) {
        try {
            // Calculate offsets
            const featureTableTotalLength = header.featureTableJSONByteLength + header.featureTableBinaryByteLength;
            const jsonOffset = B3DM_HEADER_BYTE_LENGTH + featureTableTotalLength;
            const binaryOffset = jsonOffset + header.batchTableJSONByteLength;

            // Parse JSON portion
            const jsonData = this.parseJSON(arrayBuffer, jsonOffset, header.batchTableJSONByteLength);

            // Parse binary portion if present
            const binaryData = header.batchTableBinaryByteLength > 0 ?
                this.parseBinary(arrayBuffer, binaryOffset, header.batchTableBinaryByteLength) : null;

            // Create batch table object
            const batchTable = new BatchTable(jsonData, binaryData, this.options);

            // Validate the parsed data
            if (this.options.validateJSON || this.options.validateBinary) {
                this.validateBatchTable(batchTable, header);
            }

            return batchTable;

        } catch (error) {
            if (error instanceof B3dmError) {
                throw error;
            }

            throw new B3dmError(
                `Failed to parse batch table: ${error.message}`,
                B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                { originalError: error }
            );
        }
    }

    /**
     * Parses the JSON portion of the batch table
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

            const parsedJson = JSON.parse(cleanJsonString);

            // Validate JSON structure depth
            if (this.options.allowHierarchicalData) {
                this.validateJsonDepth(parsedJson, 0);
            }

            return parsedJson;

        } catch (error) {
            throw new B3dmError(
                `Failed to parse batch table JSON: ${error.message}`,
                B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                { offset, length, originalError: error }
            );
        }
    }

    /**
     * Parses the binary portion of the batch table
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
                `Failed to extract batch table binary data: ${error.message}`,
                B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                { offset, length, originalError: error }
            );
        }
    }

    /**
     * Validates JSON structure depth to prevent stack overflow
     * @param {*} obj - Object to validate
     * @param {number} depth - Current depth
     * @private
     */
    validateJsonDepth(obj, depth) {
        if (depth > this.options.maxPropertyDepth) {
            throw new B3dmError(
                `Batch table JSON too deeply nested: depth ${depth} exceeds maximum ${this.options.maxPropertyDepth}`,
                B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                { depth, maxDepth: this.options.maxPropertyDepth }
            );
        }

        if (typeof obj === 'object' && obj !== null) {
            if (Array.isArray(obj)) {
                for (const item of obj) {
                    this.validateJsonDepth(item, depth + 1);
                }
            } else {
                for (const value of Object.values(obj)) {
                    this.validateJsonDepth(value, depth + 1);
                }
            }
        }
    }

    /**
     * Validates the parsed batch table
     * @param {BatchTable} batchTable - The parsed batch table
     * @param {Object} header - The B3DM header
     * @private
     */
    validateBatchTable(batchTable, header) {
        // Validate binary data consistency
        if (this.options.validateBinary && batchTable.binary) {
            this.validateBinaryConsistency(batchTable);
        }

        // Validate property definitions
        if (this.options.validateJSON) {
            this.validatePropertyDefinitions(batchTable);
        }
    }

    /**
     * Validates binary data consistency with JSON schema
     * @param {BatchTable} batchTable - The batch table to validate
     * @private
     */
    validateBinaryConsistency(batchTable) {
        const json = batchTable.json;
        const binary = batchTable.binary;

        if (!binary) return;

        let maxRequiredSize = 0;

        // Check each property that references binary data
        for (const [propertyName, propertyDef] of Object.entries(json)) {
            if (this.isBinaryPropertyDefinition(propertyDef)) {
                const byteOffset = propertyDef.byteOffset;
                const componentType = propertyDef.componentType || COMPONENT_TYPES.FLOAT;
                const type = propertyDef.type || DATA_TYPES.SCALAR;

                // For batch table, we need to know the batch count to validate size
                // This will be validated later when we have the feature table context
                const elementSize = TypedArrayUtils.calculateByteSize(type, componentType, 1);
                maxRequiredSize = Math.max(maxRequiredSize, byteOffset + elementSize);
            }
        }

        if (maxRequiredSize > binary.byteLength) {
            throw new B3dmError(
                `Batch table binary data too small: need at least ${maxRequiredSize} bytes, got ${binary.byteLength}`,
                B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                { required: maxRequiredSize, actual: binary.byteLength }
            );
        }
    }

    /**
     * Validates property definitions in the JSON
     * @param {BatchTable} batchTable - The batch table to validate
     * @private
     */
    validatePropertyDefinitions(batchTable) {
        for (const [propertyName, propertyDef] of Object.entries(batchTable.json)) {
            this.validatePropertyDefinition(propertyName, propertyDef);
        }
    }

    /**
     * Validates a single property definition
     * @param {string} propertyName - Name of the property
     * @param {*} propertyDef - Property definition
     * @private
     */
    validatePropertyDefinition(propertyName, propertyDef) {
        if (this.isBinaryPropertyDefinition(propertyDef)) {
            // Validate binary property definition
            if (typeof propertyDef.byteOffset !== 'number' || propertyDef.byteOffset < 0) {
                throw new B3dmError(
                    `Invalid byteOffset for property '${propertyName}': ${propertyDef.byteOffset}`,
                    B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                    { propertyName, byteOffset: propertyDef.byteOffset }
                );
            }

            if (propertyDef.componentType !== undefined &&
                !this.isValidComponentType(propertyDef.componentType)) {
                throw new B3dmError(
                    `Invalid componentType for property '${propertyName}': ${propertyDef.componentType}`,
                    B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                    { propertyName, componentType: propertyDef.componentType }
                );
            }

            if (propertyDef.type !== undefined &&
                !Object.values(DATA_TYPES).includes(propertyDef.type)) {
                throw new B3dmError(
                    `Invalid type for property '${propertyName}': ${propertyDef.type}`,
                    B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                    { propertyName, type: propertyDef.type }
                );
            }
        } else if (Array.isArray(propertyDef)) {
            // Validate array property
            if (propertyDef.length === 0) {
                throw new B3dmError(
                    `Property '${propertyName}' cannot be empty array`,
                    B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                    { propertyName }
                );
            }
        }
    }

    /**
     * Checks if a property definition references binary data
     * @param {*} propertyDef - Property definition
     * @returns {boolean} True if references binary data
     * @private
     */
    isBinaryPropertyDefinition(propertyDef) {
        return typeof propertyDef === 'object' &&
            propertyDef !== null &&
            !Array.isArray(propertyDef) &&
            'byteOffset' in propertyDef;
    }

    /**
     * Checks if a component type is valid (supports both numeric and string types)
     * @param {number|string} componentType - The component type to validate
     * @returns {boolean} True if valid
     * @private
     */
    isValidComponentType(componentType) {
        // Check numeric component types
        if (typeof componentType === 'number') {
            return Object.values(COMPONENT_TYPES).includes(componentType);
        }

        // Check string component types
        if (typeof componentType === 'string') {
            const upperType = componentType.toUpperCase();
            const validStringTypes = ['BYTE', 'UNSIGNED_BYTE', 'SHORT', 'UNSIGNED_SHORT', 'INT', 'UNSIGNED_INT', 'FLOAT', 'DOUBLE'];
            return validStringTypes.includes(upperType);
        }

        return false;
    }
}

/**
 * Represents a parsed batch table with properties and data access methods
 */
export class BatchTable {
    constructor(jsonData, binaryData, options = {}) {
        this.json = jsonData;
        this.binary = binaryData;
        this.options = options;
        this.properties = new Map();
        this.batchLength = 0;

        // Parse properties from JSON data
        this.parseProperties();
    }

    /**
     * Parses property definitions from JSON data
     * @private
     */
    parseProperties() {
        for (const [propertyName, propertyDef] of Object.entries(this.json)) {
            const property = new BatchProperty(propertyName, propertyDef, this.binary);
            this.properties.set(propertyName, property);

            // Update batch length based on property length
            const propertyLength = property.getLength();
            if (propertyLength > this.batchLength) {
                this.batchLength = propertyLength;
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
        const property = this.properties.get(propertyName);
        if (!property) {
            return undefined;
        }

        return property.getValue(batchId);
    }

    /**
     * Gets all property names
     * @returns {Array<string>} Array of property names
     */
    getPropertyNames() {
        return Array.from(this.properties.keys());
    }

    /**
     * Gets the batch length (number of batches)
     * @returns {number} Batch length
     */
    getBatchLength() {
        return this.batchLength;
    }

    /**
     * Checks if a property exists
     * @param {string} propertyName - The property name
     * @returns {boolean} True if property exists
     */
    hasProperty(propertyName) {
        return this.properties.has(propertyName);
    }

    /**
     * Gets all properties for a specific batch ID
     * @param {number} batchId - The batch ID
     * @returns {Object} Object with all property values
     */
    getBatchProperties(batchId) {
        const result = {};
        for (const [propertyName, property] of this.properties) {
            result[propertyName] = property.getValue(batchId);
        }
        return result;
    }

    /**
     * Gets property definition
     * @param {string} propertyName - The property name
     * @returns {BatchProperty} The property object
     */
    getPropertyDefinition(propertyName) {
        return this.properties.get(propertyName);
    }
}

/**
 * Represents a single batch table property
 */
export class BatchProperty {
    constructor(name, definition, binaryData) {
        this.name = name;
        this.definition = definition;
        this.binaryData = binaryData;
        this.cachedData = null;
        this.isDirectArray = false;
        this.values = null;
        this.length = 0;

        this.parseDefinition();
    }

    /**
     * Parses the property definition
     * @private
     */
    parseDefinition() {
        if (Array.isArray(this.definition)) {
            // Direct array of values
            this.isDirectArray = true;
            this.values = this.definition;
            this.length = this.definition.length;
        } else if (typeof this.definition === 'object' && this.definition !== null && 'byteOffset' in this.definition) {
            // Property definition with binary data reference
            this.isDirectArray = false;
            this.byteOffset = this.definition.byteOffset;
            this.componentType = this.definition.componentType || COMPONENT_TYPES.FLOAT;
            this.type = this.definition.type || DATA_TYPES.SCALAR;
            this.count = this.definition.count || 0;
            this.length = this.count;
        } else {
            // Single value - treat as array with one element
            this.isDirectArray = true;
            this.values = [this.definition];
            this.length = 1;
        }
    }

    /**
     * Gets the value for a specific index
     * @param {number} index - The index
     * @returns {*} The value
     */
    getValue(index) {
        if (this.isDirectArray) {
            return index < this.values.length ? this.values[index] : undefined;
        }

        // Load from binary data if needed
        if (!this.cachedData) {
            this.loadBinaryData();
        }

        return TypedArrayUtils.getElement(this.cachedData, index, this.type);
    }

    /**
     * Gets the length of this property
     * @returns {number} The length
     */
    getLength() {
        return this.length;
    }

    /**
     * Checks if this property uses binary data
     * @returns {boolean} True if uses binary data
     */
    usesBinaryData() {
        return !this.isDirectArray;
    }

    /**
     * Loads data from binary buffer
     * @private
     */
    loadBinaryData() {
        if (!this.binaryData) {
            throw new B3dmError(
                `Property '${this.name}' requires binary data but none is available`,
                B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                { propertyName: this.name }
            );
        }

        this.cachedData = TypedArrayUtils.createTypedArray(
            this.binaryData,
            this.byteOffset,
            this.type,
            this.componentType,
            this.count
        );
    }

    /**
     * Validates binary data access
     * @param {ArrayBuffer} binaryData - The binary data to validate against
     */
    validateBinaryAccess(binaryData) {
        if (!this.usesBinaryData()) {
            return;
        }

        const requiredBytes = TypedArrayUtils.calculateByteSize(this.type, this.componentType, this.count);

        if (this.byteOffset + requiredBytes > binaryData.byteLength) {
            throw new B3dmError(
                `Property '${this.name}' binary access out of bounds: need ${requiredBytes} bytes at offset ${this.byteOffset}, binary data size is ${binaryData.byteLength}`,
                B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                {
                    propertyName: this.name,
                    byteOffset: this.byteOffset,
                    requiredBytes,
                    binaryDataSize: binaryData.byteLength
                }
            );
        }
    }
}