import { BaseLoader } from '../base-loader.js';
import { B3dmParser } from './parser/B3dmParser.js';
import { B3dmValidator } from './validation/B3dmValidator.js';
import { B3dmProcessor } from './processors/B3dmProcessor.js';
import { B3dmError, B3DM_ERROR_CODES, B3DM_DEFAULT_CONFIG } from './utils/B3dmConstants.js';

/**
 * Main B3DM loader class that handles loading and processing of B3DM tiles
 * Extends BaseLoader to integrate with the existing loader architecture
 */
export class B3dmLoader extends BaseLoader {
    constructor(options = {}) {
        super(options);
        
        // Merge configuration with defaults
        this.config = {
            ...B3DM_DEFAULT_CONFIG,
            ...options
        };
        
        // Initialize core components with configuration
        this.parser = new B3dmParser(this.config);
        this.validator = new B3dmValidator(this.config);
        this.processor = new B3dmProcessor({
            ...this.config,
            scene: options.scene,
            meshCallback: this.meshCallback,
            pointsCallback: this.pointsCallback
        });
        
        // Performance tracking
        this.stats = {
            filesLoaded: 0,
            totalLoadTime: 0,
            averageLoadTime: 0,
            lastLoadTime: 0,
            errors: 0
        };
        
        // Progress tracking
        this.progressCallback = options.progressCallback;
    }

    /**
     * Checks if this loader supports the given file path
     * @param {string} path - The file path to check
     * @returns {boolean} True if this is a B3DM file
     */
    supports(path) {
        return path.toLowerCase().includes('.b3dm');
    }

    /**
     * Loads a B3DM tile from the given path
     * @param {LoadRequest} request - The load request containing path and options
     * @returns {Promise<BABYLON.AssetContainer>} Promise that resolves with the loaded asset container
     */
    async load(request) {
        const startTime = performance.now();
        const loadingContext = {
            path: request.path,
            startTime,
            phase: 'initializing'
        };

        try {
            this.reportProgress('Starting B3DM load', 0, loadingContext);

            // Phase 1: Fetch data
            loadingContext.phase = 'fetching';
            this.reportProgress('Fetching B3DM data', 10, loadingContext);
            const arrayBuffer = await this.fetchData(request);
            
            // Validate file size
            this.validateFileSize(arrayBuffer);
            
            // Phase 2: Parse structure
            loadingContext.phase = 'parsing';
            this.reportProgress('Parsing B3DM structure', 30, loadingContext);
            const b3dmData = await this.parser.parse(arrayBuffer);
            
            // Phase 3: Validate data
            if (this.config.validateHeader) {
                loadingContext.phase = 'validating';
                this.reportProgress('Validating B3DM data', 50, loadingContext);
                await this.validator.validate(b3dmData);
            }
            
            // Phase 4: Process into Babylon.js objects
            loadingContext.phase = 'processing';
            this.reportProgress('Processing 3D content', 70, loadingContext);
            const result = await this.processor.process(b3dmData, request);
            
            // Phase 5: Finalize
            loadingContext.phase = 'finalizing';
            this.reportProgress('Finalizing', 90, loadingContext);
            
            // Apply final transformations and callbacks
            await this.finalizeResult(result, request);
            
            // Update statistics
            this.updateStats(startTime, true);
            
            this.reportProgress('B3DM loading complete', 100, loadingContext);
            
            if (this.config.enableProfiling) {
                this.logPerformanceMetrics(loadingContext, result);
            }
            
            return result;
            
        } catch (error) {
            this.updateStats(startTime, false);
            this.handleLoadingError(error, loadingContext);
            throw error;
        }
    }

    /**
     * Validates the file size against configuration limits
     * @param {ArrayBuffer} arrayBuffer - The file data
     * @private
     */
    validateFileSize(arrayBuffer) {
        if (arrayBuffer.byteLength > this.config.maxFileSize) {
            throw new B3dmError(
                `B3DM file too large: ${arrayBuffer.byteLength} bytes (max: ${this.config.maxFileSize})`,
                B3DM_ERROR_CODES.FILE_TOO_LARGE,
                { fileSize: arrayBuffer.byteLength, maxSize: this.config.maxFileSize }
            );
        }

        if (arrayBuffer.byteLength === 0) {
            throw new B3dmError(
                'B3DM file is empty',
                B3DM_ERROR_CODES.INSUFFICIENT_DATA,
                { fileSize: 0 }
            );
        }
    }

