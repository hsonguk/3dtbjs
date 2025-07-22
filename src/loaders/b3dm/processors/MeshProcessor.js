import { B3dmError, B3DM_ERROR_CODES } from '../utils/B3dmConstants.js';

/**
 * Processor for mesh data in B3DM files
 * Handles mesh processing, batch ID assignment, and B3DM-specific mesh operations
 */
export class MeshProcessor {
    constructor(options = {}) {
        this.options = {
            assignBatchIds: true,
            optimizeMeshes: true,
            enableInstancing: false,
            createBoundingInfo: true,
            ...options
        };
    }

    /**
     * Processes meshes with B3DM-specific data
     * @param {BABYLON.AssetContainer} container - The asset container
     * @param {Object} context - Processing context with feature and batch data
     * @returns {Promise<void>}
     */
    async process(container, context) {
        if (!container || !container.meshes) {
            return;
        }

        try {
            const { featureData, batchData, request } = context;

            // Process each mesh in the container
            for (const mesh of container.meshes) {
                await this.processMesh(mesh, {
                    featureData,
                    batchData,
                    request,
                    container
                });
            }

            // Apply global mesh optimizations
            if (this.options.optimizeMeshes) {
                this.optimizeMeshes(container);
            }

            // Create bounding information
            if (this.options.createBoundingInfo) {
                this.createBoundingInfo(container);
            }

        } catch (error) {
            if (error instanceof B3dmError) {
                throw error;
            }
            
            throw new B3dmError(
                `Failed to process meshes: ${error.message}`,
                B3DM_ERROR_CODES.PROCESSING_ERROR,
                { originalError: error }
            );
        }
    }

    /**
     * Processes a single mesh with B3DM-specific data
     * @param {BABYLON.AbstractMesh} mesh - The mesh to process
     * @param {Object} context - Processing context
     * @private
     */
    async processMesh(mesh, context) {
        const { featureData, batchData, request } = context;

        try {
            // Assign batch IDs if enabled and batch data is available
            if (this.options.assignBatchIds && batchData) {
                this.assignBatchIds(mesh, batchData);
            }

            // Apply coordinate transformations
            this.applyCoordinateTransformations(mesh, featureData, request);

            // Set up mesh metadata
            this.setupMeshMetadata(mesh, { featureData, batchData });

            // Optimize individual mesh if needed
            if (this.options.optimizeMeshes) {
                this.optimizeMesh(mesh);
            }

        } catch (error) {
            console.warn(`Failed to process mesh '${mesh.name}':`, error.message);
            // Continue processing other meshes
        }
    }

    /**
     * Assigns batch IDs to mesh vertices
     * @param {BABYLON.AbstractMesh} mesh - The mesh
     * @param {Object} batchData - Batch table data
     * @private
     */
    assignBatchIds(mesh, batchData) {
        if (!mesh.geometry || !batchData.batchLength) {
            return;
        }

        try {
            const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
            if (!positions) {
                return;
            }

            const vertexCount = positions.length / 3;
            const batchIds = new Float32Array(vertexCount);

            // Simple batch ID assignment - in a real implementation, this would be more sophisticated
            // For now, we'll assign batch IDs based on vertex groups or use a default approach
            const batchLength = batchData.batchLength;
            
            if (batchLength > 0) {
                // Assign batch IDs cyclically or based on some logic
                for (let i = 0; i < vertexCount; i++) {
                    batchIds[i] = i % batchLength;
                }

                // Set the batch ID vertex buffer using a custom attribute
                // Since 'batchId' is not a standard vertex buffer kind, we'll use a custom attribute
                try {
                    mesh.setVerticesData('color2', batchIds, false); // Use color2 as batch ID storage
                    // Store the fact that color2 contains batch IDs
                    mesh.metadata = mesh.metadata || {};
                    mesh.metadata.batchIdAttribute = 'color2';
                } catch (error) {
                    // If that fails, store batch IDs in metadata instead
                    console.warn('Could not set batch ID vertex data, storing in metadata instead');
                    mesh.metadata = mesh.metadata || {};
                    mesh.metadata.batchIds = Array.from(batchIds);
                }
            }

        } catch (error) {
            console.warn(`Failed to assign batch IDs to mesh '${mesh.name}':`, error.message);
        }
    }

    /**
     * Applies coordinate transformations to the mesh
     * @param {BABYLON.AbstractMesh} mesh - The mesh
     * @param {Object} featureData - Feature table data
     * @param {Object} request - Load request
     * @private
     */
    applyCoordinateTransformations(mesh, featureData, request) {
        // Apply RTC center transformation if available
        if (featureData && featureData.rtcCenter && featureData.rtcCenter.coordinates) {
            const rtcCenter = featureData.rtcCenter.coordinates;
            mesh.position.addInPlace(new BABYLON.Vector3(rtcCenter[0], rtcCenter[1], rtcCenter[2]));
        }

        // Apply scene coordinate system transformations
        if (request && request.sceneZupToYup) {
            // Apply Z-up to Y-up transformation
            mesh.rotationQuaternion = mesh.rotationQuaternion || BABYLON.Quaternion.Identity();
            const zUpToYUpQuaternion = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, -Math.PI / 2);
            mesh.rotationQuaternion = mesh.rotationQuaternion.multiply(zUpToYUpQuaternion);
        }

