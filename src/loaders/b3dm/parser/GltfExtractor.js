import { BinaryReader } from '../utils/BinaryReader.js';
import { 
    B3dmError, 
    B3DM_ERROR_CODES, 
    B3DM_HEADER_BYTE_LENGTH 
} from '../utils/B3dmConstants.js';

/**
 * Extractor for GLTF data from B3DM files
 * Handles both GLB (binary) and JSON GLTF formats embedded in B3DM
 */
export class GltfExtractor {
    constructor(options = {}) {
        this.options = {
            validateGltf: true,
            supportJsonGltf: true,
            supportGlbGltf: true,
            minGltfSize: 12, // Minimum size for a valid GLB header
            ...options
        };
    }

    /**
     * Extracts GLTF data from B3DM file
     * @param {ArrayBuffer} arrayBuffer - The B3DM file data
     * @param {Object} header - The parsed B3DM header
     * @returns {ArrayBuffer} The extracted GLTF data
     */
    extract(arrayBuffer, header) {
        try {
            // Calculate GLTF offset and size
            const gltfOffset = this.calculateGltfOffset(header);
            const gltfSize = header.byteLength - gltfOffset;

            // Validate GLTF size
            if (gltfSize <= 0) {
                throw new B3dmError(
                    'No GLTF data found in B3DM file',
                    B3DM_ERROR_CODES.GLTF_EXTRACTION_ERROR,
                    { gltfOffset, totalSize: header.byteLength }
                );
            }

            if (gltfSize < this.options.minGltfSize) {
                throw new B3dmError(
                    `GLTF data too small: ${gltfSize} bytes (minimum: ${this.options.minGltfSize})`,
                    B3DM_ERROR_CODES.GLTF_EXTRACTION_ERROR,
                    { gltfSize, minSize: this.options.minGltfSize }
                );
            }

            // Extract GLTF data
            const gltfData = arrayBuffer.slice(gltfOffset, gltfOffset + gltfSize);

            // Validate and process GLTF data
            if (this.options.validateGltf) {
                this.validateGltfData(gltfData);
            }

            return this.processGltfData(gltfData);

        } catch (error) {
            if (error instanceof B3dmError) {
                throw error;
            }
            
            throw new B3dmError(
                `Failed to extract GLTF data: ${error.message}`,
                B3DM_ERROR_CODES.GLTF_EXTRACTION_ERROR,
                { originalError: error }
            );
        }
    }

    /**
     * Calculates the offset where GLTF data begins in the B3DM file
     * @param {Object} header - The parsed B3DM header
     * @returns {number} GLTF data offset
     * @private
     */
    calculateGltfOffset(header) {
        return B3DM_HEADER_BYTE_LENGTH +
               header.featureTableJSONByteLength +
               header.featureTableBinaryByteLength +
               header.batchTableJSONByteLength +
               header.batchTableBinaryByteLength;
    }

    /**
     * Validates the extracted GLTF data
     * @param {ArrayBuffer} gltfData - The GLTF data to validate
     * @private
     */
    validateGltfData(gltfData) {
        if (!gltfData || gltfData.byteLength === 0) {
            throw new B3dmError(
                'GLTF data is empty',
                B3DM_ERROR_CODES.GLTF_EXTRACTION_ERROR
            );
        }

        const format = this.detectGltfFormat(gltfData);
        
        switch (format) {
            case 'GLB':
                this.validateGlbFormat(gltfData);
                break;
            case 'JSON':
                this.validateJsonGltfFormat(gltfData);
                break;
            case 'UNKNOWN':
                if (this.options.validateGltf) {
                    throw new B3dmError(
                        'Unknown GLTF format detected',
                        B3DM_ERROR_CODES.GLTF_EXTRACTION_ERROR,
                        { dataSize: gltfData.byteLength }
                    );
                }
                break;
        }
    }

