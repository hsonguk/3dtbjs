/**
 * Represents a tile load request with all necessary parameters
 */
export class LoadRequest {
    constructor({
        abortController,
        tileIdentifier,
        path,
        callback,
        distanceFunction = null,
        getSiblings = () => [],
        level = 0,
        sceneZupToYup = false,
        meshZupToYup = false,
        priority = 0
    }) {
        this.abortController = abortController;
        this.tileIdentifier = tileIdentifier;
        this.path = path;
        this.callback = callback;
        this.distanceFunction = distanceFunction;
        this.getSiblings = getSiblings;
        this.level = level;
        this.sceneZupToYup = sceneZupToYup;
        this.meshZupToYup = meshZupToYup;
        this.priority = priority;
        
        // Validate required parameters
        this.#validate();
    }

    #validate() {
        if (!this.abortController) {
            throw new Error('LoadRequest requires an abortController');
        }
        if (!this.tileIdentifier) {
            throw new Error('LoadRequest requires a tileIdentifier');
        }
        if (!this.path) {
            throw new Error('LoadRequest requires a path');
        }
        if (typeof this.callback !== 'function') {
            throw new Error('LoadRequest requires a callback function');
        }
    }

    /**
     * Calculates the priority for this request
     * @returns {number} The calculated priority
     */
    calculatePriority() {
        if (!this.distanceFunction) {
            return 0; // JSON files get highest priority
        }
        return this.distanceFunction() * this.level;
    }

    /**
     * Checks if this request should still be processed
     * @returns {boolean} True if the request is still valid
     */
    isValid() {
        return !this.abortController.signal.aborted;
    }

    /**
     * Gets sibling requests for batch processing
     * @returns {Array} Array of sibling tile identifiers
     */
    getSiblingIds() {
        try {
            return this.getSiblings();
        } catch (error) {
            console.warn('Error getting siblings for request:', error);
            return [];
        }
    }
}

/**
 * Represents a processed load result
 */
export class LoadResult {
    constructor({
        cache,
        register,
        key,
        distanceFunction = null,
        getSiblings = () => [],
        level = 0,
        uuid
    }) {
        this.cache = cache;
        this.register = register;
        this.key = key;
        this.distanceFunction = distanceFunction;
        this.getSiblings = getSiblings;
        this.level = level;
        this.uuid = uuid;
    }

    /**
     * Calculates the priority for processing this result
     * @returns {number} The calculated priority
     */
    calculatePriority() {
        if (!this.distanceFunction) {
            return 0; // JSON files get highest priority
        }
        return this.distanceFunction() * this.level;
    }

    /**
     * Gets sibling UUIDs for batch processing
     * @returns {Array} Array of sibling UUIDs
     */
    getSiblingUuids() {
        try {
            return this.getSiblings();
        } catch (error) {
            console.warn('Error getting siblings for result:', error);
            return [];
        }
    }
}