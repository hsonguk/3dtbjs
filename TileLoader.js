// Import the refactored implementation
import { TileLoaderRefactored } from './src/tile-loader-refactored.js';

// Legacy LinkedHashMap class for backward compatibility
// These are kept for any existing code that might directly use them
// eslint-disable-next-line no-unused-vars
class LinkedHashMap {
    firstNode = null;
    lastNode = null;
    length = 0;
    _nodes = {};

    constructor(values) {
        if (values) {
            this.putAll(values);
        }
    }

    _createNode(key, value) {
        return {
            key: key,
            value: value,
            prev: null,
            next: null,
        };
    }

    each(fn, scope) {
        if (typeof fn !== 'function') {
            return false;
        }

        const fnScope = scope || globalThis;
        let index = 0;
        let node = this.firstNode;

        while (node) {
            if (node.value !== undefined && node.value !== null) {
                const result = fn.call(fnScope, node.value, node.key, index);
                if (result === true) {
                    return true;
                }
            }
            node = node.next;
            index++;
        }
        return false;
    }

    put(key, value) {
        if (!key) {
            return undefined;
        }

        const oldValue = this.remove(key);
        const node = this._createNode(key, value);

        this._nodes[key] = node;

        if (!this.firstNode) {
            this.firstNode = node;
        } else {
            this.lastNode.next = node;
            node.prev = this.lastNode;
        }

        this.lastNode = node;
        this.length++;

        return oldValue;
    }

    putAll(values, valueKey) {
        const status = {
            success: true,
            failures: [],
        };

        if (!values || !valueKey) {
            status.success = false;
            return status;
        }

        for (let i = 0, l = values.length; i < l; i++) {
            const value = values[i];
            const key = value[valueKey];

            if (!key) {
                status.failures.push(value);
                continue;
            }
            this.put(key, value);
        }
        return status;
    }

    get(key) {
        const node = this._nodes[key];
        return node ? node.value : null;
    }

    getAt(index) {
        const node = this._getNodeAt(index);
        return node ? node.value : null;
    }

    head() {
        return this.firstNode;
    }

    _getNodeAt(index) {
        if (isNaN(index) || index < 0 || index >= this.length) {
            return null;
        }

        let runningIndex = 0;
        let runningNode = this.firstNode;

        while (runningNode) {
            if (runningIndex === index) {
                return runningNode;
            }
            runningNode = runningNode.next;
            runningIndex++;
        }
        return null;
    }

    getAll() {
        const values = [];
        this.each(function (value) {
            values.push(value);
        });
        return values;
    }

    getAllKeys() {
        const keys = [];
        this.each(function (value, key) {
            keys.push(key);
        });
        return keys;
    }

    remove(key) {
        const existingNode = this._nodes[key];

        if (!existingNode) {
            return null;
        }

        if (existingNode.prev) {
            existingNode.prev.next = existingNode.next;
        } else {
            this.firstNode = existingNode.next;
        }

        if (existingNode.next) {
            existingNode.next.prev = existingNode.prev;
        } else {
            this.lastNode = existingNode.prev;
        }

        delete this._nodes[key];
        this.length--;

        if (this.length === 0) {
            this.firstNode = null;
            this.lastNode = null;
        }

        return existingNode.value;
    }

    removeAt(index) {
        const node = this._getNodeAt(index);
        if (node) {
            return this.remove(node.key);
        }
        return null;
    }

    removeAll() {
        this.firstNode = null;
        this.lastNode = null;
        this.length = 0;
        this._nodes = {};
    }

    isEmpty() {
        return this.length === 0;
    }

    size() {
        return this.length;
    }

    hasValue(key) {
        const value = this.get(key);
        return value !== undefined && value !== null;
    }

    toString(beautify) {
        const display = {};
        this.each(function (value, key) {
            display[key] = value;
        });

        let space = null;
        if (typeof beautify === 'boolean' && beautify === true) {
            space = '\t';
        } else if (!isNaN(beautify) || typeof beautify === 'string') {
            space = beautify;
        }
        return JSON.stringify(display, null, space);
    }
}

/**
 * Legacy TileLoader class that wraps the refactored implementation
 * This maintains backward compatibility while using the improved architecture
 * 
 * @param {Object} [options] - Optional configuration object.
 * @param {number} [options.maxCachedItems=100] - the cache size.
 * @param {function} [options.meshCallback] - A callback to call on newly decoded meshes.
 * @param {function} [options.pointsCallback] - A callback to call on newly decoded points.
 * @param {renderer} [options.renderer] - The renderer, this is required for KTX2 support.
 * @param {object} [options.scene] - The scene to load the tiles into.
 * @param {string} [options.proxy] - An optional proxy that tile requests will be directed too as POST requests with the actual tile url in the body of the request.
 */
export class TileLoader {
    constructor(options = {}) {
        // Create the refactored implementation internally
        this.refactoredLoader = new TileLoaderRefactored(options);
        
        // Expose legacy properties for backward compatibility
        this.maxCachedItems = options.maxCachedItems || 100;
        this.proxy = options.proxy;
        this.meshCallback = options.meshCallback;
        this.pointsCallback = options.pointsCallback;
        this.scene = options.scene;
        
        // Legacy properties that are no longer used but might be accessed
        this.cache = this.refactoredLoader.cache;
        this.register = this.refactoredLoader.register;
    }

    /**
     * Legacy get method that delegates to the refactored implementation
     */
    get(
        abortController,
        tileIdentifier,
        path,
        callback,
        distanceFunction,
        getSiblings,
        level,
        sceneZupToYup,
        meshZupToYup
    ) {
        return this.refactoredLoader.get({
            abortController,
            tileIdentifier,
            path,
            callback,
            distanceFunction,
            getSiblings,
            level,
            sceneZupToYup,
            meshZupToYup
        });
    }

    /**
     * Legacy invalidate method
     */
    invalidate(path, tileIdentifier) {
        return this.refactoredLoader.invalidate(path, tileIdentifier);
    }

    /**
     * Legacy checkSize method (now handled automatically)
     */
    checkSize() {
        // This is now handled automatically by the refactored implementation
        // Keep this method for backward compatibility but it's essentially a no-op
        console.warn('checkSize() is deprecated and handled automatically');
    }

    /**
     * Get statistics about the loader
     */
    getStats() {
        return this.refactoredLoader.getStats();
    }

    /**
     * Dispose of the loader and clean up resources
     */
    dispose() {
        return this.refactoredLoader.dispose();
    }

    // Legacy methods that are no longer needed but kept for compatibility
    init() {
        console.warn('init() is deprecated and handled automatically in constructor');
    }

    scheduleDownload() {
        console.warn('scheduleDownload() is deprecated and handled automatically');
    }

    download() {
        console.warn('download() is deprecated and handled automatically');
    }

    meshReceived() {
        console.warn('meshReceived() is deprecated and handled automatically');
    }

    loadBatch() {
        console.warn('loadBatch() is deprecated and handled automatically');
        return 0;
    }

    getNextDownloads() {
        console.warn('getNextDownloads() is deprecated and handled automatically');
    }

    getNextReady() {
        console.warn('getNextReady() is deprecated and handled automatically');
    }
}