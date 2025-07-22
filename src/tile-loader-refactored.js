import { LinkedHashMap } from './data-structures/linked-hash-map.js';
import { LoadRequest, LoadResult } from './data-structures/load-request.js';
import { PriorityQueue } from './scheduling/priority-queue.js';
import { LoaderRegistry } from './loaders/loader-registry.js';
import { GltfLoader } from './loaders/gltf-loader.js';
import { B3dmLoader } from './loaders/b3dm-loader.js';
import { JsonLoader } from './loaders/json-loader.js';
import { setIntervalAsync } from './utils/async-utils.js';
import { simplifyPath, isSupportedFileType } from './utils/path-utils.js';

/**
 * Configuration constants
 */
const DEFAULT_CONFIG = {
    maxCachedItems: 100,
    downloadInterval: 10,
    loadInterval: 10,
    maxConcurrentDownloads: 6,
    batchSize: 5
};

/**
 * A refactored Tile loader that manages caching and load order.
 * The cache is an LRU cache and is defined by the number of items it can hold.
 * The load order is designed for optimal perceived loading speed (nearby tiles are refined first).
 */
export class TileLoaderRefactored {
    constructor(options = {}) {
        this.config = { ...DEFAULT_CONFIG, ...options };
        this.proxy = options.proxy;
        this.scene = options.scene;
        this.meshCallback = options.meshCallback;
        this.pointsCallback = options.pointsCallback;

        // Initialize core components
        this.cache = new LinkedHashMap();
        this.register = {};
        
        // Use priority queues instead of arrays
        this.downloadQueue = new PriorityQueue((a, b) => a.calculatePriority() - b.calculatePriority());
        this.loadQueue = new PriorityQueue((a, b) => a.calculatePriority() - b.calculatePriority());
        
        // Initialize loader registry
        this.loaderRegistry = new LoaderRegistry();
        this.#registerDefaultLoaders();
        
        // Start processing loops
        this.#startProcessing();
    }

    /**
     * Registers default loaders for supported file types
     * @private
     */
    #registerDefaultLoaders() {
        const loaderOptions = {
            proxy: this.proxy,
            scene: this.scene,
            meshCallback: this.meshCallback,
            pointsCallback: this.pointsCallback
        };