        if (request && request.meshZupToYup) {
            // Apply mesh-specific Z-up to Y-up transformation
            mesh.rotationQuaternion = mesh.rotationQuaternion || BABYLON.Quaternion.Identity();
            const meshZUpToYUpQuaternion = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, -Math.PI / 2);
            mesh.rotationQuaternion = mesh.rotationQuaternion.multiply(meshZUpToYUpQuaternion);
        }
    }

    /**
     * Sets up mesh metadata with B3DM information
     * @param {BABYLON.AbstractMesh} mesh - The mesh
     * @param {Object} context - Processing context
     * @private
     */
    setupMeshMetadata(mesh, context) {
        const { featureData, batchData } = context;

        // Initialize metadata if it doesn't exist
        if (!mesh.metadata) {
            mesh.metadata = {};
        }

        // Add B3DM-specific metadata
        mesh.metadata.b3dm = {
            hasBatchData: !!batchData,
            hasFeatureData: !!featureData,
            batchLength: batchData ? batchData.batchLength : 0,
            rtcCenter: featureData ? featureData.rtcCenter : null
        };

        // Add batch table properties if available
        if (batchData && batchData.properties) {
            mesh.metadata.b3dm.batchProperties = Object.keys(batchData.properties);
        }

        // Add feature table properties if available
        if (featureData && featureData.properties) {
            mesh.metadata.b3dm.featureProperties = Object.keys(featureData.properties);
        }
    }

    /**
     * Optimizes a single mesh
     * @param {BABYLON.AbstractMesh} mesh - The mesh to optimize
     * @private
     */
    optimizeMesh(mesh) {
        try {
            // Freeze world matrix if the mesh is static
            if (mesh.animations.length === 0) {
                mesh.freezeWorldMatrix();
            }

            // Optimize geometry if available
            if (mesh.geometry) {
                // Enable hardware scaling if appropriate
                mesh.alwaysSelectAsActiveMesh = false;
                
                // Set culling strategy
                mesh.cullingStrategy = BABYLON.AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
            }

        } catch (error) {
            console.warn(`Failed to optimize mesh '${mesh.name}':`, error.message);
        }
    }

    /**
     * Applies global mesh optimizations to the container
     * @param {BABYLON.AssetContainer} container - The asset container
     * @private
     */
    optimizeMeshes(container) {
        try {
            // Merge compatible meshes if beneficial
            if (this.options.enableInstancing) {
                this.createInstances(container);
            }

            // Optimize materials
            this.optimizeMaterials(container);

        } catch (error) {
            console.warn('Failed to apply global mesh optimizations:', error.message);
        }
    }

    /**
     * Creates instances for similar meshes
     * @param {BABYLON.AssetContainer} container - The asset container
     * @private
     */
    createInstances(container) {
        // Group meshes by geometry and material
        const meshGroups = new Map();

        for (const mesh of container.meshes) {
            if (!mesh.geometry || !mesh.material) continue;

            const key = `${mesh.geometry.id}_${mesh.material.id}`;
            if (!meshGroups.has(key)) {
                meshGroups.set(key, []);
            }
            meshGroups.get(key).push(mesh);
        }

        // Create instances for groups with multiple meshes
        for (const [key, meshes] of meshGroups) {
            if (meshes.length > 1) {
                const masterMesh = meshes[0];
                
                for (let i = 1; i < meshes.length; i++) {
                    const instanceMesh = meshes[i];
                    
                    // Create instance
                    const instance = masterMesh.createInstance(`${masterMesh.name}_instance_${i}`);
                    instance.position = instanceMesh.position.clone();
                    instance.rotation = instanceMesh.rotation.clone();
                    instance.scaling = instanceMesh.scaling.clone();
                    
                    // Copy metadata
                    instance.metadata = instanceMesh.metadata;
                    
                    // Remove original mesh
                    instanceMesh.dispose();
                }
            }
        }
    }

    /**
     * Optimizes materials in the container
     * @param {BABYLON.AssetContainer} container - The asset container
     * @private
     */
    optimizeMaterials(container) {
        const processedMaterials = new Set();

        for (const material of container.materials) {
            if (processedMaterials.has(material.id)) continue;
            
            try {
                // Freeze material to prevent unnecessary updates
                material.freeze();
                
                // Optimize textures
                if (material.diffuseTexture) {
                    material.diffuseTexture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
                    material.diffuseTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
                }

                processedMaterials.add(material.id);

            } catch (error) {
                console.warn(`Failed to optimize material '${material.name}':`, error.message);
            }
        }
    }

    /**
     * Creates bounding information for the container
     * @param {BABYLON.AssetContainer} container - The asset container
     * @private
     */
    createBoundingInfo(container) {
        try {
            // Calculate overall bounding box
            let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
            let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);

            for (const mesh of container.meshes) {
                if (mesh.getBoundingInfo) {
                    const boundingInfo = mesh.getBoundingInfo();
                    const meshMin = boundingInfo.minimum;
                    const meshMax = boundingInfo.maximum;

                    min = BABYLON.Vector3.Minimize(min, meshMin);
                    max = BABYLON.Vector3.Maximize(max, meshMax);
                }
            }

            // Store bounding information in container metadata
            if (!container.metadata) {
                container.metadata = {};
            }

            container.metadata.boundingInfo = {
                minimum: min,
                maximum: max,
                center: BABYLON.Vector3.Center(min, max),
                size: max.subtract(min)
            };

        } catch (error) {
            console.warn('Failed to create bounding information:', error.message);
        }
    }

    /**
     * Gets processing statistics
     * @returns {Object} Processing statistics
     */
    getStats() {
        return {
            processedMeshes: this.processedMeshes || 0,
            optimizedMeshes: this.optimizedMeshes || 0,
            instancesCreated: this.instancesCreated || 0,
            materialsOptimized: this.materialsOptimized || 0
        };
    }
}