    /**
     * Applies final transformations and callbacks to the result
     * @param {BABYLON.AssetContainer} result - The loaded asset container
     * @param {LoadRequest} request - The original request
     * @private
     */
    async finalizeResult(result, request) {
        if (!result) return;

        // Apply mesh callbacks if provided
        if (this.meshCallback && result.meshes) {
            result.meshes.forEach(mesh => {
                try {
                    this.meshCallback(mesh);
                } catch (error) {
                    console.warn('Error in mesh callback:', error);
                }
            });
        }

        // Apply points callbacks if provided
        if (this.pointsCallback && result.particleSystems) {
            result.particleSystems.forEach(system => {
                try {
                    this.pointsCallback(system);
                } catch (error) {
                    console.warn('Error in points callback:', error);
                }
            });
        }

        // Optimize materials if enabled
        if (this.config.freezeMaterials && result.materials) {
            result.materials.forEach(material => {
                try {
                    material.freeze();
                } catch (error) {
                    console.warn('Error freezing material:', error);
                }
            });
        }

        // Optimize meshes if enabled
        if (this.config.optimizeVertices && result.meshes) {
            result.meshes.forEach(mesh => {
                try {
                    if (mesh.geometry) {
                        mesh.freezeWorldMatrix();
                    }
                } catch (error) {
                    console.warn('Error optimizing mesh:', error);
                }
            });
        }
    }

    /**
     * Reports loading progress
     * @param {string} message - Progress message
     * @param {number} percentage - Progress percentage (0-100)
     * @param {Object} context - Loading context
     * @private
     */
    reportProgress(message, percentage, context) {
        if (this.progressCallback) {
            try {
                this.progressCallback({
                    message,
                    percentage,
                    phase: context.phase,
                    path: context.path,
                    elapsedTime: performance.now() - context.startTime
                });
            } catch (error) {
                console.warn('Error in progress callback:', error);
            }
        }

        if (this.config.logLevel === 'debug') {
            console.debug(`B3DM Load [${percentage}%]: ${message}`);
        }
    }

    /**
     * Updates loading statistics
     * @param {number} startTime - Start time of the load operation
     * @param {boolean} success - Whether the load was successful
     * @private
     */
    updateStats(startTime, success) {
        const loadTime = performance.now() - startTime;
        
        this.stats.filesLoaded++;
        this.stats.lastLoadTime = loadTime;
        
        if (success) {
            this.stats.totalLoadTime += loadTime;
            this.stats.averageLoadTime = this.stats.totalLoadTime / this.stats.filesLoaded;
        } else {
            this.stats.errors++;
        }
    }

    /**
     * Handles loading errors with detailed reporting
     * @param {Error} error - The error that occurred
     * @param {Object} context - Loading context
     * @private
     */
    handleLoadingError(error, context) {
        const errorInfo = {
            phase: context.phase,
            path: context.path,
            elapsedTime: performance.now() - context.startTime,
            error: error.message
        };

        if (error instanceof B3dmError) {
            console.error(`B3DM Error [${error.code}] in ${context.phase}:`, error.message);
            if (this.config.logLevel === 'debug') {
                console.error('Error context:', error.context);
                console.error('Loading context:', errorInfo);
            }
        } else {
            console.error(`Unexpected error in B3DM loading (${context.phase}):`, error);
            if (this.config.logLevel === 'debug') {
                console.error('Loading context:', errorInfo);
            }
        }

        // Report error progress
        this.reportProgress(`Error: ${error.message}`, -1, context);
    }

