import { HeaderValidator } from './HeaderValidator.js';
import { TableValidator } from './TableValidator.js';
import { B3dmError, B3DM_ERROR_CODES } from '../utils/B3dmConstants.js';

/**
 * Main validator for B3DM format compliance and data integrity
 */
export class B3dmValidator {
    constructor(options = {}) {
        this.headerValidator = new HeaderValidator(options);
        this.tableValidator = new TableValidator(options);
        
        this.options = {
            strictMode: false,
            validateTables: true,
            validateGltf: true,
            ...options
        };
    }

    /**
     * Validates a complete parsed B3DM data structure
     * @param {Object} b3dmData - The parsed B3DM data
     * @returns {Promise<Object>} Validation result with any warnings
     */
    async validate(b3dmData) {
        const validationResult = {
            isValid: true,
            warnings: [],
            errors: []
        };

        try {
            // Validate header
            const headerResult = this.headerValidator.validate(b3dmData.header);
            this.mergeValidationResult(validationResult, headerResult);

            // Validate feature table if present
            if (b3dmData.featureTable && this.options.validateTables) {
                const featureTableResult = this.tableValidator.validateFeatureTable(
                    b3dmData.featureTable, 
                    b3dmData.header
                );
                this.mergeValidationResult(validationResult, featureTableResult);
            }

            // Validate batch table if present
            if (b3dmData.batchTable && this.options.validateTables) {
                const batchTableResult = this.tableValidator.validateBatchTable(
                    b3dmData.batchTable, 
                    b3dmData.header,
                    b3dmData.featureTable
                );
                this.mergeValidationResult(validationResult, batchTableResult);
            }

            // Validate GLTF data if enabled
            if (b3dmData.gltfData && this.options.validateGltf) {
                const gltfResult = this.validateGltfData(b3dmData.gltfData);
                this.mergeValidationResult(validationResult, gltfResult);
            }

            // In strict mode, treat warnings as errors
            if (this.options.strictMode && validationResult.warnings.length > 0) {
                validationResult.errors.push(...validationResult.warnings);
                validationResult.warnings = [];
                validationResult.isValid = false;
            }

            // Throw error if validation failed
            if (!validationResult.isValid) {
                throw new B3dmError(
                    `B3DM validation failed: ${validationResult.errors.join(', ')}`,
                    B3DM_ERROR_CODES.VALIDATION_ERROR,
                    { validationResult }
                );
            }

            return validationResult;

        } catch (error) {
            if (error instanceof B3dmError) {
                throw error;
            }
            
            throw new B3dmError(
                `Validation error: ${error.message}`,
                B3DM_ERROR_CODES.VALIDATION_ERROR,
                { originalError: error }
            );
        }
    }

    /**
     * Validates GLTF data structure
     * @param {ArrayBuffer} gltfData - The GLTF data
     * @returns {Object} Validation result
     * @private
     */
    validateGltfData(gltfData) {
        const result = {
            isValid: true,
            warnings: [],
            errors: []
        };

        if (!gltfData || gltfData.byteLength === 0) {
            result.errors.push('GLTF data is empty or missing');
            result.isValid = false;
            return result;
        }

        // Basic GLB format validation
        if (gltfData.byteLength >= 12) {
            const dataView = new DataView(gltfData);
            const magic = dataView.getUint32(0, true);
            
            // Check for GLB magic number (0x46546C67 = "glTF")
            if (magic === 0x46546C67) {
                const version = dataView.getUint32(4, true);
                if (version !== 2) {
                    result.warnings.push(`GLB version ${version} may not be fully supported`);
                }
            } else {
                // Might be JSON GLTF, check for opening brace
                const firstByte = dataView.getUint8(0);
                if (firstByte !== 0x7B) { // '{'
                    result.warnings.push('GLTF data format could not be determined');
                }
            }
        }

        return result;
    }

    /**
     * Merges validation results
     * @param {Object} target - Target validation result
     * @param {Object} source - Source validation result to merge
     * @private
     */
    mergeValidationResult(target, source) {
        target.warnings.push(...source.warnings);
        target.errors.push(...source.errors);
        target.isValid = target.isValid && source.isValid;
    }
}