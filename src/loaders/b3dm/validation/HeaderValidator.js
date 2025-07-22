import { 
    B3DM_MAGIC, 
    B3DM_SUPPORTED_VERSION, 
    B3DM_HEADER_BYTE_LENGTH,
    B3dmError,
    B3DM_ERROR_CODES 
} from '../utils/B3dmConstants.js';

/**
 * Validator for B3DM header structure and format compliance
 * Provides comprehensive validation with detailed error reporting
 */
export class HeaderValidator {
    constructor(options = {}) {
        this.options = {
            strictMode: false,
            allowLargeFiles: true,
            maxFileSize: 1024 * 1024 * 1024, // 1GB default max
            warnOnUnusualSizes: true,
            ...options
        };
    }

    /**
     * Validates B3DM header structure
     * @param {Object} header - The parsed header
     * @returns {Object} Validation result with warnings and errors
     */
    validate(header) {
        const result = {
            isValid: true,
            warnings: [],
            errors: []
        };

        try {
            // Basic structure validation
            this.validateStructure(header, result);
            
            // Magic number validation
            this.validateMagic(header, result);
            
            // Version validation
            this.validateVersion(header, result);
            
            // Size validation
            this.validateSizes(header, result);
            
            // Consistency validation
            this.validateConsistency(header, result);
            
            // Performance warnings
            this.checkPerformanceWarnings(header, result);

            // Set overall validity
            result.isValid = result.errors.length === 0;

        } catch (error) {
            result.errors.push(`Validation failed: ${error.message}`);
            result.isValid = false;
        }

        return result;
    }

    /**
     * Validates basic header structure
     * @param {Object} header - The header to validate
     * @param {Object} result - The validation result to update
     * @private
     */
    validateStructure(header, result) {
        const requiredFields = [
            'magic', 'version', 'byteLength',
            'featureTableJSONByteLength', 'featureTableBinaryByteLength',
            'batchTableJSONByteLength', 'batchTableBinaryByteLength'
        ];

        for (const field of requiredFields) {
            if (header[field] === undefined || header[field] === null) {
                result.errors.push(`Missing required header field: ${field}`);
            }
        }

        // Check field types
        if (typeof header.magic !== 'string') {
            result.errors.push('Header magic must be a string');
        }

        const numericFields = [
            'version', 'byteLength', 'featureTableJSONByteLength',
            'featureTableBinaryByteLength', 'batchTableJSONByteLength',
            'batchTableBinaryByteLength'
        ];

        for (const field of numericFields) {
            if (header[field] !== undefined && typeof header[field] !== 'number') {
                result.errors.push(`Header field ${field} must be a number`);
            }
        }
    }

    /**
     * Validates magic number
     * @param {Object} header - The header to validate
     * @param {Object} result - The validation result to update
     * @private
     */
    validateMagic(header, result) {
        if (header.magic !== B3DM_MAGIC) {
            result.errors.push(`Invalid magic number: expected "${B3DM_MAGIC}", got "${header.magic}"`);
        }
    }

    /**
     * Validates version number
     * @param {Object} header - The header to validate
     * @param {Object} result - The validation result to update
     * @private
     */
    validateVersion(header, result) {
        if (header.version !== B3DM_SUPPORTED_VERSION) {
            if (this.options.strictMode) {
                result.errors.push(`Unsupported version: ${header.version} (expected ${B3DM_SUPPORTED_VERSION})`);
            } else {
                result.warnings.push(`Version ${header.version} may not be fully supported (expected ${B3DM_SUPPORTED_VERSION})`);
            }
        }
    }

    /**
     * Validates size fields
     * @param {Object} header - The header to validate
     * @param {Object} result - The validation result to update
     * @private
     */
    validateSizes(header, result) {
        // Check for negative sizes
        const sizeFields = [
            'byteLength', 'featureTableJSONByteLength', 'featureTableBinaryByteLength',
            'batchTableJSONByteLength', 'batchTableBinaryByteLength'
        ];

        for (const field of sizeFields) {
            if (header[field] < 0) {
                result.errors.push(`${field} cannot be negative: ${header[field]}`);
            }
        }

        // Check minimum file size
        if (header.byteLength < B3DM_HEADER_BYTE_LENGTH) {
            result.errors.push(`byteLength too small: ${header.byteLength} (minimum: ${B3DM_HEADER_BYTE_LENGTH})`);
        }

        // Check maximum file size
        if (!this.options.allowLargeFiles && header.byteLength > this.options.maxFileSize) {
            result.errors.push(`File too large: ${header.byteLength} bytes (maximum: ${this.options.maxFileSize})`);
        }

        // Warn about unusual sizes
        if (this.options.warnOnUnusualSizes) {
            if (header.byteLength > 100 * 1024 * 1024) { // 100MB
                result.warnings.push(`Large file size: ${(header.byteLength / 1024 / 1024).toFixed(1)}MB`);
            }

            if (header.featureTableJSONByteLength > 1024 * 1024) { // 1MB
                result.warnings.push(`Large feature table JSON: ${(header.featureTableJSONByteLength / 1024).toFixed(1)}KB`);
            }

            if (header.batchTableJSONByteLength > 10 * 1024 * 1024) { // 10MB
                result.warnings.push(`Large batch table JSON: ${(header.batchTableJSONByteLength / 1024 / 1024).toFixed(1)}MB`);
            }
        }
    }

