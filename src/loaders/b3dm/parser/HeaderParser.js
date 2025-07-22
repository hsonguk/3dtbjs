import { 
    B3dmError, 
    B3DM_ERROR_CODES, 
    B3DM_HEADER_BYTE_LENGTH, 
    B3DM_MAGIC,
    B3DM_SUPPORTED_VERSION 
} from '../utils/B3dmConstants.js';
import { BinaryReader } from '../utils/BinaryReader.js';

/**
 * Parser for B3DM binary header structure
 * Handles the 28-byte header that contains format information and data offsets
 */
export class HeaderParser {
    constructor(options = {}) {
        this.options = {
            validateMagic: true,
            validateVersion: true,
            validateSizes: true,
            ...options
        };
    }

    /**
     * Parses the B3DM header from ArrayBuffer
     * @param {ArrayBuffer} arrayBuffer - The B3DM file data
     * @returns {Object} Parsed header structure
     */
    parse(arrayBuffer) {
        if (!arrayBuffer || arrayBuffer.byteLength < B3DM_HEADER_BYTE_LENGTH) {
            throw new B3dmError(
                `Insufficient data for B3DM header: need ${B3DM_HEADER_BYTE_LENGTH} bytes, got ${arrayBuffer ? arrayBuffer.byteLength : 0}`,
                B3DM_ERROR_CODES.INSUFFICIENT_DATA,
                { required: B3DM_HEADER_BYTE_LENGTH, actual: arrayBuffer ? arrayBuffer.byteLength : 0 }
            );
        }

        const reader = new BinaryReader(arrayBuffer);

        try {
            // Parse header fields
            const header = {
                magic: reader.readString(4),
                version: reader.readUint32(true),
                byteLength: reader.readUint32(true),
                featureTableJSONByteLength: reader.readUint32(true),
                featureTableBinaryByteLength: reader.readUint32(true),
                batchTableJSONByteLength: reader.readUint32(true),
                batchTableBinaryByteLength: reader.readUint32(true)
            };

            // Validate header if enabled
            if (this.options.validateMagic) {
                this.validateMagic(header.magic);
            }

            if (this.options.validateVersion) {
                this.validateVersion(header.version);
            }

            if (this.options.validateSizes) {
                this.validateSizes(header, arrayBuffer.byteLength);
            }

            // Calculate derived properties
            header.headerByteLength = B3DM_HEADER_BYTE_LENGTH;
            header.featureTableByteLength = header.featureTableJSONByteLength + header.featureTableBinaryByteLength;
            header.batchTableByteLength = header.batchTableJSONByteLength + header.batchTableBinaryByteLength;
            
            // Calculate GLTF offset and length
            header.gltfByteOffset = B3DM_HEADER_BYTE_LENGTH + 
                                   header.featureTableByteLength + 
                                   header.batchTableByteLength;
            header.gltfByteLength = header.byteLength - header.gltfByteOffset;

            return header;

        } catch (error) {
            if (error instanceof B3dmError) {
                throw error;
            }
            
            throw new B3dmError(
                `Failed to parse B3DM header: ${error.message}`,
                B3DM_ERROR_CODES.INVALID_HEADER,
                { originalError: error }
            );
        }
    }

    /**
     * Validates the magic number
     * @param {string} magic - The magic string from header
     * @private
     */
    validateMagic(magic) {
        if (magic !== B3DM_MAGIC) {
            throw new B3dmError(
                `Invalid B3DM magic number: expected "${B3DM_MAGIC}", got "${magic}"`,
                B3DM_ERROR_CODES.INVALID_MAGIC,
                { expected: B3DM_MAGIC, actual: magic }
            );
        }
    }

    /**
     * Validates the version number
     * @param {number} version - The version from header
     * @private
     */
    validateVersion(version) {
        if (version !== B3DM_SUPPORTED_VERSION) {
            throw new B3dmError(
                `Unsupported B3DM version: expected ${B3DM_SUPPORTED_VERSION}, got ${version}`,
                B3DM_ERROR_CODES.UNSUPPORTED_VERSION,
                { expected: B3DM_SUPPORTED_VERSION, actual: version }
            );
        }
    }

    /**
     * Validates the size fields in the header
     * @param {Object} header - The parsed header
     * @param {number} actualFileSize - The actual file size
     * @private
     */
    validateSizes(header, actualFileSize) {
        // Validate that byteLength matches actual file size
        if (header.byteLength !== actualFileSize) {
            throw new B3dmError(
                `B3DM byteLength mismatch: header says ${header.byteLength}, actual file size is ${actualFileSize}`,
                B3DM_ERROR_CODES.INVALID_HEADER,
                { headerSize: header.byteLength, actualSize: actualFileSize }
            );
        }

        // Validate that all sizes are non-negative
        const sizeFields = [
            'featureTableJSONByteLength',
            'featureTableBinaryByteLength', 
            'batchTableJSONByteLength',
            'batchTableBinaryByteLength'
        ];

        for (const field of sizeFields) {
            if (header[field] < 0) {
                throw new B3dmError(
                    `Invalid ${field}: cannot be negative (${header[field]})`,
                    B3DM_ERROR_CODES.INVALID_HEADER,
                    { field, value: header[field] }
                );
            }
        }

        // Validate that total size doesn't exceed file size
        const totalTableSize = header.featureTableJSONByteLength + 
                              header.featureTableBinaryByteLength +
                              header.batchTableJSONByteLength +
                              header.batchTableBinaryByteLength;

        const minimumFileSize = B3DM_HEADER_BYTE_LENGTH + totalTableSize;
        
        if (minimumFileSize > actualFileSize) {
            throw new B3dmError(
                `B3DM file too small: need at least ${minimumFileSize} bytes for header and tables, got ${actualFileSize}`,
                B3DM_ERROR_CODES.INVALID_HEADER,
                { required: minimumFileSize, actual: actualFileSize }
            );
        }

        // Validate that there's space for GLTF data
        if (minimumFileSize >= actualFileSize) {
            throw new B3dmError(
                'No space left for GLTF data in B3DM file',
                B3DM_ERROR_CODES.GLTF_EXTRACTION_ERROR,
                { headerAndTablesSize: minimumFileSize, fileSize: actualFileSize }
            );
        }
    }

    /**
     * Creates a summary of the header for debugging
     * @param {Object} header - The parsed header
     * @returns {Object} Header summary
     */
    static createSummary(header) {
        return {
            magic: header.magic,
            version: header.version,
            totalSize: header.byteLength,
            featureTable: {
                jsonSize: header.featureTableJSONByteLength,
                binarySize: header.featureTableBinaryByteLength,
                totalSize: header.featureTableByteLength
            },
            batchTable: {
                jsonSize: header.batchTableJSONByteLength,
                binarySize: header.batchTableBinaryByteLength,
                totalSize: header.batchTableByteLength
            },
            gltf: {
                offset: header.gltfByteOffset,
                size: header.gltfByteLength
            }
        };
    }
}