/**
 * Error management for 3D tiles
 */

/**
 * Custom error class for tile-related errors
 */
export class TileError extends Error {
    constructor(message, tile = null, originalError = null) {
        super(message);
        this.name = 'TileError';
        this.tile = tile;
        this.originalError = originalError;
        this.timestamp = new Date();
    }

    /**
     * Gets a detailed error message
     * @returns {string} Detailed error message
     */
    getDetailedMessage() {
        let message = `${this.name}: ${this.message}`;
        
        if (this.tile) {
            message += `\nTile: Level ${this.tile.level}, UUID: ${this.tile.uuid}`;
            if (this.tile.contentURL) {
                message += `\nURL: ${this.tile.contentURL}`;
            }
        }
        
        if (this.originalError) {
            message += `\nOriginal Error: ${this.originalError.message}`;
        }
        
        return message;
    }
}

/**
 * Manages error display and logging for tiles
 */
export class ErrorManager {
    constructor(displayErrors = false) {
        this.displayErrors = displayErrors;
        this.errorDiv = null;
        this.errors = [];
        this.maxErrors = 10; // Keep only the last 10 errors
    }

    /**
     * Handles a tile error
     * @param {Error|TileError} error - The error to handle
     */
    handleError(error) {
        // Convert to TileError if needed
        const tileError = error instanceof TileError ? error : new TileError(error.message, null, error);
        
        // Log the error
        this.logError(tileError);
        
        // Display if enabled
        if (this.displayErrors) {
            this.displayError(tileError);
        }
        
        // Store for debugging
        this.storeError(tileError);
    }

    /**
     * Logs an error to the console
     * @param {TileError} error - The error to log
     */
    logError(error) {
        console.error(error.getDetailedMessage());
        if (error.originalError) {
            console.error('Original error stack:', error.originalError.stack);
        }
    }

    /**
     * Displays an error on screen
     * @param {TileError} error - The error to display
     */
    displayError(error) {
        if (!this.errorDiv) {
            this.createErrorDiv();
        }

        const errorElement = document.createElement('div');
        errorElement.style.marginBottom = '5px';
        errorElement.style.padding = '5px';
        errorElement.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
        errorElement.style.border = '1px solid #ff0000';
        errorElement.style.borderRadius = '3px';
        errorElement.innerHTML = `
            <strong>${error.name}</strong><br>
            ${error.message}<br>
            <small>${error.timestamp.toLocaleTimeString()}</small>
        `;

        this.errorDiv.appendChild(errorElement);

        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (errorElement.parentNode) {
                errorElement.parentNode.removeChild(errorElement);
            }
        }, 10000);
    }

    /**
     * Stores an error for debugging purposes
     * @param {TileError} error - The error to store
     */
    storeError(error) {
        this.errors.push(error);
        
        // Keep only the last maxErrors
        if (this.errors.length > this.maxErrors) {
            this.errors.shift();
        }
    }

    /**
     * Creates the error display element
     * @private
     */
    createErrorDiv() {
        this.errorDiv = document.createElement('div');
        this.errorDiv.style.position = 'fixed';
        this.errorDiv.style.top = '10px';
        this.errorDiv.style.left = '50%';
        this.errorDiv.style.transform = 'translateX(-50%)';
        this.errorDiv.style.maxWidth = '500px';
        this.errorDiv.style.maxHeight = '300px';
        this.errorDiv.style.overflowY = 'auto';
        this.errorDiv.style.padding = '10px';
        this.errorDiv.style.backgroundColor = 'rgba(255, 136, 0, 0.9)';
        this.errorDiv.style.color = 'white';
        this.errorDiv.style.fontSize = '12px';
        this.errorDiv.style.fontFamily = 'Arial, sans-serif';
        this.errorDiv.style.zIndex = '10000';
        this.errorDiv.style.borderRadius = '5px';
        this.errorDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
        
        document.body.appendChild(this.errorDiv);
    }

    /**
     * Enables or disables error display
     * @param {boolean} enabled - Whether to display errors
     */
    setDisplayEnabled(enabled) {
        this.displayErrors = enabled;
        if (!enabled && this.errorDiv) {
            this.errorDiv.style.display = 'none';
        } else if (enabled && this.errorDiv) {
            this.errorDiv.style.display = 'block';
        }
    }

    /**
     * Gets all stored errors
     * @returns {Array<TileError>} Array of stored errors
     */
    getErrors() {
        return [...this.errors];
    }

    /**
     * Clears all stored errors
     */
    clearErrors() {
        this.errors = [];
        if (this.errorDiv) {
            this.errorDiv.innerHTML = '';
        }
    }

    /**
     * Disposes of the error manager
     */
    dispose() {
        if (this.errorDiv && this.errorDiv.parentNode) {
            this.errorDiv.parentNode.removeChild(this.errorDiv);
        }
        this.errorDiv = null;
        this.errors = [];
    }
}

/**
 * Global error display function for backward compatibility
 * @param {Error} error - The error to display
 */
export function showError(error) {
    console.error('Tile Error:', error);
    
    // Create a temporary error manager for display
    const errorManager = new ErrorManager(true);
    errorManager.handleError(error);
    
    // Clean up after 15 seconds
    setTimeout(() => {
        errorManager.dispose();
    }, 15000);
}