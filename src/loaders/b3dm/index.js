/**
 * B3DM Loader Module
 * 
 * This module provides comprehensive support for loading and processing
 * B3DM (Batched 3D Model) tiles in the OGC 3D Tiles specification.
 */

// Main loader class
export { B3dmLoader } from './B3dmLoader.js';

// Core parsing components
export { B3dmParser } from './parser/B3dmParser.js';

// Validation components
export { B3dmValidator } from './validation/B3dmValidator.js';

// Processing components
export { B3dmProcessor } from './processors/B3dmProcessor.js';

// Constants and utilities
export { 
    B3dmError, 
    B3DM_ERROR_CODES,
    B3DM_DEFAULT_CONFIG,
    COMPONENT_TYPES,
    DATA_TYPES
} from './utils/B3dmConstants.js';

// Re-export for convenience
export * from './utils/B3dmConstants.js';