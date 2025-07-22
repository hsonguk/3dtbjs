import { 
    COMPONENT_TYPES, 
    DATA_TYPES, 
    COMPONENT_TYPE_SIZES, 
    DATA_TYPE_COMPONENTS,
    B3dmError,
    B3DM_ERROR_CODES 
} from './B3dmConstants.js';

/**
 * Utility class for interpreting and processing typed arrays from binary data
 * Handles different data types and component types as defined in the glTF specification
 */
export class TypedArrayUtils {
    /**
     * Gets the TypedArray constructor for a given component type
     * @param {number|string} componentType - The component type constant or string
     * @returns {Function} The TypedArray constructor
     */
    static getTypedArrayConstructor(componentType) {
        // Normalize component type first
        const numericComponentType = this.normalizeComponentType(componentType);
        
        switch (numericComponentType) {
            case COMPONENT_TYPES.BYTE:
                return Int8Array;
            case COMPONENT_TYPES.UNSIGNED_BYTE:
                return Uint8Array;
            case COMPONENT_TYPES.SHORT:
                return Int16Array;
            case COMPONENT_TYPES.UNSIGNED_SHORT:
                return Uint16Array;
            case COMPONENT_TYPES.INT:
                return Int32Array;
            case COMPONENT_TYPES.UNSIGNED_INT:
                return Uint32Array;
            case COMPONENT_TYPES.FLOAT:
                return Float32Array;
            case COMPONENT_TYPES.DOUBLE:
                return Float64Array;
            default:
                throw new B3dmError(
                    `Unsupported component type: ${componentType} (normalized: ${numericComponentType})`,
                    B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                    { componentType, numericComponentType }
                );
        }
    }

    /**
     * Gets the byte size for a component type
     * @param {number|string} componentType - The component type constant or string
     * @returns {number} Size in bytes
     */
    static getComponentTypeSize(componentType) {
        // Handle string component types (convert to numeric)
        const numericComponentType = this.normalizeComponentType(componentType);
        
        const size = COMPONENT_TYPE_SIZES[numericComponentType];
        if (size === undefined) {
            throw new B3dmError(
                `Unknown component type: ${componentType} (normalized: ${numericComponentType})`,
                B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                { componentType, numericComponentType }
            );
        }
        return size;
    }

    /**
     * Normalizes component type from string or number to numeric value
     * @param {number|string} componentType - The component type
     * @returns {number} Numeric component type
     */
    static normalizeComponentType(componentType) {
        // If it's already a number, return as-is
        if (typeof componentType === 'number') {
            return componentType;
        }
        
        // Handle string component types
        if (typeof componentType === 'string') {
            const upperType = componentType.toUpperCase();
            switch (upperType) {
                case 'BYTE':
                    return COMPONENT_TYPES.BYTE;
                case 'UNSIGNED_BYTE':
                    return COMPONENT_TYPES.UNSIGNED_BYTE;
                case 'SHORT':
                    return COMPONENT_TYPES.SHORT;
                case 'UNSIGNED_SHORT':
                    return COMPONENT_TYPES.UNSIGNED_SHORT;
                case 'INT':
                    return COMPONENT_TYPES.INT;
                case 'UNSIGNED_INT':
                    return COMPONENT_TYPES.UNSIGNED_INT;
                case 'FLOAT':
                    return COMPONENT_TYPES.FLOAT;
                case 'DOUBLE':
                    return COMPONENT_TYPES.DOUBLE;
                default:
                    throw new B3dmError(
                        `Unknown string component type: ${componentType}`,
                        B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                        { componentType }
                    );
            }
        }
        
        return componentType;
    }

    /**
     * Gets the number of components for a data type
     * @param {string} dataType - The data type string (SCALAR, VEC2, VEC3, etc.)
     * @returns {number} Number of components
     */
    static getDataTypeComponents(dataType) {
        const components = DATA_TYPE_COMPONENTS[dataType];
        if (components === undefined) {
            throw new B3dmError(
                `Unknown data type: ${dataType}`,
                B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                { dataType }
            );
        }
        return components;
    }

