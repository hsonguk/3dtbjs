// linkedhashmap.mjs (ES Module version with private #nodes)

export class LinkedHashMap {
    firstNode = null;
    lastNode = null;
    length = 0;

    #nodes = {}; // Private class field

    constructor(values) {
        if (values) {
            this.putAll(values);
        }
    }

    _createNode(key, value) { // Keep as internal method
        return {
            key: key,
            value: value,
            prev: null,
            next: null
        };
    }

    // ... (each method remains the same) ...
    each(fn, scope) { /* ... same as above ... */ }


    put(key, value) {
        if (!key) {
            return undefined;
        }

        const oldValue = this.remove(key);
        const node = this._createNode(key, value);

        this.#nodes[key] = node; // Access private field

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

    // ... (putAll remains the same) ...
    putAll(values, valueKey) { /* ... same as above ... */ }


    get(key) {
        const node = this.#nodes[key]; // Access private field
        return node ? node.value : null;
    }

    // ... (getAt, head, _getNodeAt, getAll, getAllKeys remain the same) ...
    getAt(index) { /* ... same as above ... */ }
    head() { /* ... same as above ... */ }
    _getNodeAt(index) { /* ... same as above ... */ }
    getAll() { /* ... same as above ... */ }
    getAllKeys() { /* ... same as above ... */ }


    remove(key) {
        const existingNode = this.#nodes[key]; // Access private field

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
        
        delete this.#nodes[key]; // Access private field
        this.length--;

        if (this.length === 0) {
            this.firstNode = null;
            this.lastNode = null;
        }
        return existingNode.value;
    }

    // ... (removeAt remains the same) ...
    removeAt(index) { /* ... same as above ... */ }


    removeAll() {
        this.firstNode = null;
        this.lastNode = null;
        this.length = 0;
        this.#nodes = {}; // Re-initialize private field
    }

    // ... (isEmpty, size, hasValue, toString remain the same) ...
    isEmpty() { /* ... same as above ... */ }
    size() { /* ... same as above ... */ }
    hasValue(key) { /* ... same as above ... */ }
    toString(beautify) { /* ... same as above ... */ }
}