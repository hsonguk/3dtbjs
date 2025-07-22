import { B3dmError, B3DM_ERROR_CODES } from '../utils/B3dmConstants.js';

/**
 * Processor for material data in B3DM files
 */
export class MaterialProcessor {
    constructor(options = {}) {
        this.options = {
            optimizeMaterials: true,
            freezeMaterials: true,
            applyBatchColors: true,
            defaultColor: new BABYLON.Color3(0.8, 0.8, 0.8),
            ...options
        };
    }

    /**
     * Processes materials with B3DM-specific data
     * @param {BABYLON.AssetContainer} container - The asset container
     * @param {Object} context - Processing context with batch data
     * @returns {Promise<void>}
     */
    async process(container, context) {
        if (!container || !container.materials || container.materials.length === 0) {
            return;
        }

        try {
            // Process each material
            for (const material of container.materials) {
                // Apply batch colors if available
                if (this.options.applyBatchColors && context.batchData) {
                    this.applyBatchColors(material, context.batchData);
                }

                // Apply optimizations
                if (this.options.optimizeMaterials) {
                    this.optimizeMaterial(material);
                }

                // Freeze materials for performance
                if (this.options.freezeMaterials) {
                    material.freeze();
                }
            }

            // Store batch data on the container for later use
            if (context.batchData) {
                container.metadata = container.metadata || {};
                container.metadata.batchData = context.batchData;
            }

        } catch (error) {
            if (error instanceof B3dmError) {
                throw error;
            }

            throw new B3dmError(
                `Failed to process materials: ${error.message}`,
                B3DM_ERROR_CODES.PROCESSING_ERROR,
                { originalError: error }
            );
        }
    }

    /**
     * Applies batch colors to materials if available in batch table
     * @param {BABYLON.Material} material - The material to process
     * @param {Object} batchData - The batch data
     * @private
     */
    applyBatchColors(material, batchData) {
        // This is a placeholder for batch color application
        // In a real implementation, this would extract color properties from the batch table
        // and apply them to the material or prepare for shader-based coloring

        // For now, we'll just ensure the material has a base color
        if (material instanceof BABYLON.PBRMaterial) {
            if (!material.albedoColor) {
                material.albedoColor = this.options.defaultColor.clone();
            }
        } else if (material instanceof BABYLON.StandardMaterial) {
            if (!material.diffuseColor) {
                material.diffuseColor = this.options.defaultColor.clone();
            }
        }
    }

    /**
     * Optimizes a material for performance
     * @param {BABYLON.Material} material - The material to optimize
     * @private
     */
    optimizeMaterial(material) {
        // Optimize PBR materials
        if (material instanceof BABYLON.PBRMaterial) {
            // Disable features that aren't needed for most 3D Tiles
            material.disableLighting = false;
            material.environmentIntensity = 0.3;
            material.specularIntensity = 0.5;
            material.roughness = Math.max(0.4, material.roughness || 0.4);

            // Optimize texture usage
            if (material.albedoTexture) {
                material.albedoTexture.coordinatesIndex = 0;
                material.albedoTexture.optimizeUVAllocation = true;
            }
        }
        // Optimize Standard materials
        else if (material instanceof BABYLON.StandardMaterial) {
            material.specularPower = 64;
            material.useSpecularOverAlpha = false;

            // Optimize texture usage
            if (material.diffuseTexture) {
                material.diffuseTexture.coordinatesIndex = 0;
                material.diffuseTexture.optimizeUVAllocation = true;
            }
        }

        // Common optimizations for all materials
        material.needDepthPrePass = false;
        material.backFaceCulling = true;
        material.separateCullingPass = false;
    }
}