    /**
     * Validates consistency between size fields
     * @param {Object} header - The header to validate
     * @param {Object} result - The validation result to update
     * @private
     */
    validateConsistency(header, result) {
        // Calculate expected minimum size
        const tablesSize = header.featureTableJSONByteLength + 
                          header.featureTableBinaryByteLength +
                          header.batchTableJSONByteLength +
                          header.batchTableBinaryByteLength;

        const minimumSize = B3DM_HEADER_BYTE_LENGTH + tablesSize;

        if (header.byteLength < minimumSize) {
            result.errors.push(`byteLength inconsistent: ${header.byteLength} < ${minimumSize} (header + tables)`);
        }

        // Check for empty GLTF
        const gltfSize = header.byteLength - minimumSize;
        if (gltfSize <= 0) {
            result.errors.push('No space for GLTF data');
        } else if (gltfSize < 20) { // Minimum GLB header is 12 bytes, JSON GLTF needs at least a few bytes
            result.warnings.push(`Very small GLTF data: ${gltfSize} bytes`);
        }

        // Check for tables without data
        if (header.featureTableJSONByteLength === 0 && header.featureTableBinaryByteLength > 0) {
            result.warnings.push('Feature table has binary data but no JSON schema');
        }

        if (header.batchTableJSONByteLength === 0 && header.batchTableBinaryByteLength > 0) {
            result.warnings.push('Batch table has binary data but no JSON schema');
        }

        // Check for unusual table combinations
        if (header.featureTableJSONByteLength === 0 && header.batchTableJSONByteLength > 0) {
            result.warnings.push('Batch table present without feature table');
        }
    }

    /**
     * Checks for performance-related warnings
     * @param {Object} header - The header to validate
     * @param {Object} result - The validation result to update
     * @private
     */
    checkPerformanceWarnings(header, result) {
        // Warn about unbalanced table sizes
        const featureTableSize = header.featureTableJSONByteLength + header.featureTableBinaryByteLength;
        const batchTableSize = header.batchTableJSONByteLength + header.batchTableBinaryByteLength;
        const gltfSize = header.byteLength - B3DM_HEADER_BYTE_LENGTH - featureTableSize - batchTableSize;

        const totalSize = header.byteLength;
        const tableRatio = (featureTableSize + batchTableSize) / totalSize;
        const gltfRatio = gltfSize / totalSize;

        if (tableRatio > 0.5) {
            result.warnings.push(`Tables are ${(tableRatio * 100).toFixed(1)}% of file size - consider optimizing`);
        }

        if (gltfRatio < 0.1) {
            result.warnings.push(`GLTF data is only ${(gltfRatio * 100).toFixed(1)}% of file size`);
        }

        // Warn about JSON-heavy tables
        if (header.featureTableJSONByteLength > header.featureTableBinaryByteLength * 2) {
            result.warnings.push('Feature table JSON is much larger than binary data - consider optimization');
        }

        if (header.batchTableJSONByteLength > header.batchTableBinaryByteLength * 2) {
            result.warnings.push('Batch table JSON is much larger than binary data - consider optimization');
        }
    }

    /**
     * Creates a detailed validation report
     * @param {Object} header - The header that was validated
     * @param {Object} validationResult - The validation result
     * @returns {string} Formatted validation report
     */
    static createReport(header, validationResult) {
        const lines = [];
        
        lines.push('=== B3DM Header Validation Report ===');
        lines.push(`Status: ${validationResult.isValid ? 'VALID' : 'INVALID'}`);
        lines.push('');
        
        lines.push('Header Summary:');
        lines.push(`  Magic: ${header.magic}`);
        lines.push(`  Version: ${header.version}`);
        lines.push(`  Total Size: ${header.byteLength.toLocaleString()} bytes`);
        lines.push(`  Feature Table: ${(header.featureTableJSONByteLength + header.featureTableBinaryByteLength).toLocaleString()} bytes`);
        lines.push(`  Batch Table: ${(header.batchTableJSONByteLength + header.batchTableBinaryByteLength).toLocaleString()} bytes`);
        lines.push(`  GLTF Data: ${header.gltfByteLength ? header.gltfByteLength.toLocaleString() : 'Unknown'} bytes`);
        lines.push('');

        if (validationResult.errors.length > 0) {
            lines.push('Errors:');
            validationResult.errors.forEach(error => lines.push(`  ❌ ${error}`));
            lines.push('');
        }

        if (validationResult.warnings.length > 0) {
            lines.push('Warnings:');
            validationResult.warnings.forEach(warning => lines.push(`  ⚠️  ${warning}`));
            lines.push('');
        }

        if (validationResult.isValid && validationResult.warnings.length === 0) {
            lines.push('✅ Header is valid with no warnings');
        }

        return lines.join('\n');
    }
}