    /**
     * Calculates the total byte size for an array property
     * @param {string} dataType - The data type (SCALAR, VEC2, etc.)
     * @param {number} componentType - The component type
     * @param {number} count - Number of elements
     * @returns {number} Total byte size
     */
    static calculateByteSize(dataType, componentType, count) {
        const componentSize = this.getComponentTypeSize(componentType);
        const componentsPerElement = this.getDataTypeComponents(dataType);
        return count * componentsPerElement * componentSize;
    }

    /**
     * Creates a typed array from binary data
     * @param {ArrayBuffer} buffer - The source buffer
     * @param {number} byteOffset - Offset in the buffer
     * @param {string} dataType - The data type (SCALAR, VEC2, etc.)
     * @param {number} componentType - The component type
     * @param {number} count - Number of elements
     * @returns {TypedArray} The created typed array
     */
    static createTypedArray(buffer, byteOffset, dataType, componentType, count) {
        const TypedArrayConstructor = this.getTypedArrayConstructor(componentType);
        const componentsPerElement = this.getDataTypeComponents(dataType);
        const totalComponents = count * componentsPerElement;
        
        // Validate buffer size
        const requiredBytes = this.calculateByteSize(dataType, componentType, count);
        if (byteOffset + requiredBytes > buffer.byteLength) {
            throw new B3dmError(
                `Insufficient buffer data: need ${requiredBytes} bytes at offset ${byteOffset}, buffer size is ${buffer.byteLength}`,
                B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                { byteOffset, requiredBytes, bufferSize: buffer.byteLength }
            );
        }
        
        return new TypedArrayConstructor(buffer, byteOffset, totalComponents);
    }

    /**
     * Extracts a single element from a typed array based on data type
     * @param {TypedArray} array - The source typed array
     * @param {number} index - Element index
     * @param {string} dataType - The data type
     * @returns {number|Array<number>} The extracted value(s)
     */
    static getElement(array, index, dataType) {
        const componentsPerElement = this.getDataTypeComponents(dataType);
        const startIndex = index * componentsPerElement;
        
        if (startIndex + componentsPerElement > array.length) {
            throw new B3dmError(
                `Array index out of bounds: trying to access element ${index} with ${componentsPerElement} components, array length is ${array.length}`,
                B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                { index, componentsPerElement, arrayLength: array.length }
            );
        }
        
        if (componentsPerElement === 1) {
            return array[startIndex];
        }
        
        // Return array for multi-component types
        const result = new Array(componentsPerElement);
        for (let i = 0; i < componentsPerElement; i++) {
            result[i] = array[startIndex + i];
        }
        return result;
    }

    /**
     * Sets a single element in a typed array based on data type
     * @param {TypedArray} array - The target typed array
     * @param {number} index - Element index
     * @param {string} dataType - The data type
     * @param {number|Array<number>} value - The value(s) to set
     */
    static setElement(array, index, dataType, value) {
        const componentsPerElement = this.getDataTypeComponents(dataType);
        const startIndex = index * componentsPerElement;
        
        if (startIndex + componentsPerElement > array.length) {
            throw new B3dmError(
                `Array index out of bounds: trying to set element ${index} with ${componentsPerElement} components, array length is ${array.length}`,
                B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                { index, componentsPerElement, arrayLength: array.length }
            );
        }
        
        if (componentsPerElement === 1) {
            array[startIndex] = value;
        } else {
            if (!Array.isArray(value) || value.length !== componentsPerElement) {
                throw new B3dmError(
                    `Invalid value for data type ${dataType}: expected array of length ${componentsPerElement}`,
                    B3DM_ERROR_CODES.BATCH_TABLE_ERROR,
                    { dataType, expectedLength: componentsPerElement, actualValue: value }
                );
            }
            
            for (let i = 0; i < componentsPerElement; i++) {
                array[startIndex + i] = value[i];
            }
        }
    }

