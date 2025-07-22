/**
 * Configuration constants and defaults for OGC 3D Tiles
 */

/**
 * Default configuration for OGC 3D Tiles
 */
export const DEFAULT_TILE_CONFIG = {
    // Rendering settings
    geometricErrorMultiplier: 1.0,
    loadOutsideView: false,
    centerModel: false,
    yUp: undefined,
    
    // Display settings
    displayErrors: false,
    displayCopyright: false,
    
    // Performance settings
    maxRecursionDepth: 20,
    skipLevels: 0,
    
    // Culling settings
    culling: {
        frustum: true,
        occlusion: false,
        distanceMultiplier: 10
    },
    
    // Level of detail settings
    lod: {
        screenSpaceError: 16,
        pixelError: 1.0
    },
    
    // Network settings
    proxy: null,
    queryParams: {},
    
    // Cache settings
    maxCachedItems: 100
};

/**
 * Tile refinement strategies
 */
export const REFINEMENT_STRATEGY = {
    REPLACE: 'REPLACE',
    ADD: 'ADD'
};

/**
 * Tile loading states
 */
export const TILE_STATE = {
    UNLOADED: 'unloaded',
    LOADING: 'loading',
    LOADED: 'loaded',
    READY: 'ready',
    FAILED: 'failed',
    DISPOSED: 'disposed'
};

/**
 * Bounding volume types
 */
export const BOUNDING_VOLUME_TYPE = {
    BOX: 'box',
    SPHERE: 'sphere',
    REGION: 'region'
};

/**
 * Content types
 */
export const CONTENT_TYPE = {
    B3DM: 'b3dm',
    GLTF: 'gltf',
    GLB: 'glb',
    JSON: 'json'
};

/**
 * Creates a tile configuration by merging user options with defaults
 * @param {Object} userConfig - User-provided configuration
 * @returns {Object} Merged configuration
 */
export function createTileConfig(userConfig = {}) {
    return {
        ...DEFAULT_TILE_CONFIG,
        ...userConfig,
        culling: {
            ...DEFAULT_TILE_CONFIG.culling,
            ...(userConfig.culling || {})
        },
        lod: {
            ...DEFAULT_TILE_CONFIG.lod,
            ...(userConfig.lod || {})
        }
    };
}