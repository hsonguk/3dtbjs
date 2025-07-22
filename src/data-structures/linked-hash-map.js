/**
 * A LinkedHashMap implementation that maintains insertion order
 * and provides O(1) access, insertion, and deletion
 */
export class LinkedHashMap {
    #nodes = {};
    #firstNode = null;
    #lastNode = null;
    #length = 0;

    constructor(values) {
        if (values) {
            this.putAll(values);
        }
    }

    /**
     * @private
     * Create new instance of node given a value.
     */
    #createNode(key, value) {
        return {
            key: key,
            value: value,
            prev: null,
            next: null,
        };
    }

    /**
     * Iterator function similar to native array's "forEach" API.
     * @param {Function} fn - Function to call for each element
     * @param {Object} [scope] - Optional scope for the function
     * @returns {boolean} True if iteration was stopped early
     */
    each(fn, scope) {
        if (typeof fn !== 'function') {
            return false;
        }

        const fnScope = scope || globalThis;
        let index = 0;
        let node = this.#firstNode;

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

    /**
     * Adds a key-value pair to the map
     * @param {*} key - The key
     * @param {*} value - The value
     * @returns {*} The old value if key existed, undefined otherwise
     */
    put(key, value) {
        if (!key) {
            return undefined;
        }

        const oldValue = this.remove(key);
        const node = this.#createNode(key, value);

        this.#nodes[key] = node;

        if (!this.#firstNode) {
            this.#firstNode = node;
        } else {
            this.#lastNode.next = node;
            node.prev = this.#lastNode;
        }

        this.#lastNode = node;
        this.#length++;

        return oldValue;
    }

    /**
     * Adds multiple values to the map
     * @param {Array} values - Array of values
     * @param {string} valueKey - Key property name in each value
     * @returns {Object} Status object with success flag and failures array
     */
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

    /**
     * Gets a value by key
     * @param {*} key - The key
     * @returns {*} The value or null if not found
     */
    get(key) {
        const node = this.#nodes[key];
        return node ? node.value : null;
    }

    /**
     * Gets a value by index
     * @param {number} index - The index
     * @returns {*} The value or null if not found
     */
    getAt(index) {
        const node = this.#getNodeAt(index);
        return node ? node.value : null;
    }

    /**
     * Gets the first node
     * @returns {Object|null} The first node or null
     */
    head() {
        return this.#firstNode;
    }

    /**
     * @private
     * Returns node at specified index.
     */
    #getNodeAt(index) {
        if (isNaN(index) || index < 0 || index >= this.#length) {
            return null;
        }

        let runningIndex = 0;
        let runningNode = this.#firstNode;

        while (runningNode) {
            if (runningIndex === index) {
                return runningNode;
            }
            runningNode = runningNode.next;
            runningIndex++;
        }
        return null;
    }

    /**
     * Gets all values as an array
     * @returns {Array} Array of all values
     */
    getAll() {
        const values = [];
        this.each(function (value) {
            values.push(value);
        });
        return values;
    }

    /**
     * Gets all keys as an array
     * @returns {Array} Array of all keys
     */
    getAllKeys() {
        const keys = [];
        this.each(function (value, key) {
            keys.push(key);
        });
        return keys;
    }

    /**
     * Removes a key-value pair
     * @param {*} key - The key to remove
     * @returns {*} The removed value or null
     */
    remove(key) {
        const existingNode = this.#nodes[key];

        if (!existingNode) {
            return null;
        }

        if (existingNode.prev) {
            existingNode.prev.next = existingNode.next;
        } else {
            this.#firstNode = existingNode.next;
        }

        if (existingNode.next) {
            existingNode.next.prev = existingNode.prev;
        } else {
            this.#lastNode = existingNode.prev;
        }

        delete this.#nodes[key];
        this.#length--;

        // Edge case: if map becomes empty
        if (this.#length === 0) {
            this.#firstNode = null;
            this.#lastNode = null;
        }

        return existingNode.value;
    }

    /**
     * Removes a value by index
     * @param {number} index - The index
     * @returns {*} The removed value or null
     */
    removeAt(index) {
        const node = this.#getNodeAt(index);
        if (node) {
            return this.remove(node.key);
        }
        return null;
    }

    /**
     * Removes all entries
     */
    removeAll() {
        this.#firstNode = null;
        this.#lastNode = null;
        this.#length = 0;
        this.#nodes = {};
    }

    /**
     * Checks if the map is empty
     * @returns {boolean} True if empty
     */
    isEmpty() {
        return this.#length === 0;
    }

    /**
     * Gets the size of the map
     * @returns {number} The number of entries
     */
    size() {
        return this.#length;
    }

    /**
     * Checks if a key has a value
     * @param {*} key - The key to check
     * @returns {boolean} True if key exists and has a non-null value
     */
    hasValue(key) {
        const value = this.get(key);
        return value !== undefined && value !== null;
    }

    /**
     * Converts the map to a JSON string
     * @param {boolean|number|string} [beautify] - Beautification options
     * @returns {string} JSON representation
     */
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