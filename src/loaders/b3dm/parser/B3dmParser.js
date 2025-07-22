import { HeaderParser } from './HeaderParser.js';
import { FeatureTableParser } from './FeatureTableParser.js';
import { BatchTableParser } from './BatchTableParser.js';
import { GltfExtractor } from './GltfExtractor.js';
import { B3dmError, B3DM_ERROR_CODES } from '../utils/B3dmConstants.js';

/**
 * Core B3DM parsing logic that coordinates the parsing of all B3DM components
 */
export class B3dmParser {
    constructor(options = {}) {
        this.headerParser = new HeaderParser(options);
        this.featureTableParser = new FeatureTableParser(options);
        this.batchTableParser = new BatchTableParser(options);
        this.gltfExtractor = new GltfExtractor(options);
        
        this.options = options;
    }

    /**
     * Parses a complete B3DM file from ArrayBuffer
     * @param {ArrayBuffer} arrayBuffer - The B3DM file data
     * @returns {Promise<Object>} Parsed B3DM data structure
     */
    async parse(arrayBuffer) {
        try {
            // Parse the header first
            const header = this.headerParser.parse(arrayBuffer);
            
            // Parse feature table if present
            const featureTable = header.featureTableJSONByteLength > 0 ? 
                this.featureTableParser.parse(arrayBuffer, header) : null;
            
            // Parse batch table if present
            const batchTable = header.batchTableJSONByteLength > 0 ? 
                this.batchTableParser.parse(arrayBuffer, header) : null;
            
            // Extract GLTF data
            const gltfData = this.gltfExtractor.extract(arrayBuffer, header);
            
            return {
                header,
                featureTable,
                batchTable,
                gltfData,
                originalBuffer: arrayBuffer
            };
            
        } catch (error) {
            if (error instanceof B3dmError) {
                throw error;
            }
            
            throw new B3dmError(
                `Failed to parse B3DM: ${error.message}`,
                B3DM_ERROR_CODES.PARSING_ERROR,
                { originalError: error }
            );
        }
    }

    /**
     * Validates that the ArrayBuffer contains valid B3DM data
     * @param {ArrayBuffer} arrayBuffer - The data to validate
     * @returns {boolean} True if valid B3DM data
     */
    static isValidB3dm(arrayBuffer) {
        if (!arrayBuffer || arrayBuffer.byteLength < 28) {
            return false;
        }
        
        const dataView = new DataView(arrayBuffer);
        const magic = String.fromCharCode(
            dataView.getUint8(0),
            dataView.getUint8(1),
            dataView.getUint8(2),
            dataView.getUint8(3)
        );
        
        return magic === 'b3dm';
    }
}