    /**
     * Detects the format of GLTF data (GLB or JSON)
     * @param {ArrayBuffer} gltfData - The GLTF data
     * @returns {string} Format type: 'GLB', 'JSON', or 'UNKNOWN'
     * @private
     */
    detectGltfFormat(gltfData) {
        if (gltfData.byteLength < 4) {
            return 'UNKNOWN';
        }

        const reader = new BinaryReader(gltfData);
        
        // Check for GLB magic number (0x46546C67 = "glTF")
        const magic = reader.readUint32(true);
        if (magic === 0x46546C67) {
            return 'GLB';
        }

        // Check for JSON GLTF (starts with '{')
        reader.setPosition(0);
        const firstByte = reader.readUint8();
        if (firstByte === 0x7B) { // '{'
            return 'JSON';
        }

        // Check for whitespace before JSON
        reader.setPosition(0);
        const firstFewBytes = reader.readString(Math.min(10, gltfData.byteLength));
        if (firstFewBytes.trim().startsWith('{')) {
            return 'JSON';
        }

        return 'UNKNOWN';
    }

    /**
     * Validates GLB format structure
     * @param {ArrayBuffer} gltfData - The GLB data
     * @private
     */
    validateGlbFormat(gltfData) {
        if (gltfData.byteLength < 12) {
            throw new B3dmError(
                `GLB file too small: ${gltfData.byteLength} bytes (minimum: 12)`,
                B3DM_ERROR_CODES.GLTF_EXTRACTION_ERROR,
                { actualSize: gltfData.byteLength }
            );
        }

        const reader = new BinaryReader(gltfData);
        
        // Read GLB header
        const magic = reader.readUint32(true);
        const version = reader.readUint32(true);
        const length = reader.readUint32(true);

        // Validate magic number
        if (magic !== 0x46546C67) {
            throw new B3dmError(
                `Invalid GLB magic number: 0x${magic.toString(16)} (expected: 0x46546C67)`,
                B3DM_ERROR_CODES.GLTF_EXTRACTION_ERROR,
                { magic }
            );
        }

        // Validate version
        if (version !== 2) {
            console.warn(`GLB version ${version} may not be fully supported (expected: 2)`);
        }

        // Validate length
        if (length !== gltfData.byteLength) {
            throw new B3dmError(
                `GLB length mismatch: header says ${length}, actual size is ${gltfData.byteLength}`,
                B3DM_ERROR_CODES.GLTF_EXTRACTION_ERROR,
                { headerLength: length, actualLength: gltfData.byteLength }
            );
        }

        // Validate that there's at least one chunk (JSON chunk is required)
        if (gltfData.byteLength < 20) { // 12 bytes header + 8 bytes minimum chunk header
            throw new B3dmError(
                'GLB file missing required JSON chunk',
                B3DM_ERROR_CODES.GLTF_EXTRACTION_ERROR
            );
        }
    }

    /**
     * Validates JSON GLTF format
     * @param {ArrayBuffer} gltfData - The JSON GLTF data
     * @private
     */
    validateJsonGltfFormat(gltfData) {
        if (!this.options.supportJsonGltf) {
            throw new B3dmError(
                'JSON GLTF format is not supported',
                B3DM_ERROR_CODES.GLTF_EXTRACTION_ERROR
            );
        }

        try {
            // Try to parse as JSON to validate structure
            const reader = new BinaryReader(gltfData);
            const jsonString = reader.readString(gltfData.byteLength, 'utf-8');
            const gltfJson = JSON.parse(jsonString.trim());

            // Basic GLTF validation
            if (!gltfJson.asset) {
                throw new B3dmError(
                    'Invalid GLTF: missing required "asset" property',
                    B3DM_ERROR_CODES.GLTF_EXTRACTION_ERROR
                );
            }

            if (!gltfJson.asset.version) {
                throw new B3dmError(
                    'Invalid GLTF: missing required "asset.version" property',
                    B3DM_ERROR_CODES.GLTF_EXTRACTION_ERROR
                );
            }

        } catch (jsonError) {
            throw new B3dmError(
                `Invalid JSON GLTF: ${jsonError.message}`,
                B3DM_ERROR_CODES.GLTF_EXTRACTION_ERROR,
                { originalError: jsonError }
            );
        }
    }

    /**
     * Processes the extracted GLTF data
     * @param {ArrayBuffer} gltfData - The raw GLTF data
     * @returns {ArrayBuffer} Processed GLTF data
     * @private
     */
    processGltfData(gltfData) {
        const format = this.detectGltfFormat(gltfData);
        
        switch (format) {
            case 'GLB':
                return this.processGlbData(gltfData);
            case 'JSON':
                return this.processJsonGltfData(gltfData);
            default:
                // Return as-is for unknown formats
                console.warn('Unknown GLTF format, returning raw data');
                return gltfData;
        }
    }

