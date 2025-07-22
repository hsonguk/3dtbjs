import { B3dmError, B3DM_ERROR_CODES } from './B3dmConstants.js';

/**
 * Utility class for reading binary data from ArrayBuffer with proper error handling
 * and boundary checking. Provides a convenient wrapper around DataView operations.
 */
export class BinaryReader {
    constructor(arrayBuffer, byteOffset = 0, byteLength = null) {
        if (!arrayBuffer || !(arrayBuffer instanceof ArrayBuffer)) {
            throw new B3dmError(
                'Invalid ArrayBuffer provided to BinaryReader',
                B3DM_ERROR_CODES.INSUFFICIENT_DATA
            );
        }

        this.arrayBuffer = arrayBuffer;
        this.byteOffset = byteOffset;
        this.byteLength = byteLength !== null ? byteLength : arrayBuffer.byteLength - byteOffset;
        this.dataView = new DataView(arrayBuffer, byteOffset, this.byteLength);
        this.position = 0;
    }

    /**
     * Gets the current position in the buffer
     * @returns {number} Current position
     */
    getPosition() {
        return this.position;
    }

    /**
     * Sets the current position in the buffer
     * @param {number} position - New position
     */
    setPosition(position) {
        this.checkBounds(position, 0);
        this.position = position;
    }

    /**
     * Gets the remaining bytes from current position
     * @returns {number} Remaining bytes
     */
    getRemainingBytes() {
        return this.byteLength - this.position;
    }

    /**
     * Checks if there are enough bytes remaining for a read operation
     * @param {number} bytesNeeded - Number of bytes needed
     * @returns {boolean} True if enough bytes are available
     */
    hasBytes(bytesNeeded) {
        return this.getRemainingBytes() >= bytesNeeded;
    }

    /**
     * Checks buffer bounds and throws error if out of bounds
     * @param {number} position - Position to check
     * @param {number} size - Size of data to read
     * @private
     */
    checkBounds(position, size) {
        if (position < 0 || position + size > this.byteLength) {
            throw new B3dmError(
                `Buffer overrun: trying to read ${size} bytes at position ${position}, buffer size is ${this.byteLength}`,
                B3DM_ERROR_CODES.INSUFFICIENT_DATA,
                { position, size, bufferSize: this.byteLength }
            );
        }
    }

    /**
     * Reads an 8-bit signed integer
     * @param {boolean} advance - Whether to advance position (default: true)
     * @returns {number} The read value
     */
    readInt8(advance = true) {
        this.checkBounds(this.position, 1);
        const value = this.dataView.getInt8(this.position);
        if (advance) this.position += 1;
        return value;
    }

    /**
     * Reads an 8-bit unsigned integer
     * @param {boolean} advance - Whether to advance position (default: true)
     * @returns {number} The read value
     */
    readUint8(advance = true) {
        this.checkBounds(this.position, 1);
        const value = this.dataView.getUint8(this.position);
        if (advance) this.position += 1;
        return value;
    }

    /**
     * Reads a 16-bit signed integer
     * @param {boolean} littleEndian - Whether to use little endian (default: true)
     * @param {boolean} advance - Whether to advance position (default: true)
     * @returns {number} The read value
     */
    readInt16(littleEndian = true, advance = true) {
        this.checkBounds(this.position, 2);
        const value = this.dataView.getInt16(this.position, littleEndian);
        if (advance) this.position += 2;
        return value;
    }

    /**
     * Reads a 16-bit unsigned integer
     * @param {boolean} littleEndian - Whether to use little endian (default: true)
     * @param {boolean} advance - Whether to advance position (default: true)
     * @returns {number} The read value
     */
    readUint16(littleEndian = true, advance = true) {
        this.checkBounds(this.position, 2);
        const value = this.dataView.getUint16(this.position, littleEndian);
        if (advance) this.position += 2;
        return value;
    }

    /**
     * Reads a 32-bit signed integer
     * @param {boolean} littleEndian - Whether to use little endian (default: true)
     * @param {boolean} advance - Whether to advance position (default: true)
     * @returns {number} The read value
     */
    readInt32(littleEndian = true, advance = true) {
        this.checkBounds(this.position, 4);
        const value = this.dataView.getInt32(this.position, littleEndian);
        if (advance) this.position += 4;
        return value;
    }

    /**
     * Reads a 32-bit unsigned integer
     * @param {boolean} littleEndian - Whether to use little endian (default: true)
     * @param {boolean} advance - Whether to advance position (default: true)
     * @returns {number} The read value
     */
    readUint32(littleEndian = true, advance = true) {
        this.checkBounds(this.position, 4);
        const value = this.dataView.getUint32(this.position, littleEndian);
        if (advance) this.position += 4;
        return value;
    }