        this.loaderRegistry.register('gltf', new GltfLoader(loaderOptions));
        this.loaderRegistry.register('b3dm', new B3dmLoader(loaderOptions));
        this.loaderRegistry.register('json', new JsonLoader(loaderOptions));
    }

    /**
     * Starts the processing loops for downloads and loads
     * @private
     */
    #startProcessing() {
        // Download processing loop
        this.downloadProcessor = setIntervalAsync(async () => {
            await this.#processDownloads();
        }, this.config.downloadInterval);

        // Load processing loop  
        this.loadProcessor = setIntervalAsync(async () => {
            await this.#processLoads();
        }, this.config.loadInterval);
    }

    /**
     * Processes pending downloads
     * @private
     */
    async #processDownloads() {
        const batch = [];
        
        // Process up to batchSize downloads
        while (batch.length < this.config.batchSize && !this.downloadQueue.isEmpty()) {
            const request = this.downloadQueue.dequeue();
            
            if (request && request.isValid()) {
                batch.push(request);
            }
        }

        // Process downloads concurrently
        if (batch.length > 0) {
            await Promise.allSettled(
                batch.map(request => this.#processDownload(request))
            );
        }
    }

    /**
     * Processes a single download request
     * @private
     * @param {LoadRequest} request - The download request
     */
    async #processDownload(request) {
        try {
            const key = simplifyPath(request.path);
            const loader = this.loaderRegistry.getLoader(request.path);
            const content = await loader.load(request);
            
            // Cache the loaded content
            this.cache.put(key, content);
            this.#checkCacheSize();
            
            // Add to load queue for callback processing
            const loadResult = new LoadResult({
                cache: this.cache,
                register: this.register,
                key: key,
                distanceFunction: request.distanceFunction,
                getSiblings: request.getSiblings,
                level: request.level,
                uuid: request.tileIdentifier
            });
            
            this.loadQueue.enqueue(loadResult);
            
        } catch (error) {
            console.error(`Error downloading tile ${request.path}:`, error);
            
            // Still need to call callback with null to indicate failure
            if (request.callback) {
                try {
                    request.callback(null);
                } catch (callbackError) {
                    console.error('Error in download failure callback:', callbackError);
                }
            }
        }
    }

    /**
     * Processes pending loads (callback execution)
     * @private
     */
    async #processLoads() {
        const batch = [];
        
        // Process up to batchSize loads
        while (batch.length < this.config.batchSize && !this.loadQueue.isEmpty()) {
            const result = this.loadQueue.dequeue();
            if (result) {
                batch.push(result);
            }
        }

        // Process loads
        batch.forEach(result => this.#processLoad(result));
    }

    /**
     * Processes a single load result (executes callbacks)
     * @private
     * @param {LoadResult} result - The load result
     */
    #processLoad(result) {
        const mesh = result.cache.get(result.key);
        
        if (mesh && result.register[result.key]) {
            Object.keys(result.register[result.key]).forEach((tileId) => {
                const callback = result.register[result.key][tileId];
                if (callback) {
                    try {
                        callback(mesh);
                    } catch (error) {
                        console.error(`Error in load callback for tile ${tileId}:`, error);
                    }
                    result.register[result.key][tileId] = null;
                }
            });
        }
    }

    /**
     * Main method to request a tile load
     * @param {Object} params - Load parameters
     * @returns {void}
     */
    get({
        abortController,
        tileIdentifier,
        path,
        callback,
        distanceFunction,
        getSiblings,
        level,
        sceneZupToYup,
        meshZupToYup
    }) {
        // Validate file type
        if (!isSupportedFileType(path)) {
            console.error('Unsupported file type for path:', path);
            return;
        }

        const key = simplifyPath(path);

        // Set up abort handling
        const realAbortController = new AbortController();
        abortController.signal.addEventListener('abort', () => {
            if (!this.register[key] || Object.keys(this.register[key]).length === 0) {
                realAbortController.abort();
            }
        });

        // Initialize register for this key if needed
        if (!this.register[key]) {
            this.register[key] = {};
        }

        // Check for duplicate requests
        if (this.register[key][tileIdentifier]) {
            console.error('A tile should only be loaded once:', tileIdentifier);
            return;
        }

        this.register[key][tileIdentifier] = callback;

        // Check cache first
        const cachedObject = this.cache.get(key);
        if (cachedObject) {
            console.log('Using cached content for:', path);
            const loadResult = new LoadResult({
                cache: this.cache,
                register: this.register,
                key: key,
                distanceFunction: distanceFunction,
                getSiblings: getSiblings,
                level: level,
                uuid: tileIdentifier
            });
            this.loadQueue.enqueue(loadResult);
            return;
        }

        // Only start download if this is the first request for this key
        if (Object.keys(this.register[key]).length === 1) {
            const request = new LoadRequest({
                abortController: realAbortController,
                tileIdentifier: tileIdentifier,
                path: path,
                callback: callback,
                distanceFunction: distanceFunction,
                getSiblings: getSiblings,
                level: level,
                sceneZupToYup: sceneZupToYup,
                meshZupToYup: meshZupToYup
            });

            this.downloadQueue.enqueue(request);
        }
    }

    /**
     * Invalidates a tile request
     * @param {string} path - The tile path
     * @param {string} tileIdentifier - The tile identifier
     */
    invalidate(path, tileIdentifier) {
        const key = simplifyPath(path);
        if (this.register[key]) {
            delete this.register[key][tileIdentifier];
        }
    }

    /**
     * Manages cache size by removing unused entries
     * @private
     */
    #checkCacheSize() {
        const cacheSize = this.cache.size();
        let sizeToRemove = cacheSize - this.config.maxCachedItems;
        const entriesToRemove = [];

        if (sizeToRemove > 0) {
            this.cache.each((entry) => {
                const reg = this.register[entry.key];
                if (reg && sizeToRemove > 0 && Object.keys(reg).length === 0) {
                    entriesToRemove.push(entry);
                    sizeToRemove--;
                }
            });

            entriesToRemove.forEach((entry) => {
                this.cache.remove(entry.key);
                delete this.register[entry.key];
                
                // Dispose of the cached content if it has a dispose method
                if (entry.value && typeof entry.value.dispose === 'function') {
                    try {
                        entry.value.dispose();
                    } catch (error) {
                        console.warn('Error disposing cached content:', error);
                    }
                }
            });
        }
    }

    /**
     * Gets current statistics about the loader
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            cacheSize: this.cache.size(),
            downloadQueueSize: this.downloadQueue.size(),
            loadQueueSize: this.loadQueue.size(),
            registeredKeys: Object.keys(this.register).length,
            supportedLoaders: this.loaderRegistry.getLoaderNames()
        };
    }

    /**
     * Stops all processing and cleans up resources
     */
    dispose() {
        // Stop processing loops
        if (this.downloadProcessor) {
            this.downloadProcessor.clearInterval();
        }
        if (this.loadProcessor) {
            this.loadProcessor.clearInterval();
        }

        // Clear queues
        this.downloadQueue.clear();
        this.loadQueue.clear();

        // Clear cache and dispose contents
        this.cache.each((entry) => {
            if (entry.value && typeof entry.value.dispose === 'function') {
                try {
                    entry.value.dispose();
                } catch (error) {
                    console.warn('Error disposing cached content during cleanup:', error);
                }
            }
        });
        
        this.cache.removeAll();
        this.register = {};
        this.loaderRegistry.clear();
    }
}