    /**
     * Logs performance metrics
     * @param {Object} context - Loading context
     * @param {BABYLON.AssetContainer} result - The loaded result
     * @private
     */
    logPerformanceMetrics(context, result) {
        const totalTime = performance.now() - context.startTime;
        const metrics = {
            totalTime: totalTime.toFixed(2) + 'ms',
            path: context.path,
            meshCount: result?.meshes?.length || 0,
            materialCount: result?.materials?.length || 0,
            textureCount: result?.textures?.length || 0,
            animationCount: result?.animationGroups?.length || 0,
            averageLoadTime: this.stats.averageLoadTime.toFixed(2) + 'ms',
            totalFilesLoaded: this.stats.filesLoaded,
            errorRate: ((this.stats.errors / this.stats.filesLoaded) * 100).toFixed(1) + '%'
        };

        console.log('B3DM Loading Performance:', metrics);
    }

    /**
     * Fetches the B3DM data from the request path
     * @param {LoadRequest} request - The load request
     * @returns {Promise<ArrayBuffer>} The B3DM data as ArrayBuffer
     * @private
     */
    async fetchData(request) {
        const fetchFunction = this.createFetchFunction(request.path, request.abortController.signal);
        
        const response = await fetchFunction();
        this.handleFetchResponse(response, request.path);
        
        return await response.arrayBuffer();
    }

    /**
     * Gets loading statistics
     * @returns {Object} Current loading statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Resets loading statistics
     */
    resetStats() {
        this.stats = {
            filesLoaded: 0,
            totalLoadTime: 0,
            averageLoadTime: 0,
            lastLoadTime: 0,
            errors: 0
        };
    }

    /**
     * Updates the loader configuration
     * @param {Object} newConfig - New configuration options
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        // Update component configurations
        this.parser.options = { ...this.parser.options, ...newConfig };
        this.validator.options = { ...this.validator.options, ...newConfig };
        this.processor.options = { ...this.processor.options, ...newConfig };
    }

    /**
     * Gets the current configuration
     * @returns {Object} Current configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Validates a B3DM file without fully loading it
     * @param {string} path - Path to the B3DM file
     * @returns {Promise<Object>} Validation result
     */
    async validateFile(path) {
        try {
            const fetchFunction = this.createFetchFunction(path);
            const response = await fetchFunction();
            const arrayBuffer = await response.arrayBuffer();
            
            const b3dmData = await this.parser.parse(arrayBuffer);
            const validationResult = await this.validator.validate(b3dmData);
            
            return {
                isValid: validationResult.isValid,
                warnings: validationResult.warnings,
                errors: validationResult.errors,
                fileSize: arrayBuffer.byteLength,
                header: b3dmData.header
            };
        } catch (error) {
            return {
                isValid: false,
                errors: [error.message],
                warnings: [],
                fileSize: 0,
                header: null
            };
        }
    }

    /**
     * Gets information about a B3DM file without loading the 3D content
     * @param {string} path - Path to the B3DM file
     * @returns {Promise<Object>} File information
     */
    async getFileInfo(path) {
        try {
            const fetchFunction = this.createFetchFunction(path);
            const response = await fetchFunction();
            const arrayBuffer = await response.arrayBuffer();
            
            const b3dmData = await this.parser.parse(arrayBuffer);
            
            return {
                fileSize: arrayBuffer.byteLength,
                header: b3dmData.header,
                featureTable: b3dmData.featureTable ? {
                    batchLength: b3dmData.featureTable.getBatchLength(),
                    rtcCenter: b3dmData.featureTable.getRtcCenter(),
                    propertyCount: b3dmData.featureTable.getPropertyNames().length
                } : null,
                batchTable: b3dmData.batchTable ? {
                    batchLength: b3dmData.batchTable.getBatchLength(),
                    propertyCount: b3dmData.batchTable.getPropertyNames().length
                } : null,
                gltfInfo: b3dmData.gltfData ? this.parser.gltfExtractor.getGltfInfo(b3dmData.gltfData) : null
            };
        } catch (error) {
            throw new B3dmError(
                `Failed to get file info: ${error.message}`,
                B3DM_ERROR_CODES.PROCESSING_ERROR,
                { path, originalError: error }
            );
        }
    }
}