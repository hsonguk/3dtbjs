/**
 * Utility functions for path manipulation
 */

/**
 * Simplifies a file path by resolving relative path components
 * @param {string} mainPath - The path to simplify
 * @returns {string} The simplified path
 */
export function simplifyPath(mainPath) {
    const parts = mainPath.split('/');
    const newPath = [];
    let length = 0;
    
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === '.' || part === '' || part === '..') {
            if (part === '..' && length > 0) {
                length--;
            }
            continue;
        }
        newPath[length++] = part;
    }

    if (length === 0) {
        return '/';
    }

    let result = '';
    for (let i = 0; i < length; i++) {
        result += '/' + newPath[i];
    }

    return result;
}

/**
 * Detects file type based on file extension
 * @param {string} path - The file path
 * @returns {string} The file type ('b3dm', 'gltf', 'glb', 'json', 'unknown')
 */
export function detectFileType(path) {
    if (path.includes('.b3dm')) return 'b3dm';
    if (path.includes('.gltf')) return 'gltf';
    if (path.includes('.glb')) return 'glb';
    if (path.includes('.json')) return 'json';
    return 'unknown';
}

/**
 * Validates if a file type is supported
 * @param {string} path - The file path
 * @returns {boolean} True if the file type is supported
 */
export function isSupportedFileType(path) {
    const supportedTypes = ['b3dm', 'gltf', 'glb', 'json'];
    return supportedTypes.includes(detectFileType(path));
}