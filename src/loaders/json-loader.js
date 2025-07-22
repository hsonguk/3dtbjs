import { BaseLoader } from './base-loader.js';

/**
 * Loader for JSON tile files
 */
export class JsonLoader extends BaseLoader {
    /**
     * Checks if this loader supports the given file path
     * @param {string} path - The file path to check
     * @returns {boolean} True if this is a JSON file
     */
    supports(path) {
        return path.includes('.json');
    }

    /**
     * Loads a JSON tile from the given path
     * @param {LoadRequest} request - The load request
     * @returns {Promise} Promise that resolves with the loaded JSON
     */
    async load(request) {
        const fetchFunction = this.createFetchFunction(request.path, request.abortController.signal);
        
        try {
            const response = await fetchFunction();
            await this.handleFetchResponse(response, request.path);
            const json = await response.json();
            
            return json;
        } catch (error) {
            console.error('Error loading JSON tile:', error);
            throw error;
        }
    }
}