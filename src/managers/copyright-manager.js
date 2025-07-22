/**
 * Copyright management for 3D tiles
 */

/**
 * Manages copyright information display for loaded tiles
 */
export class CopyrightManager {
    constructor() {
        this.copyrights = new Map();
        this.copyrightDiv = null;
        this.displayEnabled = false;
    }

    /**
     * Adds copyright information
     * @param {string} copyrightText - The copyright text
     */
    addCopyright(copyrightText) {
        if (!copyrightText) return;

        copyrightText.split(';').forEach((text) => {
            const trimmed = text.trim();
            if (trimmed) {
                const count = this.copyrights.get(trimmed) || 0;
                this.copyrights.set(trimmed, count + 1);
            }
        });

        if (this.displayEnabled) {
            this.updateDisplay();
        }
    }

    /**
     * Removes copyright information
     * @param {string} copyrightText - The copyright text to remove
     */
    removeCopyright(copyrightText) {
        if (!copyrightText) return;

        copyrightText.split(';').forEach((text) => {
            const trimmed = text.trim();
            if (trimmed && this.copyrights.has(trimmed)) {
                const count = this.copyrights.get(trimmed);
                if (count <= 1) {
                    this.copyrights.delete(trimmed);
                } else {
                    this.copyrights.set(trimmed, count - 1);
                }
            }
        });

        if (this.displayEnabled) {
            this.updateDisplay();
        }
    }

    /**
     * Enables or disables copyright display
     * @param {boolean} enabled - Whether to display copyrights
     */
    setDisplayEnabled(enabled) {
        this.displayEnabled = enabled;
        if (enabled) {
            this.updateDisplay();
        } else {
            this.hideDisplay();
        }
    }

    /**
     * Updates the copyright display
     */
    updateDisplay() {
        if (!this.displayEnabled) return;

        if (!this.copyrightDiv) {
            this.createCopyrightDiv();
        }

        const copyrightTexts = Array.from(this.copyrights.keys());
        if (copyrightTexts.length > 0) {
            this.copyrightDiv.innerHTML = copyrightTexts.join('<br>');
            this.copyrightDiv.style.display = 'block';
        } else {
            this.copyrightDiv.style.display = 'none';
        }
    }

    /**
     * Hides the copyright display
     */
    hideDisplay() {
        if (this.copyrightDiv) {
            this.copyrightDiv.style.display = 'none';
        }
    }

    /**
     * Creates the copyright display element
     * @private
     */
    createCopyrightDiv() {
        this.copyrightDiv = document.createElement('div');
        this.copyrightDiv.style.position = 'absolute';
        this.copyrightDiv.style.bottom = '10px';
        this.copyrightDiv.style.left = '10px';
        this.copyrightDiv.style.padding = '5px';
        this.copyrightDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.copyrightDiv.style.color = 'white';
        this.copyrightDiv.style.fontSize = '12px';
        this.copyrightDiv.style.fontFamily = 'Arial, sans-serif';
        this.copyrightDiv.style.maxWidth = '300px';
        this.copyrightDiv.style.zIndex = '1000';
        this.copyrightDiv.style.display = 'none';
        
        document.body.appendChild(this.copyrightDiv);
    }

    /**
     * Disposes of the copyright manager
     */
    dispose() {
        if (this.copyrightDiv && this.copyrightDiv.parentNode) {
            this.copyrightDiv.parentNode.removeChild(this.copyrightDiv);
        }
        this.copyrights.clear();
        this.copyrightDiv = null;
    }
}

// Global instance for backward compatibility
export const globalCopyrightManager = new CopyrightManager();