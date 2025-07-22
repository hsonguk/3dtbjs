import { BaseLoader } from './base-loader.js';

/**
 * Loader for B3DM tile files
 * Note: This is a placeholder implementation as B3DM decoding logic
 * was commented out in the original code
 */
export class B3dmLoader extends BaseLoader {
    constructor(options = {}) {
        super(options);
        // TODO: Initialize B3DM decoder when available
        // this.b3dmDecoder = new B3DMDecoder(options.renderer);
    }

    /**
     * Checks if this loader supports the given file path
     * @param {string} path - The file path to check
     * @returns {boolean} True if this is a B3DM file
     */
    supports(path) {
        return path.includes('.b3dm');
    }

    /**
     * Loads a B3DM tile from the given path
     * @param {LoadRequest} request - The load request
     * @returns {Promise} Promise that resolves with the loaded mesh
     */
    async load(request) {
        const fetchFunction = this.createFetchFunction(request.path, request.abortController.signal);
        
        try {
            const response = await fetchFunction();
            await this.handleFetchResponse(response, request.path);
            await response.arrayBuffer();
            
            // TODO: Implement B3DM decoding when decoder is available
            // For now, throw an error indicating B3DM is not yet supported
            throw new Error('B3DM loading is not yet implemented in the refactored version');
            
            // This would be the implementation when B3DM decoder is available:
            /*
            const mesh = await this.b3dmDecoder.parseB3DM(
                arrayBuffer,
                this.meshCallback,
                request.sceneZupToYup,
                request.meshZupToYup
            );
            
            return mesh;
            */
        } catch (error) {
            console.error('Error loading B3DM tile:', error);
            throw error;
        }
    }
}