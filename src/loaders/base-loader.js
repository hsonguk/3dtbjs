/**
 * Abstract base class for all tile loaders
 */
export class BaseLoader {
    constructor(options = {}) {
        this.proxy = options.proxy;
        this.scene = options.scene;
        this.meshCallback = options.meshCallback;
        this.pointsCallback = options.pointsCallback;
    }

    /**
     * Checks if this loader supports the given file path
     * @param {string} path - The file path to check
     * @returns {boolean} True if this loader supports the file type
     */
    supports(path) { // eslint-disable-line no-unused-vars
        throw new Error('BaseLoader.supports() must be implemented by subclasses');
    }

    /**
     * Loads a tile from the given path
     * @param {LoadRequest} request - The load request
     * @returns {Promise} Promise that resolves with the loaded content
     */
    async load(request) { // eslint-disable-line no-unused-vars
        throw new Error('BaseLoader.load() must be implemented by subclasses');
    }

    /**
     * Creates a fetch function that handles both direct and proxy requests
     * @param {string} url - The URL to fetch
     * @param {AbortSignal} signal - The abort signal
     * @returns {Function} The fetch function
     */
    createFetchFunction(url, signal) {
        if (!this.proxy) {
            return () => fetch(url, { signal });
        } else {
            return () => fetch(this.proxy, {
                method: 'POST',
                body: url,
                signal
            });
        }
    }

    /**
     * Handles fetch response and validates it
     * @param {Response} response - The fetch response
     * @param {string} path - The original path for error reporting
     * @returns {Response} The validated response
     */
    async handleFetchResponse(response, path) {
        if (!response.ok) {
            const error = new Error(
                `couldn't load "${path}". Request failed with status ${response.status} : ${response.statusText}`
            );
            error.status = response.status;
            error.statusText = response.statusText;
            error.path = path;
            throw error;
        }
        return response;
    }
}