    /**
     * Converts a typed array to a regular JavaScript array with proper element grouping
     * @param {TypedArray} typedArray - The source typed array
     * @param {string} dataType - The data type
     * @returns {Array} Array of elements (scalars or arrays)
     */
    static toArray(typedArray, dataType) {
        const componentsPerElement = this.getDataTypeComponents(dataType);
        const elementCount = typedArray.length / componentsPerElement;
        const result = new Array(elementCount);
        
        for (let i = 0; i < elementCount; i++) {
            result[i] = this.getElement(typedArray, i, dataType);
        }
        
        return result;
    }

    /**
     * Creates a typed array from a regular JavaScript array
     * @param {Array} array - The source array
     * @param {string} dataType - The data type
     * @param {number} componentType - The component type
     * @returns {TypedArray} The created typed array
     */
    static fromArray(array, dataType, componentType) {
        const TypedArrayConstructor = this.getTypedArrayConstructor(componentType);
        const componentsPerElement = this.getDataTypeComponents(dataType);
        const totalComponents = array.length * componentsPerElement;
        
        const typedArray = new TypedArrayConstructor(totalComponents);
        
        for (let i = 0; i < array.length; i++) {
            this.setElement(typedArray, i, dataType, array[i]);
        }
        
        return typedArray;
    }

    /**
     * Validates that a typed array matches the expected format
     * @param {TypedArray} array - The array to validate
     * @param {string} dataType - Expected data type
     * @param {number} componentType - Expected component type
     * @param {number} expectedCount - Expected element count
     * @returns {boolean} True if valid
     */
    static validateArray(array, dataType, componentType, expectedCount) {
        try {
            const ExpectedConstructor = this.getTypedArrayConstructor(componentType);
            if (!(array instanceof ExpectedConstructor)) {
                return false;
            }
            
            const componentsPerElement = this.getDataTypeComponents(dataType);
            const expectedLength = expectedCount * componentsPerElement;
            
            return array.length === expectedLength;
        } catch (error) {
            return false;
        }
    }

    /**
     * Interpolates between two values based on data type
     * @param {number|Array<number>} a - First value
     * @param {number|Array<number>} b - Second value
     * @param {number} t - Interpolation factor (0-1)
     * @param {string} dataType - The data type
     * @returns {number|Array<number>} Interpolated value
     */
    static interpolate(a, b, t, dataType) {
        const componentsPerElement = this.getDataTypeComponents(dataType);
        
        if (componentsPerElement === 1) {
            return a + (b - a) * t;
        }
        
        const result = new Array(componentsPerElement);
        for (let i = 0; i < componentsPerElement; i++) {
            result[i] = a[i] + (b[i] - a[i]) * t;
        }
        return result;
    }

    /**
     * Normalizes values in a typed array to 0-1 range
     * @param {TypedArray} array - The array to normalize
     * @param {string} dataType - The data type
     * @returns {Float32Array} Normalized array
     */
    static normalize(array, dataType) {
        const componentsPerElement = this.getDataTypeComponents(dataType);
        const elementCount = array.length / componentsPerElement;
        const result = new Float32Array(array.length);
        
        // Find min/max for each component
        const mins = new Array(componentsPerElement).fill(Infinity);
        const maxs = new Array(componentsPerElement).fill(-Infinity);
        
        for (let i = 0; i < elementCount; i++) {
            const startIndex = i * componentsPerElement;
            for (let j = 0; j < componentsPerElement; j++) {
                const value = array[startIndex + j];
                mins[j] = Math.min(mins[j], value);
                maxs[j] = Math.max(maxs[j], value);
            }
        }
        
        // Normalize each component
        for (let i = 0; i < elementCount; i++) {
            const startIndex = i * componentsPerElement;
            for (let j = 0; j < componentsPerElement; j++) {
                const value = array[startIndex + j];
                const range = maxs[j] - mins[j];
                result[startIndex + j] = range > 0 ? (value - mins[j]) / range : 0;
            }
        }
        
        return result;
    }
}