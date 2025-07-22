/**
 * Level of Detail (LOD) calculation utilities for 3D tiles
 */

/**
 * Calculates level of detail metrics for tiles
 */
export class LODCalculator {
    constructor(config = {}) {
        this.geometricErrorMultiplier = config.geometricErrorMultiplier || 1.0;
        this.screenSpaceError = config.screenSpaceError || 16;
        this.pixelError = config.pixelError || 1.0;
    }

    /**
     * Calculates the update metric for a tile
     * @param {Object} tile - The tile object
     * @param {BABYLON.Camera} camera - The camera
     * @returns {number} The update metric (-1 if outside frustum, positive value for LOD)
     */
    calculateUpdateMetric(tile, camera) {
        if (!tile.boundingVolume || !tile.geometricError) {
            return -1;
        }

        // Check frustum culling
        if (!this.isInFrustum(tile.boundingVolume, camera)) {
            return -1;
        }

        // Calculate screen space error
        const distance = this.calculateDistanceToCamera(tile.boundingVolume, camera);
        const screenSpaceError = this.calculateScreenSpaceError(tile.geometricError, distance, camera);
        
        return screenSpaceError;
    }

    /**
     * Checks if a bounding volume is in the camera frustum
     * @param {BABYLON.BoundingSphere} boundingVolume - The bounding volume
     * @param {BABYLON.Camera} camera - The camera
     * @returns {boolean} True if in frustum
     */
    isInFrustum(boundingVolume, camera) {
        try {
            const frustumPlanes = BABYLON.Frustum.GetPlanes(camera.getTransformationMatrix());
            return boundingVolume.isInFrustum(frustumPlanes);
        } catch (error) {
            console.warn('Error checking frustum:', error);
            return true; // Default to visible if check fails
        }
    }

    /**
     * Calculates distance from bounding volume to camera
     * @param {BABYLON.BoundingSphere} boundingVolume - The bounding volume
     * @param {BABYLON.Camera} camera - The camera
     * @returns {number} Distance to camera
     */
    calculateDistanceToCamera(boundingVolume, camera) {
        const distance = BABYLON.Vector3.Distance(camera.position, boundingVolume.center);
        return Math.max(0, distance - boundingVolume.radius);
    }

    /**
     * Calculates screen space error for a tile
     * @param {number} geometricError - The tile's geometric error
     * @param {number} distance - Distance to camera
     * @param {BABYLON.Camera} camera - The camera
     * @returns {number} Screen space error in pixels
     */
    calculateScreenSpaceError(geometricError, distance, camera) {
        if (distance <= 0) {
            return Number.MAX_VALUE;
        }

        // Get renderer size
        const rendererSize = this.getRendererSize(camera);
        let aspect = 1;
        
        if (camera.getEngine) {
            const engine = camera.getEngine();
            aspect = engine.getScreenAspectRatio();
        }

        let screenHeight = rendererSize.y;
        let fov = camera.fov;

        if (aspect < 1) {
            fov *= aspect;
            screenHeight = rendererSize.x;
        }

        // Calculate screen space error
        const screenSpaceError = (geometricError * screenHeight) / (2 * distance * Math.tan(fov * 0.5));
        
        return screenSpaceError;
    }

    /**
     * Gets the renderer size
     * @param {BABYLON.Camera} camera - The camera
     * @returns {Object} Object with x and y properties
     */
    getRendererSize(camera) {
        if (camera.getEngine) {
            const engine = camera.getEngine();
            return {
                x: engine.getRenderWidth(true),
                y: engine.getRenderHeight(true)
            };
        }
        
        // Fallback
        return { x: 1000, y: 1000 };
    }

    /**
     * Determines if a tile should be refined based on its metric
     * @param {number} metric - The tile's update metric
     * @param {number} geometricError - The tile's geometric error
     * @returns {boolean} True if tile should be refined
     */
    shouldRefine(metric, geometricError) {
        if (metric < 0) return false; // Outside frustum
        return metric < this.geometricErrorMultiplier * geometricError;
    }

    /**
     * Determines if a tile should be visible
     * @param {Object} tile - The tile object
     * @param {number} metric - The tile's update metric
     * @returns {boolean} True if tile should be visible
     */
    shouldBeVisible(tile, metric) {
        if (!tile.hasMeshContent || !tile.meshContent) {
            return false;
        }

        if (metric < 0) {
            return tile.loadOutsideView || false;
        }

        // Has no children - always visible if in frustum
        if (tile.childrenTiles.length === 0) {
            return true;
        }

        // Ideal LOD or before ideal LOD
        if (metric >= this.geometricErrorMultiplier * tile.geometricError) {
            return true;
        }

        // Check if children are ready for replacement
        if (tile.refine === 'REPLACE' && tile.childrenTiles.every(child => child.isReady())) {
            return false;
        }

        return true;
    }

    /**
     * Updates the configuration
     * @param {Object} config - New configuration values
     */
    updateConfig(config) {
        if (config.geometricErrorMultiplier !== undefined) {
            this.geometricErrorMultiplier = config.geometricErrorMultiplier;
        }
        if (config.screenSpaceError !== undefined) {
            this.screenSpaceError = config.screenSpaceError;
        }
        if (config.pixelError !== undefined) {
            this.pixelError = config.pixelError;
        }
    }
}