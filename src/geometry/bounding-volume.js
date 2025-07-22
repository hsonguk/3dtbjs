/**
 * Bounding volume factory and utilities for 3D tiles
 */

/**
 * Factory class for creating bounding volumes from different formats
 */
export class BoundingVolumeFactory {
    /**
     * Creates a bounding sphere from a box definition
     * @param {Array<number>} values - Box values array [cx, cy, cz, xx, xy, xz, yx, yy, yz, zx, zy, zz]
     * @param {BABYLON.Matrix} worldMatrix - World transformation matrix
     * @returns {BABYLON.BoundingSphere} The bounding sphere
     */
    static createFromBox(values, worldMatrix) {
        const e1 = new BABYLON.Vector3(values[3], values[4], values[5]);
        const halfWidth = e1.length();
        const e2 = new BABYLON.Vector3(values[6], values[7], values[8]);
        const halfHeight = e2.length();
        const e3 = new BABYLON.Vector3(values[9], values[10], values[11]);
        const halfDepth = e3.length();

        const radius = Math.sqrt(halfWidth * halfWidth + halfHeight * halfHeight + halfDepth * halfDepth);
        const center = BABYLON.Vector3.TransformCoordinates(
            new BABYLON.Vector3(values[0], values[2], -values[1]),
            worldMatrix
        );

        return BABYLON.BoundingSphere.CreateFromCenterAndRadius(center, radius);
    }

    /**
     * Creates a bounding sphere from a region definition
     * @param {Array<number>} region - Region array [west, south, east, north, minHeight, maxHeight]
     * @param {Function} transformWGS84ToCartesian - Coordinate transformation function
     * @param {BABYLON.Vector3} tempVec1 - Temporary vector for calculations
     * @param {BABYLON.Vector3} tempVec2 - Temporary vector for calculations
     * @returns {BABYLON.BoundingSphere} The bounding sphere
     */
    static createFromRegion(region, transformWGS84ToCartesian, tempVec1, tempVec2) {
        transformWGS84ToCartesian(region[0], region[1], region[4], tempVec1);
        transformWGS84ToCartesian(region[2], region[3], region[5], tempVec2);
        const center = BABYLON.Vector3.Lerp(tempVec1, tempVec2, 0.5);
        const radius = BABYLON.Vector3.Distance(tempVec1, tempVec2);
        
        return BABYLON.BoundingSphere.CreateFromCenterAndRadius(center, radius);
    }

    /**
     * Creates a bounding sphere from a sphere definition
     * @param {Array<number>} sphere - Sphere array [x, y, z, radius]
     * @returns {BABYLON.BoundingSphere} The bounding sphere
     */
    static createFromSphere(sphere) {
        return BABYLON.BoundingSphere.CreateFromCenterAndRadius(
            new BABYLON.Vector3(sphere[0], sphere[1], sphere[2]),
            sphere[3]
        );
    }

    /**
     * Creates a bounding volume from JSON bounding volume definition
     * @param {Object} boundingVolumeJson - The bounding volume JSON
     * @param {BABYLON.Matrix} worldMatrix - World transformation matrix
     * @param {Function} transformWGS84ToCartesian - Coordinate transformation function
     * @param {BABYLON.Vector3} tempVec1 - Temporary vector for calculations
     * @param {BABYLON.Vector3} tempVec2 - Temporary vector for calculations
     * @param {BABYLON.BoundingSphere} [fallback] - Fallback bounding volume
     * @returns {BABYLON.BoundingSphere} The bounding sphere
     */
    static createFromJson(boundingVolumeJson, worldMatrix, transformWGS84ToCartesian, tempVec1, tempVec2, fallback) {
        if (!boundingVolumeJson) {
            return fallback;
        }

        if (boundingVolumeJson.box) {
            return this.createFromBox(boundingVolumeJson.box, worldMatrix);
        } else if (boundingVolumeJson.region) {
            return this.createFromRegion(boundingVolumeJson.region, transformWGS84ToCartesian, tempVec1, tempVec2);
        } else if (boundingVolumeJson.sphere) {
            return this.createFromSphere(boundingVolumeJson.sphere);
        } else {
            return fallback;
        }
    }
}