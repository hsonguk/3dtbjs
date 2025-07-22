import { FeatureProcessor } from './FeatureProcessor.js';
import { BatchProcessor } from './BatchProcessor.js';
import { MeshProcessor } from './MeshProcessor.js';
import { MaterialProcessor } from './MaterialProcessor.js';
import { AnimationProcessor } from './AnimationProcessor.js';
import { B3dmError, B3DM_ERROR_CODES } from '../utils/B3dmConstants.js';

/**
 * Main processor that coordinates the processing of B3DM data into Babylon.js objects
 */
export class B3dmProcessor {
    constructor(options = {}) {
        this.featureProcessor = new FeatureProcessor(options);
        this.batchProcessor = new BatchProcessor(options);
        this.meshProcessor = new MeshProcessor(options);
        this.materialProcessor = new MaterialProcessor(options);
        this.animationProcessor = new AnimationProcessor(options);
        
        this.options = {
            scene: null,
            applyRtcCenter: true,
            processAnimations: true,
            optimizeMaterials: true,
            createAssetContainer: true,
            ...options
        };
    }

    /**
     * Processes parsed B3DM data into Babylon.js objects
     * @param {Object} b3dmData - The parsed B3DM data
     * @param {LoadRequest} request - The original load request
     * @returns {Promise<BABYLON.AssetContainer>} The processed asset container
     */
    async process(b3dmData, request) {
        try {
            // Process feature table data
            const featureData = b3dmData.featureTable ? 
                await this.featureProcessor.process(b3dmData.featureTable) : null;
            
            // Process batch table data
            const batchData = b3dmData.batchTable ? 
                await this.batchProcessor.process(b3dmData.batchTable) : null;
            
            // Load GLTF content using Babylon.js
            const gltfContainer = await this.loadGltfContent(b3dmData.gltfData, request);
            
            // Process meshes with B3DM-specific data
            await this.meshProcessor.process(gltfContainer, {
                featureData,
                batchData,
                request
            });
            
            // Process materials
            if (this.options.optimizeMaterials) {
                await this.materialProcessor.process(gltfContainer, {
                    batchData,
                    request
                });
            }
            
            // Process animations
            if (this.options.processAnimations && gltfContainer.animationGroups.length > 0) {
                await this.animationProcessor.process(gltfContainer, {
                    featureData,
                    batchData
                });
            }
            
            // Apply coordinate transformations
            if (featureData && featureData.rtcCenter && this.options.applyRtcCenter) {
                this.applyRtcTransformation(gltfContainer, featureData.rtcCenter);
            }
            
            // Apply scene transformations
            if (request.sceneZupToYup) {
                this.applyZUpToYUpTransform(gltfContainer);
            }
            
            // Apply callbacks
            this.applyCallbacks(gltfContainer);
            
            return gltfContainer;
            
        } catch (error) {
            if (error instanceof B3dmError) {
                throw error;
            }
            
            throw new B3dmError(
                `Failed to process B3DM data: ${error.message}`,
                B3DM_ERROR_CODES.PROCESSING_ERROR,
                { originalError: error }
            );
        }
    }

    /**
     * Loads GLTF content using Babylon.js SceneLoader
     * @param {ArrayBuffer} gltfData - The GLTF data
     * @param {LoadRequest} request - The load request
     * @returns {Promise<BABYLON.AssetContainer>} The loaded asset container
     * @private
     */
    async loadGltfContent(gltfData, request) {
        if (!gltfData || gltfData.byteLength === 0) {
            throw new B3dmError(
                'No GLTF data found in B3DM',
                B3DM_ERROR_CODES.GLTF_EXTRACTION_ERROR
            );
        }

        // Create blob URL for Babylon.js to load
        const assetBlob = new Blob([gltfData], { type: 'model/gltf-binary' });
        const assetUrl = URL.createObjectURL(assetBlob);

        try {
            // Load the GLTF content using Babylon.js
            const container = await BABYLON.SceneLoader.LoadAssetContainerAsync(
                assetUrl,
                "",
                this.options.scene,
                null,
                ".glb"
            );

            return container;

        } finally {
            // Clean up the blob URL
            URL.revokeObjectURL(assetUrl);
        }
    }

    /**
     * Applies RTC (Relative to Center) transformation
     * @param {BABYLON.AssetContainer} container - The asset container
     * @param {Array<number>} rtcCenter - The RTC center coordinates [x, y, z]
     * @private
     */
    applyRtcTransformation(container, rtcCenter) {
        if (!rtcCenter || rtcCenter.length !== 3) return;

        const translation = new BABYLON.Vector3(rtcCenter[0], rtcCenter[1], rtcCenter[2]);
        
        container.meshes.forEach(mesh => {
            mesh.position.addInPlace(translation);
        });
    }

    /**
     * Applies Z-up to Y-up coordinate transformation
     * @param {BABYLON.AssetContainer} container - The asset container
     * @private
     */
    applyZUpToYUpTransform(container) {
        const zUpToYUpMatrix = BABYLON.Matrix.RotationX(-Math.PI / 2);
        
        container.meshes.forEach(mesh => {
            if (mesh.rotationQuaternion) {
                const rotationMatrix = BABYLON.Matrix.Identity();
                mesh.rotationQuaternion.toRotationMatrix(rotationMatrix);
                rotationMatrix.multiplyToRef(zUpToYUpMatrix, rotationMatrix);
                BABYLON.Quaternion.FromRotationMatrixToRef(rotationMatrix, mesh.rotationQuaternion);
            } else {
                mesh.rotate(BABYLON.Axis.X, -Math.PI / 2);
            }
        });
    }

    /**
     * Applies registered callbacks to the loaded content
     * @param {BABYLON.AssetContainer} container - The asset container
     * @private
     */
    applyCallbacks(container) {
        if (this.meshCallback) {
            container.meshes.forEach(mesh => {
                this.meshCallback(mesh);
            });
        }

        if (this.pointsCallback && container.particleSystems) {
            container.particleSystems.forEach(system => {
                this.pointsCallback(system);
            });
        }
    }
}