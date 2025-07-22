/**
 * B3DM format constants and error definitions
 */

// B3DM Format Constants
export const B3DM_HEADER_BYTE_LENGTH = 28;
export const B3DM_MAGIC = 'b3dm';
export const B3DM_MAGIC_BYTES = [0x62, 0x33, 0x64, 0x6D]; // 'b3dm'
export const B3DM_SUPPORTED_VERSION = 1;

// Component Types (from glTF specification)
export const COMPONENT_TYPES = {
    BYTE: 5120,
    UNSIGNED_BYTE: 5121,
    SHORT: 5122,
    UNSIGNED_SHORT: 5123,
    INT: 5124,
    UNSIGNED_INT: 5125,
    FLOAT: 5126
};

// Data Types (from glTF specification)
export const DATA_TYPES = {
    SCALAR: 'SCALAR',
    VEC2: 'VEC2',
    VEC3: 'VEC3',
    VEC4: 'VEC4',
    MAT2: 'MAT2',
    MAT3: 'MAT3',
    MAT4: 'MAT4'
};

// Component type byte sizes
export const COMPONENT_TYPE_SIZES = {
    [COMPONENT_TYPES.BYTE]: 1,
    [COMPONENT_TYPES.UNSIGNED_BYTE]: 1,
    [COMPONENT_TYPES.SHORT]: 2,
    [COMPONENT_TYPES.UNSIGNED_SHORT]: 2,
    [COMPONENT_TYPES.INT]: 4,
    [COMPONENT_TYPES.UNSIGNED_INT]: 4,
    [COMPONENT_TYPES.FLOAT]: 4
};

// Data type component counts
export const DATA_TYPE_COMPONENTS = {
    [DATA_TYPES.SCALAR]: 1,
    [DATA_TYPES.VEC2]: 2,
    [DATA_TYPES.VEC3]: 3,
    [DATA_TYPES.VEC4]: 4,
    [DATA_TYPES.MAT2]: 4,
    [DATA_TYPES.MAT3]: 9,
    [DATA_TYPES.MAT4]: 16
};

// Error codes for B3DM processing
export const B3DM_ERROR_CODES = {
    INVALID_MAGIC: 'INVALID_MAGIC',
    UNSUPPORTED_VERSION: 'UNSUPPORTED_VERSION',
    INVALID_HEADER: 'INVALID_HEADER',
    FEATURE_TABLE_ERROR: 'FEATURE_TABLE_ERROR',
    BATCH_TABLE_ERROR: 'BATCH_TABLE_ERROR',
    GLTF_EXTRACTION_ERROR: 'GLTF_EXTRACTION_ERROR',
    PROCESSING_ERROR: 'PROCESSING_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    PARSING_ERROR: 'PARSING_ERROR',
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    INSUFFICIENT_DATA: 'INSUFFICIENT_DATA'
};

/**
 * Custom error class for B3DM-specific errors
 */
export class B3dmError extends Error {
    constructor(message, code, context = {}) {
        super(message);
        this.name = 'B3dmError';
        this.code = code;
        this.context = context;
    }

    /**
     * Creates a recovery plan for the error
     * @returns {Object} Recovery plan with suggestions
     */
    getRecoveryPlan() {
        switch (this.code) {
            case B3DM_ERROR_CODES.INVALID_MAGIC:
                return { 
                    canRecover: false, 
                    suggestion: 'File is not a valid B3DM format' 
                };
            case B3DM_ERROR_CODES.UNSUPPORTED_VERSION:
                return { 
                    canRecover: false, 
                    suggestion: 'B3DM version is not supported' 
                };
            case B3DM_ERROR_CODES.FEATURE_TABLE_ERROR:
                return { 
                    canRecover: true, 
                    suggestion: 'Continue loading without feature table data' 
                };
            case B3DM_ERROR_CODES.BATCH_TABLE_ERROR:
                return { 
                    canRecover: true, 
                    suggestion: 'Continue loading without batch table data' 
                };
            case B3DM_ERROR_CODES.FILE_TOO_LARGE:
                return { 
                    canRecover: false, 
                    suggestion: 'Increase maxFileSize configuration or use streaming' 
                };
            default:
                return { 
                    canRecover: false, 
                    suggestion: 'Unable to process B3DM file' 
                };
        }
    }
}

// Default configuration values
export const B3DM_DEFAULT_CONFIG = {
    // Parsing options
    validateHeader: true,
    strictMode: false,
    maxFileSize: 100 * 1024 * 1024, // 100MB
    
    // Processing options
    applyRtcCenter: true,
    processAnimations: true,
    optimizeMaterials: true,
    
    // Performance options
    useWorkers: false,
    chunkSize: 1024 * 1024, // 1MB chunks
    concurrentLimit: 4,
    
    // Babylon.js integration
    createAssetContainer: true,
    freezeMaterials: true,
    optimizeVertices: false,
    
    // Debugging
    enableProfiling: false,
    logLevel: 'warn'
};

// Feature table property names
export const FEATURE_TABLE_PROPERTIES = {
    BATCH_LENGTH: 'BATCH_LENGTH',
    RTC_CENTER: 'RTC_CENTER'
};

// Batch table semantic names
export const BATCH_TABLE_SEMANTICS = {
    BATCH_ID: '_BATCHID'
};