/**
 * Coordinate transformation utilities for 3D tiles
 */

/**
 * Transforms WGS84 coordinates to Cartesian coordinates
 * @param {number} lon - Longitude in radians
 * @param {number} lat - Latitude in radians
 * @param {number} h - Height in meters
 * @param {BABYLON.Vector3} result - The result vector to store the transformed coordinates
 */
export function transformWGS84ToCartesian(lon, lat, h, result) {
    const a = 6378137.0;
    const e = 0.006694384442042;
    const N = a / Math.sqrt(1.0 - e * Math.sin(lat) * Math.sin(lat));
    const cosLat = Math.cos(lat);
    const cosLon = Math.cos(lon);
    const sinLat = Math.sin(lat);
    const sinLon = Math.sin(lon);

    result.x = (N + h) * cosLat * cosLon;
    result.y = (N + h) * cosLat * sinLon;
    result.z = (N * (1.0 - e) + h) * sinLat;
}

/**
 * Calculates the distance from a tile's bounding volume to a camera
 * @param {BABYLON.BoundingSphere} boundingVolume - The tile's bounding volume
 * @param {BABYLON.Camera} camera - The camera
 * @returns {number} The distance to the camera
 */
export function calculateDistanceToCamera(boundingVolume, camera) {
    if (!boundingVolume || !camera) {
        return Number.MAX_VALUE;
    }

    // Calculate distance from camera to bounding sphere center
    const distance = BABYLON.Vector3.Distance(camera.position, boundingVolume.center);
    
    // Subtract the radius to get distance to surface
    return Math.max(0, distance - boundingVolume.radius);
}

/**
 * Transforms degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
export function degreesToRadians(degrees) {
    return degrees * Math.PI / 180;
}

/**
 * Transforms radians to degrees
 * @param {number} radians - Angle in radians
 * @returns {number} Angle in degrees
 */
export function radiansToDegrees(radians) {
    return radians * 180 / Math.PI;
}