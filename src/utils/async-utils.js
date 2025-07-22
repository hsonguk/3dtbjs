/**
 * Utility functions for async operations
 */

/**
 * Sets an interval that accounts for execution time to maintain consistent timing
 * @param {Function} fn - The function to execute
 * @param {number} delay - The delay between executions in milliseconds
 * @returns {Object} Object with clearInterval method
 */
export function setIntervalAsync(fn, delay) {
    let timeout;

    const run = async () => {
        const startTime = Date.now();
        try {
            await fn();
        } catch (err) {
            console.error('Error in setIntervalAsync:', err);
        }
        
        const endTime = Date.now();
        const elapsedTime = endTime - startTime;
        const nextDelay = elapsedTime >= delay ? 0 : delay - elapsedTime;
        timeout = setTimeout(run, nextDelay);
    };

    timeout = setTimeout(run, delay);

    return { 
        clearInterval: () => clearTimeout(timeout) 
    };
}

/**
 * Creates a fetch function that handles both direct and proxy requests
 * @param {string} url - The URL to fetch
 * @param {string} [proxy] - Optional proxy URL
 * @param {AbortSignal} [signal] - Optional abort signal
 * @returns {Function} The fetch function
 */
export function createFetchFunction(url, proxy, signal) {
    if (!proxy) {
        return () => fetch(url, { signal });
    } else {
        return () => fetch(proxy, {
            method: 'POST',
            body: url,
            signal
        });
    }
}