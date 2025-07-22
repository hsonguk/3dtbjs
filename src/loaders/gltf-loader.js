import { BaseLoader } from './base-loader.js';

/**
 * Loader for GLTF/GLB tile files using Babylon.js
 */
export class GltfLoader extends BaseLoader {
    /**
     * Checks if this loader supports the given file path
     * @param {string} path - The file path to check
     * @returns {boolean} True if this is a GLTF or GLB file
     */
    supports(path) {
        return path.includes('.gltf') || path.includes('.glb');
    }

    /**
     * Loads a GLTF/GLB tile from the given path
     * @param {LoadRequest} request - The load request
     * @returns {Promise} Promise that resolves with the loaded container
     */
    async load(request) {
        const fetchFunction = this.createFetchFunction(request.path, request.abortController.signal);
        
        try {
            const response = await fetchFunction();
            await this.handleFetchResponse(response, request.path);
            const arrayBuffer = await response.arrayBuffer();
            
            // Create blob URL for Babylon.js to load
            const assetBlob = new Blob([arrayBuffer]);
            const assetUrl = URL.createObjectURL(assetBlob);
            
            try {
                const container = await BABYLON.LoadAssetContainerAsync(
                    assetUrl, 
                    this.scene, 
                    { pluginExtension: '.glb' }
                );
                
                // Apply callbacks if provided
                if (this.meshCallback) {
                    container.meshes.forEach(mesh => {
                        if (mesh.geometry) {
                            this.meshCallback(mesh);
                        }
                    });
                }
                
                return container;
            } finally {
                // Clean up the blob URL
                URL.revokeObjectURL(assetUrl);
            }
        } catch (error) {
            console.error('Error loading GLTF/GLB tile:', error);
            throw error;
        }
    }
}