    /**
     * Processes GLB format data
     * @param {ArrayBuffer} glbData - The GLB data
     * @returns {ArrayBuffer} Processed GLB data
     * @private
     */
    processGlbData(glbData) {
        // For GLB, we typically return the data as-is since Babylon.js can handle it directly
        // However, we could perform additional processing here if needed
        
        if (this.options.validateGltf) {
            // Additional GLB-specific processing could go here
            this.analyzeGlbChunks(glbData);
        }
        
        return glbData;
    }

    /**
     * Processes JSON GLTF format data
     * @param {ArrayBuffer} jsonGltfData - The JSON GLTF data
     * @returns {ArrayBuffer} Processed GLTF data (might be converted to GLB)
     * @private
     */
    processJsonGltfData(jsonGltfData) {
        // For JSON GLTF, we could convert it to GLB for better performance
        // For now, return as-is since Babylon.js can handle JSON GLTF
        
        if (this.options.validateGltf) {
            // Additional JSON GLTF-specific processing could go here
            this.analyzeJsonGltf(jsonGltfData);
        }
        
        return jsonGltfData;
    }

    /**
     * Analyzes GLB chunks for validation and debugging
     * @param {ArrayBuffer} glbData - The GLB data
     * @private
     */
    analyzeGlbChunks(glbData) {
        const reader = new BinaryReader(glbData);
        
        // Skip GLB header
        reader.skip(12);
        
        const chunks = [];
        
        while (reader.getRemainingBytes() >= 8) {
            const chunkLength = reader.readUint32(true);
            const chunkType = reader.readUint32(true);
            
            if (reader.getRemainingBytes() < chunkLength) {
                console.warn(`GLB chunk extends beyond file: chunk length ${chunkLength}, remaining bytes ${reader.getRemainingBytes()}`);
                break;
            }
            
            const chunkTypeString = String.fromCharCode(
                (chunkType >> 0) & 0xFF,
                (chunkType >> 8) & 0xFF,
                (chunkType >> 16) & 0xFF,
                (chunkType >> 24) & 0xFF
            );
            
            chunks.push({
                type: chunkTypeString,
                length: chunkLength,
                offset: reader.getPosition()
            });
            
            reader.skip(chunkLength);
        }
        
        // Log chunk information for debugging
        if (chunks.length > 0) {
            console.debug('GLB chunks:', chunks);
        }
    }

    /**
     * Analyzes JSON GLTF for validation and debugging
     * @param {ArrayBuffer} jsonGltfData - The JSON GLTF data
     * @private
     */
    analyzeJsonGltf(jsonGltfData) {
        try {
            const reader = new BinaryReader(jsonGltfData);
            const jsonString = reader.readString(jsonGltfData.byteLength, 'utf-8');
            const gltf = JSON.parse(jsonString.trim());
            
            // Log basic GLTF information for debugging
            console.debug('GLTF analysis:', {
                version: gltf.asset?.version,
                generator: gltf.asset?.generator,
                scenes: gltf.scenes?.length || 0,
                nodes: gltf.nodes?.length || 0,
                meshes: gltf.meshes?.length || 0,
                materials: gltf.materials?.length || 0,
                textures: gltf.textures?.length || 0,
                buffers: gltf.buffers?.length || 0
            });
            
        } catch (error) {
            console.warn('Failed to analyze JSON GLTF:', error.message);
        }
    }

    /**
     * Gets information about the extracted GLTF data
     * @param {ArrayBuffer} gltfData - The GLTF data
     * @returns {Object} GLTF information
     */
    getGltfInfo(gltfData) {
        const format = this.detectGltfFormat(gltfData);
        const info = {
            format,
            size: gltfData.byteLength,
            isValid: false
        };

        try {
            this.validateGltfData(gltfData);
            info.isValid = true;
        } catch (error) {
            info.validationError = error.message;
        }

        if (format === 'GLB' && info.isValid) {
            const reader = new BinaryReader(gltfData);
            reader.skip(4); // Skip magic
            info.version = reader.readUint32(true);
            info.length = reader.readUint32(true);
        }

        return info;
    }
}