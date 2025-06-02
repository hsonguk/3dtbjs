// linkedhashmap.mjs (ES Module version)

export class LinkedHashMap {
    // Public properties that were on the prototype
    firstNode = null;
    lastNode = null;
    length = 0;

    // Internal storage for nodes.
    // We'll make this a regular property, accessible within the class.
    // For true privacy, you'd use #nodes (see alternative below).
    _nodes = {}; // Changed from a scoped variable within the constructor

    constructor(values) {
        if (values) {
            this.putAll(values);
        }
        // No need to return 'this' explicitly from a constructor
    }

    /**
     * @private
     * Create new instance of node given a value.
     */
    _createNode(key, value) {
        return {
            key: key,
            value: value,
            prev: null,
            next: null
        };
    }

    /**
     * Iterator function similar to native array's "forEach" API.
     */
    each(fn, scope) {
        if (typeof(fn) !== "function") {
            return false;
        }

        const fnScope = (scope || globalThis); // Use globalThis for better environment compatibility
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
            return undefined; // Return undefined for consistency
        }

        const oldValue = this.remove(key);
        const node = this._createNode(key, value);

        this._nodes[key] = node; // Use the instance property

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
            failures: []
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
        const node = this._nodes[key]; // Use the instance property
        return node ? node.value : null;
    }

    getAt(index) {
        const node = this._getNodeAt(index);
        return node ? node.value : null;
    }

    head() {
        return this.firstNode;
    }

    /**
     * @private
     * Returns node at specified index.
     */
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
        return null; // Should ideally not be reached if length is correct
    }

    getAll() {
        const values = [];
        this.each(function(value) {
            values.push(value);
        });
        return values;
    }

    getAllKeys() {
        const keys = [];
        this.each(function(value, key) {
            keys.push(key);
        });
        return keys;
    }

    remove(key) {
        const existingNode = this._nodes[key]; // Use the instance property

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
        
        // Make sure to nullify links from the removed node as well (good practice)
        // existingNode.prev = null; 
        // existingNode.next = null;

        delete this._nodes[key]; // Use delete for object properties
        this.length--;

        // Edge case: if map becomes empty
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
        this._nodes = {}; // Reset the instance property
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
        this.each(function(value, key) {
            display[key] = value;
        });

        let space = null;
        if (typeof(beautify) === "boolean" && beautify === true) {
            space = "\t";
        } else if (!isNaN(beautify) || typeof(beautify) === "string") {
            space = beautify;
        }
        return JSON.stringify(display, null, space);
    }
}