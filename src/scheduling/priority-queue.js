/**
 * A priority queue implementation using a binary heap
 * Lower priority values have higher precedence (min-heap)
 */
export class PriorityQueue {
    constructor(compareFn) {
        this.heap = [];
        this.compare = compareFn || ((a, b) => a.priority - b.priority);
    }

    /**
     * Gets the parent index for a given index
     * @param {number} index - The child index
     * @returns {number} The parent index
     */
    #getParentIndex(index) {
        return Math.floor((index - 1) / 2);
    }

    /**
     * Gets the left child index for a given index
     * @param {number} index - The parent index
     * @returns {number} The left child index
     */
    #getLeftChildIndex(index) {
        return 2 * index + 1;
    }

    /**
     * Gets the right child index for a given index
     * @param {number} index - The parent index
     * @returns {number} The right child index
     */
    #getRightChildIndex(index) {
        return 2 * index + 2;
    }

    /**
     * Swaps two elements in the heap
     * @param {number} index1 - First index
     * @param {number} index2 - Second index
     */
    #swap(index1, index2) {
        [this.heap[index1], this.heap[index2]] = [this.heap[index2], this.heap[index1]];
    }

    /**
     * Moves an element up the heap to maintain heap property
     * @param {number} index - The index to heapify up from
     */
    #heapifyUp(index) {
        if (index === 0) return;

        const parentIndex = this.#getParentIndex(index);
        if (this.compare(this.heap[index], this.heap[parentIndex]) < 0) {
            this.#swap(index, parentIndex);
            this.#heapifyUp(parentIndex);
        }
    }

    /**
     * Moves an element down the heap to maintain heap property
     * @param {number} index - The index to heapify down from
     */
    #heapifyDown(index) {
        const leftChildIndex = this.#getLeftChildIndex(index);
        const rightChildIndex = this.#getRightChildIndex(index);
        let smallestIndex = index;

        if (
            leftChildIndex < this.heap.length &&
            this.compare(this.heap[leftChildIndex], this.heap[smallestIndex]) < 0
        ) {
            smallestIndex = leftChildIndex;
        }

        if (
            rightChildIndex < this.heap.length &&
            this.compare(this.heap[rightChildIndex], this.heap[smallestIndex]) < 0
        ) {
            smallestIndex = rightChildIndex;
        }

        if (smallestIndex !== index) {
            this.#swap(index, smallestIndex);
            this.#heapifyDown(smallestIndex);
        }
    }

    /**
     * Adds an item to the queue
     * @param {*} item - The item to add
     */
    enqueue(item) {
        this.heap.push(item);
        this.#heapifyUp(this.heap.length - 1);
    }

    /**
     * Removes and returns the highest priority item
     * @returns {*} The highest priority item or null if empty
     */
    dequeue() {
        if (this.heap.length === 0) return null;
        if (this.heap.length === 1) return this.heap.pop();

        const root = this.heap[0];
        this.heap[0] = this.heap.pop();
        this.#heapifyDown(0);
        return root;
    }

    /**
     * Returns the highest priority item without removing it
     * @returns {*} The highest priority item or null if empty
     */
    peek() {
        return this.heap.length > 0 ? this.heap[0] : null;
    }

    /**
     * Gets the size of the queue
     * @returns {number} The number of items in the queue
     */
    size() {
        return this.heap.length;
    }

    /**
     * Checks if the queue is empty
     * @returns {boolean} True if the queue is empty
     */
    isEmpty() {
        return this.heap.length === 0;
    }

    /**
     * Clears all items from the queue
     */
    clear() {
        this.heap = [];
    }

    /**
     * Converts the queue to an array (for debugging)
     * @returns {Array} Array representation of the heap
     */
    toArray() {
        return [...this.heap];
    }
}