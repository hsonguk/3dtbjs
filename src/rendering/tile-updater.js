/**
 * Tile update logic for managing tile visibility and loading
 */

import { LODCalculator } from './lod-calculator.js';
// Import removed - REFINEMENT_STRATEGY not used in this file

/**
 * Manages tile updates including visibility, loading, and culling
 */
export class TileUpdater {
    constructor(config = {}) {
        this.config = config;
        this.lodCalculator = new LODCalculator(config);
        
        // Pre-bind methods to avoid recreation
        this.updateTree = this.updateTree.bind(this);
        this.updateNodeVisibility = this.updateNodeVisibility.bind(this);
        this.trimTree = this.trimTree.bind(this);
    }

    /**
     * Updates a tile and its children
     * @param {Object} tile - The tile to update
     * @param {BABYLON.Camera} camera - The camera
     */
    update(tile, camera) {
        const visibilityBeforeUpdate = tile.materialVisibility;
        
        // Calculate update metric
        if (tile.boundingVolume && tile.geometricError) {
            tile.metric = this.lodCalculator.calculateUpdateMetric(tile, camera);
        }

        // Update children first
        tile.childrenTiles.forEach((child) => child.update(camera));

        // Update this tile
        this.updateNodeVisibility(tile, tile.metric);
        this.updateTree(tile, tile.metric, camera);
        this.trimTree(tile, tile.metric, visibilityBeforeUpdate);
    }

    /**
     * Updates the tile tree structure (loading children)
     * @param {Object} tile - The tile
     * @param {number} metric - The tile's metric
     * @param {BABYLON.Camera} camera - The camera
     */
    updateTree(tile, metric, camera) {
        // If this tile does not have mesh content but it has children
        if (metric < 0 && tile.hasMeshContent) return;

        // Check occlusion culling
        if (tile.occlusionCullingService && 
            tile.hasMeshContent && 
            !tile.occlusionCullingService.hasID(tile.colorID)) {
            return;
        }

        // Determine if we should load children
        const shouldLoadChildren = !tile.hasMeshContent || 
            (this.lodCalculator.shouldRefine(metric, tile.geometricError) && tile.meshContent);

        if (shouldLoadChildren && tile.json && tile.json.children) {
            this.loadJsonChildren(tile, camera);
        }
    }

    /**
     * Updates node visibility
     * @param {Object} tile - The tile
     * @param {number} metric - The tile's metric
     */
    updateNodeVisibility(tile, metric) {
        if (!tile.hasMeshContent || !tile.meshContent) return;

        const shouldBeVisible = this.lodCalculator.shouldBeVisible(tile, metric);
        
        if (metric < 0) {
            tile.inFrustum = false;
            tile.changeContentVisibility(tile.loadOutsideView);
        } else {
            tile.inFrustum = true;
            tile.changeContentVisibility(shouldBeVisible);
        }
    }

    /**
     * Trims unnecessary tiles from the tree
     * @param {Object} tile - The tile
     * @param {number} metric - The tile's metric
     * @param {boolean} visibilityBeforeUpdate - Previous visibility state
     */
    trimTree(tile, metric, visibilityBeforeUpdate) {
        if (!tile.hasMeshContent) return;

        // Outside frustum - dispose children
        if (!tile.inFrustum) {
            tile.disposeChildren();
            return;
        }

        // Occlusion culling check
        if (tile.occlusionCullingService &&
            !visibilityBeforeUpdate &&
            tile.hasMeshContent &&
            tile.meshContent &&
            tile.meshDisplayed &&
            tile.areAllChildrenLoadedAndHidden()) {
            tile.disposeChildren();
            return;
        }

        // LOD-based trimming
        if (metric >= this.lodCalculator.geometricErrorMultiplier * tile.geometricError) {
            tile.disposeChildren();
            return;
        }
    }

    /**
     * Loads JSON children for a tile
     * @param {Object} tile - The parent tile
     * @param {BABYLON.Camera} camera - The camera
     */
    loadJsonChildren(tile, camera) {
        let childrenLength = 0;
        tile.json.children.forEach((childJSON) => {
            if (childJSON.root || childJSON.children || childJSON.content) {
                childrenLength++;
            }
        });

        if (tile.childrenTiles.length !== childrenLength) {
            this.createChildTiles(tile, camera);
        }
    }

    /**
     * Creates child tiles from JSON
     * @param {Object} parentTile - The parent tile
     * @param {BABYLON.Camera} camera - The camera
     */
    createChildTiles(parentTile, camera) {
        parentTile.json.children.forEach((childJSON) => {
            if (!childJSON.root && !childJSON.children && !childJSON.content) {
                return;
            }

            // Import OGC3DTile class dynamically to avoid circular dependency
            import('../tile/ogc-3d-tile-refactored.js').then(({ OGC3DTileRefactored }) => {
                const childTile = new OGC3DTileRefactored({
                    parentTile: parentTile,
                    queryParams: parentTile.queryParams,
                    parentGeometricError: parentTile.geometricError,
                    parentBoundingVolume: parentTile.boundingVolume,
                    parentRefine: parentTile.refine,
                    json: childJSON,
                    rootPath: parentTile.rootPath,
                    geometricErrorMultiplier: parentTile.geometricErrorMultiplier,
                    loadOutsideView: parentTile.loadOutsideView,
                    level: parentTile.level + 1,
                    tileLoader: parentTile.tileLoader,
                    cameraOnLoad: camera,
                    occlusionCullingService: parentTile.occlusionCullingService,
                    centerModel: parentTile.centerModel,
                    static: parentTile.static,
                    displayErrors: parentTile.displayErrors,
                    displayCopyright: parentTile.displayCopyright,
                    scene: parentTile.scene,
                    renderer: parentTile.renderer,
                    rootNode: parentTile.rootNode,
                    meshCallback: parentTile.meshCallback,
                    pointsCallback: parentTile.pointsCallback,
                    proxy: parentTile.proxy,
                    yUp: parentTile.yUp
                });

                childTile.parent = parentTile;
                parentTile.childrenTiles.push(childTile);
            }).catch(error => {
                console.error('Error creating child tile:', error);
            });
        });
    }

    /**
     * Updates the configuration
     * @param {Object} config - New configuration
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        this.lodCalculator.updateConfig(config);
    }
}