    /**
     * Reads a 32-bit float
     * @param {boolean} littleEndian - Whether to use little endian (default: true)
     * @param {boolean} advance - Whether to advance position (default: true)
     * @returns {number} The read value
     */
    readFloat32(littleEndian = true, advance = true) {
        this.checkBounds(this.position, 4);
        const value = this.dataView.getFloat32(this.position, littleEndian);
        if (advance) this.position += 4;
        return value;
    }

    /**
     * Reads a 64-bit float
     * @param {boolean} littleEndian - Whether to use little endian (default: true)
     * @param {boolean} advance - Whether to advance position (default: true)
     * @returns {number} The read value
     */
    readFloat64(littleEndian = true, advance = true) {
        this.checkBounds(this.position, 8);
        const value = this.dataView.getFloat64(this.position, littleEndian);
        if (advance) this.position += 8;
        return value;
    }

    /**
     * Reads a string of specified length
     * @param {number} length - Number of bytes to read
     * @param {string} encoding - Text encoding (default: 'utf-8')
     * @param {boolean} advance - Whether to advance position (default: true)
     * @returns {string} The read string
     */
    readString(length, encoding = 'utf-8', advance = true) {
        this.checkBounds(this.position, length);
        
        const bytes = new Uint8Array(this.arrayBuffer, this.byteOffset + this.position, length);
        const decoder = new TextDecoder(encoding);
        const value = decoder.decode(bytes);
        
        if (advance) this.position += length;
        return value;
    }

    /**
     * Reads a null-terminated string
     * @param {string} encoding - Text encoding (default: 'utf-8')
     * @param {number} maxLength - Maximum length to read (default: remaining bytes)
     * @returns {string} The read string
     */
    readCString(encoding = 'utf-8', maxLength = null) {
        const startPosition = this.position;
        const searchLength = maxLength !== null ? 
            Math.min(maxLength, this.getRemainingBytes()) : 
            this.getRemainingBytes();
        
        let length = 0;
        while (length < searchLength && this.readUint8(false) !== 0) {
            length++;
            this.position++;
        }
        
        // Reset position to read the string
        this.position = startPosition;
        const value = this.readString(length, encoding, true);
        
        // Skip the null terminator if we found one
        if (length < searchLength) {
            this.position++;
        }
        
        return value;
    }

    /**
     * Reads raw bytes as Uint8Array
     * @param {number} length - Number of bytes to read
     * @param {boolean} advance - Whether to advance position (default: true)
     * @returns {Uint8Array} The read bytes
     */
    readBytes(length, advance = true) {
        this.checkBounds(this.position, length);
        
        const bytes = new Uint8Array(this.arrayBuffer, this.byteOffset + this.position, length);
        
        if (advance) this.position += length;
        return bytes;
    }

    /**
     * Creates a typed array from the current position
     * @param {Function} TypedArrayConstructor - The typed array constructor (e.g., Float32Array)
     * @param {number} count - Number of elements to read
     * @param {boolean} advance - Whether to advance position (default: true)
     * @returns {TypedArray} The created typed array
     */
    readTypedArray(TypedArrayConstructor, count, advance = true) {
        const bytesPerElement = TypedArrayConstructor.BYTES_PER_ELEMENT;
        const totalBytes = count * bytesPerElement;
        
        this.checkBounds(this.position, totalBytes);
        
        const array = new TypedArrayConstructor(
            this.arrayBuffer, 
            this.byteOffset + this.position, 
            count
        );
        
        if (advance) this.position += totalBytes;
        return array;
    }

    /**
     * Skips the specified number of bytes
     * @param {number} bytes - Number of bytes to skip
     */
    skip(bytes) {
        this.checkBounds(this.position, bytes);
        this.position += bytes;
    }

    /**
     * Aligns the position to the specified boundary
     * @param {number} alignment - Alignment boundary (e.g., 4 for 4-byte alignment)
     */
    align(alignment) {
        const remainder = this.position % alignment;
        if (remainder !== 0) {
            this.skip(alignment - remainder);
        }
    }

    /**
     * Creates a sub-reader from the current position
     * @param {number} length - Length of the sub-buffer
     * @param {boolean} advance - Whether to advance position (default: true)
     * @returns {BinaryReader} New BinaryReader for the sub-buffer
     */
    createSubReader(length, advance = true) {
        this.checkBounds(this.position, length);
        
        const subReader = new BinaryReader(
            this.arrayBuffer,
            this.byteOffset + this.position,
            length
        );
        
        if (advance) this.position += length;
        return subReader;
    }

    /**
     * Reads a slice of the buffer as ArrayBuffer
     * @param {number} length - Number of bytes to read
     * @param {boolean} advance - Whether to advance position (default: true)
     * @returns {ArrayBuffer} The sliced buffer
     */
    readArrayBuffer(length, advance = true) {
        this.checkBounds(this.position, length);
        
        const buffer = this.arrayBuffer.slice(
            this.byteOffset + this.position,
            this.byteOffset + this.position + length
        );
        
        if (advance) this.position += length;
        return buffer;
    }
}