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

        // Preprocess GLTF data to handle CESIUM_RTC extension
        const processedGltfData = await this.preprocessGltfData(gltfData);

        // Create blob URL for Babylon.js to load
        const assetBlob = new Blob([processedGltfData], { type: 'model/gltf-binary' });
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
     * Preprocesses GLTF data to handle unsupported extensions like CESIUM_RTC
     * @param {ArrayBuffer} gltfData - The original GLTF data
     * @returns {Promise<ArrayBuffer>} The processed GLTF data
     * @private
     */
    async preprocessGltfData(gltfData) {
        try {
            // Check if this is a GLB file
            const dataView = new DataView(gltfData);
            const magic = dataView.getUint32(0, true);
            
            if (magic === 0x46546C67) { // "glTF" magic number for GLB
                return this.preprocessGlbData(gltfData);
            } else {
                // Assume JSON GLTF
                return this.preprocessJsonGltfData(gltfData);
            }
        } catch (error) {
            console.warn('Failed to preprocess GLTF data, using original:', error.message);
            return gltfData;
        }
    }

    /**
     * Preprocesses GLB data to remove CESIUM_RTC extension
     * @param {ArrayBuffer} glbData - The GLB data
     * @returns {ArrayBuffer} The processed GLB data
     * @private
     */
    preprocessGlbData(glbData) {
        const dataView = new DataView(glbData);
        
        // Read GLB header
        const magic = dataView.getUint32(0, true);
        const version = dataView.getUint32(4, true);
        const length = dataView.getUint32(8, true);
        
        if (magic !== 0x46546C67 || version !== 2) {
            return glbData; // Not a valid GLB v2, return as-is
        }
        
        // Read first chunk (JSON)
        const jsonChunkLength = dataView.getUint32(12, true);
        const jsonChunkType = dataView.getUint32(16, true);
        
        if (jsonChunkType !== 0x4E4F534A) { // "JSON"
            return glbData; // Invalid GLB structure
        }
        
        // Extract JSON data
        const jsonData = new Uint8Array(glbData, 20, jsonChunkLength);
        const jsonString = new TextDecoder().decode(jsonData);
        
        try {
            const gltf = JSON.parse(jsonString);
            
            // Remove CESIUM_RTC extension
            if (gltf.extensionsUsed) {
                gltf.extensionsUsed = gltf.extensionsUsed.filter(ext => ext !== 'CESIUM_RTC');
                if (gltf.extensionsUsed.length === 0) {
                    delete gltf.extensionsUsed;
                }
            }
            
            if (gltf.extensionsRequired) {
                gltf.extensionsRequired = gltf.extensionsRequired.filter(ext => ext !== 'CESIUM_RTC');
                if (gltf.extensionsRequired.length === 0) {
                    delete gltf.extensionsRequired;
                }
            }
            
            // Remove CESIUM_RTC extension from nodes
            if (gltf.nodes) {
                gltf.nodes.forEach(node => {
                    if (node.extensions && node.extensions.CESIUM_RTC) {
                        delete node.extensions.CESIUM_RTC;
                        if (Object.keys(node.extensions).length === 0) {
                            delete node.extensions;
                        }
                    }
                });
            }
            
            // Create new JSON string
            const newJsonString = JSON.stringify(gltf);
            const newJsonData = new TextEncoder().encode(newJsonString);
            
            // Pad to 4-byte boundary
            const padding = (4 - (newJsonData.length % 4)) % 4;
            const paddedJsonData = new Uint8Array(newJsonData.length + padding);
            paddedJsonData.set(newJsonData);
            for (let i = newJsonData.length; i < paddedJsonData.length; i++) {
                paddedJsonData[i] = 0x20; // Space character for JSON padding
            }
            
            // Calculate new GLB size
            const binaryChunkStart = 20 + jsonChunkLength;
            const binaryChunkSize = glbData.byteLength - binaryChunkStart;
            const newGlbSize = 20 + paddedJsonData.length + binaryChunkSize;
            
            // Create new GLB
            const newGlbData = new ArrayBuffer(newGlbSize);
            const newDataView = new DataView(newGlbData);
            
            // Write GLB header
            newDataView.setUint32(0, magic, true);
            newDataView.setUint32(4, version, true);
            newDataView.setUint32(8, newGlbSize, true);
            
            // Write JSON chunk header
            newDataView.setUint32(12, paddedJsonData.length, true);
            newDataView.setUint32(16, jsonChunkType, true);
            
            // Write JSON data
            new Uint8Array(newGlbData, 20, paddedJsonData.length).set(paddedJsonData);
            
            // Copy binary chunk if it exists
            if (binaryChunkSize > 0) {
                new Uint8Array(newGlbData, 20 + paddedJsonData.length).set(
                    new Uint8Array(glbData, binaryChunkStart)
                );
            }
            
            return newGlbData;
            
        } catch (error) {
            console.warn('Failed to process GLB JSON, using original:', error.message);
            return glbData;
        }
    }

    /**
     * Preprocesses JSON GLTF data to remove CESIUM_RTC extension
     * @param {ArrayBuffer} jsonGltfData - The JSON GLTF data
     * @returns {ArrayBuffer} The processed JSON GLTF data
     * @private
     */
    preprocessJsonGltfData(jsonGltfData) {
        try {
            const jsonString = new TextDecoder().decode(jsonGltfData);
            const gltf = JSON.parse(jsonString);
            
            // Remove CESIUM_RTC extension (same logic as GLB)
            if (gltf.extensionsUsed) {
                gltf.extensionsUsed = gltf.extensionsUsed.filter(ext => ext !== 'CESIUM_RTC');
                if (gltf.extensionsUsed.length === 0) {
                    delete gltf.extensionsUsed;
                }
            }
            
            if (gltf.extensionsRequired) {
                gltf.extensionsRequired = gltf.extensionsRequired.filter(ext => ext !== 'CESIUM_RTC');
                if (gltf.extensionsRequired.length === 0) {
                    delete gltf.extensionsRequired;
                }
            }
            
            // Remove CESIUM_RTC extension from nodes
            if (gltf.nodes) {
                gltf.nodes.forEach(node => {
                    if (node.extensions && node.extensions.CESIUM_RTC) {
                        delete node.extensions.CESIUM_RTC;
                        if (Object.keys(node.extensions).length === 0) {
                            delete node.extensions;
                        }
                    }
                });
            }
            
            const newJsonString = JSON.stringify(gltf);
            return new TextEncoder().encode(newJsonString);
            
        } catch (error) {
            console.warn('Failed to process JSON GLTF, using original:', error.message);
            return jsonGltfData;
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

        console.log('Applying RTC transformation with center:', rtcCenter);
        const translation = new BABYLON.Vector3(rtcCenter[0], rtcCenter[1], rtcCenter[2]);
        console.log('Translation vector:', translation);
        
        container.meshes.forEach(mesh => {
            const originalPosition = mesh.position.clone();
            mesh.position.addInPlace(translation);
            console.log(`Mesh ${mesh.name} position: ${originalPosition} -> ${mesh.position}`);
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