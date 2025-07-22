/**
 * Registry for managing different tile loaders
 */
export class LoaderRegistry {
    constructor() {
        this.loaders = new Map();
    }

    /**
     * Registers a loader for a specific pattern or file type
     * @param {string} name - Name/identifier for the loader
     * @param {BaseLoader} loader - The loader instance
     */
    register(name, loader) {
        if (!loader.supports || typeof loader.supports !== 'function') {
            throw new Error('Loader must implement supports() method');
        }
        if (!loader.load || typeof loader.load !== 'function') {
            throw new Error('Loader must implement load() method');
        }

        this.loaders.set(name, loader);
    }

    /**
     * Gets the appropriate loader for a given file path
     * @param {string} path - The file path
     * @returns {BaseLoader} The loader that supports this file type
     * @throws {Error} If no loader is found for the file type
     */
    getLoader(path) {
        for (const [, loader] of this.loaders) {
            if (loader.supports(path)) {
                return loader;
            }
        }

        throw new Error(`No loader found for file type: ${path}`);
    }

    /**
     * Checks if a file type is supported by any registered loader
     * @param {string} path - The file path
     * @returns {boolean} True if a loader exists for this file type
     */
    isSupported(path) {
        try {
            this.getLoader(path);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Gets all registered loader names
     * @returns {Array<string>} Array of loader names
     */
    getLoaderNames() {
        return Array.from(this.loaders.keys());
    }

    /**
     * Unregisters a loader
     * @param {string} name - Name of the loader to unregister
     * @returns {boolean} True if the loader was found and removed
     */
    unregister(name) {
        return this.loaders.delete(name);
    }

    /**
     * Clears all registered loaders
     */
    clear() {
        this.loaders.clear();
    }
}