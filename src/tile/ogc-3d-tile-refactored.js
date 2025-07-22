/**
 * Refactored OGC 3D Tile implementation with modular architecture
 */

import { TileStateMachine } from './tile-state-machine.js';
import { TileUpdater } from '../rendering/tile-updater.js';
import { BoundingVolumeFactory } from '../geometry/bounding-volume.js';
import { transformWGS84ToCartesian, calculateDistanceToCamera } from '../geometry/coordinate-transform.js';
import { assembleURL, extractQueryParams, addQueryParams } from '../utils/url-utils.js';
import { createTileConfig, TILE_STATE, REFINEMENT_STRATEGY } from '../config/tile-config.js';
import { ErrorManager, TileError } from '../managers/error-manager.js';
import { globalCopyrightManager } from '../managers/copyright-manager.js';

/**
 * Refactored OGC 3D Tile class with improved architecture
 */
export class OGC3DTileRefactored extends BABYLON.TransformNode {
    // Static temporary objects for calculations
    static #tempSphere = new BABYLON.BoundingSphere(new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(0, 1, 0));
    static #tempVec1 = new BABYLON.Vector3(0, 0, 0);
    static #tempVec2 = new BABYLON.Vector3(0, 0, 0);
    static #upVector = new BABYLON.Vector3(0, 1, 0);
    static #tempQuaternion = new BABYLON.Quaternion();

    constructor(properties = {}) {
        super();
        
        // Initialize configuration
        this.config = createTileConfig(properties);
        
        // Initialize core components
        this.stateMachine = new TileStateMachine(this);
        this.updater = new TileUpdater(this.config);
        this.errorManager = new ErrorManager(this.config.displayErrors);
        
        // Initialize properties
        this.initializeProperties(properties);
        
        // Setup tile based on input
        if (properties.json) {
            this.initializeFromJson(properties);
        } else if (properties.url) {
            this.initializeFromUrl(properties);
        }
    }

    /**
     * Initializes tile properties
     * @param {Object} properties - Tile properties
     */
    initializeProperties(properties) {
        // Basic properties
        this.uuid = this.generateUUID();
        this.level = properties.level || 0;
        this.name = `Level${this.level}`;
        
        // Configuration properties
        this.proxy = properties.proxy;
        this.yUp = properties.yUp;
        this.queryParams = properties.queryParams ? { ...properties.queryParams } : {};
        
        // Rendering properties
        this.scene = properties.scene;
        this.renderer = properties.renderer;
        this.rootNode = properties.rootNode;
        this.meshCallback = properties.meshCallback;
        this.pointsCallback = properties.pointsCallback;
        
        // Tile loader - will be set asynchronously if not provided
        this.tileLoader = properties.tileLoader;
        
        // Hierarchy properties
        this.parentTile = properties.parentTile;
        this.parent = properties.parentTile;
        this.childrenTiles = [];
        
        // Content properties
        this.meshContent = null;
        this.tileContent = null;
        this.contentURL = null;
        
        // State properties
        this.materialVisibility = false;
        this.inFrustum = true;
        this.hasMeshContent = false;
        this.hasUnloadedJSONContent = false;
        this.deleted = false;
        
        // Tile-specific properties
        this.refine = REFINEMENT_STRATEGY.REPLACE;
        this.geometricError = properties.parentGeometricError;
        this.boundingVolume = properties.parentBoundingVolume;
        this.rootPath = null;
        this.json = null;
        this.metric = 0;
        
        // Services
        this.occlusionCullingService = properties.occlusionCullingService;
        
        // Abort controller for cancelling requests
        this.abortController = new AbortController();
        
        // Static optimization
        if (this.config.static) {
            this.matrixAutoUpdate = false;
        }

        // Copyright management
        globalCopyrightManager.setDisplayEnabled(this.config.displayCopyright);
    }

    /**
     * Creates a tile loader if not provided
     * @param {Object} properties - Properties for tile loader
     * @returns {Object} Tile loader instance
     */
    async createTileLoader(properties) {
        const { TileLoader } = await import('../../TileLoader.js');
        
        const tileLoaderOptions = {
            meshCallback: properties.meshCallback || ((mesh) => {
                console.debug('Processing mesh:', mesh);
            }),
            pointsCallback: properties.pointsCallback || ((points) => {
                console.debug('Processing points:', points);
            }),
            proxy: this.proxy,
            scene: properties.scene,
            maxCachedItems: this.config.maxCachedItems
        };
        
        return new TileLoader(tileLoaderOptions);
    }

    /**
     * Initializes tile from JSON data
     * @param {Object} properties - Properties containing JSON data
     */
    initializeFromJson(properties) {
        this.setup(properties);
        if (properties.onLoadCallback) {
            properties.onLoadCallback(this);
        }
    }

    /**
     * Initializes tile from URL
     * @param {Object} properties - Properties containing URL
     */
    async initializeFromUrl(properties) {
        try {
            this.stateMachine.transition(TILE_STATE.LOADING);
            
            const url = this.buildTilesetUrl(properties.url);
            const response = await this.fetchTileset(url);
            const json = await response.json();
            
            this.setup({ 
                rootPath: this.extractRootPath(properties.url), 
                json: json 
            });
            
            if (properties.onLoadCallback) {
                properties.onLoadCallback(this);
            }
            
            if (this.config.centerModel) {
                this.applyCenterModelTransform();
            }
            
            this.stateMachine.transition(TILE_STATE.LOADED);
            
        } catch (error) {
            this.stateMachine.transition(TILE_STATE.FAILED);
            this.errorManager.handleError(new TileError('Failed to load tileset', this, error));
        }
    }

    /**
     * Builds the complete tileset URL with query parameters
     * @param {string} baseUrl - Base URL
     * @returns {string} Complete URL
     */
    buildTilesetUrl(baseUrl) {
        return addQueryParams(baseUrl, this.queryParams);
    }

    /**
     * Fetches the tileset JSON
     * @param {string} url - URL to fetch
     * @returns {Promise<Response>} Fetch response
     */
    async fetchTileset(url) {
        const fetchFunction = this.proxy ? 
            () => fetch(this.proxy, {
                method: 'POST',
                body: url,
                signal: this.abortController.signal,
            }) :
            () => fetch(url, { signal: this.abortController.signal });

        const response = await fetchFunction();
        
        if (!response.ok) {
            throw new Error(
                `couldn't load "${url}". Request failed with status ${response.status} : ${response.statusText}`
            );
        }
        
        return response;
    }

    /**
     * Extracts root path from URL
     * @param {string} url - Full URL
     * @returns {string} Root path
     */
    extractRootPath(url) {
        const lastSlashIndex = url.lastIndexOf('/');
        return lastSlashIndex > 0 ? url.substring(0, lastSlashIndex) : url;
    }

    /**
     * Sets up tile from JSON data
     * @param {Object} properties - Setup properties
     */
    setup(properties) {
        this.parseJsonStructure(properties.json);
        this.rootPath = properties.json.rootPath || properties.rootPath;
        
        this.parseRefineStrategy();
        this.parseGeometricError(properties);
        this.parseTransform(properties);
        this.parseBoundingVolume(properties);
        this.parseContent();
    }

    /**
     * Parses JSON structure (root vs direct)
     * @param {Object} json - JSON data
     */
    parseJsonStructure(json) {
        if (json.root) {
            this.json = json.root;
            if (!this.json.refine) this.json.refine = json.refine;
            if (!this.json.geometricError) this.json.geometricError = json.geometricError;
            if (!this.json.transform) this.json.transform = json.transform;
            if (!this.json.boundingVolume) this.json.boundingVolume = json.boundingVolume;
        } else {
            this.json = json;
        }
    }

    /**
     * Parses refine strategy
     */
    parseRefineStrategy() {
        this.refine = this.json.refine || this.refine;
    }

    /**
     * Parses geometric error
     * @param {Object} properties - Properties containing parent geometric error
     */
    parseGeometricError(properties) {
        this.geometricError = this.json.geometricError || properties.parentGeometricError;
    }

    /**
     * Parses transform matrix
     */
    parseTransform() {
        if (this.json.transform && !this.config.centerModel) {
            const mat = BABYLON.Matrix.FromArray(this.json.transform);
            this.setPreTransformMatrix(mat);
        }
    }

    /**
     * Parses bounding volume
     * @param {Object} properties - Properties containing parent bounding volume
     */
    parseBoundingVolume(properties) {
        const worldMatrix = this.computeWorldMatrix(true);
        
        this.boundingVolume = BoundingVolumeFactory.createFromJson(
            this.json.boundingVolume,
            worldMatrix,
            transformWGS84ToCartesian,
            OGC3DTileRefactored.#tempVec1,
            OGC3DTileRefactored.#tempVec2,
            properties.parentBoundingVolume
        );
    }

    /**
     * Parses content information
     */
    parseContent() {
        if (this.json.content) {
            const contentUri = this.json.content.uri || this.json.content.url;
            
            if (contentUri && contentUri.includes('json')) {
                this.hasUnloadedJSONContent = true;
            } else {
                this.hasMeshContent = true;
            }
            
            this.load();
        }
    }

    /**
     * Loads tile content
     */
    async load() {
        if (this.deleted || !this.json.content) return;
        
        try {
            this.stateMachine.transition(TILE_STATE.LOADING);
            
            const url = this.buildContentUrl();
            
            if (url.includes('.b3dm') || url.includes('.glb') || url.includes('.gltf')) {
                await this.loadMeshContent(url);
            } else if (url.includes('.json')) {
                await this.loadJsonContent(url);
            }
            
            this.stateMachine.transition(TILE_STATE.LOADED);
            
        } catch (error) {
            this.stateMachine.transition(TILE_STATE.FAILED);
            this.errorManager.handleError(new TileError('Failed to load content', this, error));
        }
    }

    /**
     * Builds content URL
     * @returns {string} Content URL
     */
    buildContentUrl() {
        let url = this.json.content.uri || this.json.content.url;
        
        const urlRegex = /^(?:http|https|ftp|tcp|udp):\/\/\S+/;
        
        if (urlRegex.test(this.rootPath) && !urlRegex.test(url)) {
            url = assembleURL(this.rootPath, url);
        }
        
        url = extractQueryParams(url, this.queryParams);
        return addQueryParams(url, this.queryParams);
    }

    /**
     * Loads mesh content (B3DM, GLTF, GLB)
     * @param {string} url - Content URL
     */
    loadMeshContent(url) {
        this.contentURL = url;
        
        return new Promise((resolve) => {
            this.tileLoader.get(
                this.abortController,
                this.uuid,
                url,
                (mesh) => {
                    if (this.deleted) return;
                    
                    this.processMeshContent(mesh);
                    resolve();
                },
                () => this.calculateDistanceToCamera(this.cameraOnLoad),
                () => this.getSiblings(),
                this.level,
                this.json.boundingVolume.region ? false : this.yUp === undefined || this.yUp,
                this.json.boundingVolume.region
            );
        });
    }

    /**
     * Processes loaded mesh content
     * @param {Object} mesh - Loaded mesh
     */
    processMeshContent(mesh) {
        if (!mesh) return;
        
        // Handle copyright
        if (mesh.asset && mesh.asset.copyright) {
            globalCopyrightManager.addCopyright(mesh.asset.copyright);
        }
        
        // Process mesh
        if (mesh.meshes) {
            mesh.meshes.forEach((m) => {
                m.alwaysSelectAsActiveMesh = true;
            });
        }
        
        if (mesh.materials) {
            mesh.materials.forEach((m) => {
                m.freeze();
            });
        }
        
        this.meshContent = mesh;
        this.stateMachine.transition(TILE_STATE.READY);
    }

    /**
     * Loads JSON content
     * @param {string} url - Content URL
     */
    loadJsonContent(url) {
        return new Promise((resolve) => {
            this.tileLoader.get(this.abortController, this.uuid, url, (json) => {
                if (this.deleted) return;
                
                if (!this.json.children) this.json.children = [];
                json.rootPath = this.extractRootPath(url);
                this.json.children.push(json);
                delete this.json.content;
                this.hasUnloadedJSONContent = false;
                
                resolve();
            });
        });
    }

    /**
     * Updates the tile
     * @param {BABYLON.Camera} camera - The camera
     */
    update(camera) {
        this.updater.update(this, camera);
    }

    /**
     * Calculates distance to camera
     * @param {BABYLON.Camera} camera - The camera
     * @returns {number} Distance to camera
     */
    calculateDistanceToCamera(camera) {
        return calculateDistanceToCamera(this.boundingVolume, camera);
    }

    /**
     * Gets sibling tiles
     * @returns {Array} Array of sibling tile UUIDs
     */
    getSiblings() {
        if (!this.parentTile) return [];
        
        return this.parentTile.childrenTiles
            .filter(tile => tile !== this)
            .map(tile => tile.uuid);
    }

    /**
     * Checks if tile is ready
     * @returns {boolean} True if ready
     */
    isReady() {
        return this.stateMachine.isReady();
    }

    /**
     * Changes content visibility
     * @param {boolean} visibility - Visibility state
     */
    changeContentVisibility(visibility) {
        this.materialVisibility = visibility;
        
        if (this.meshContent) {
            // Implementation depends on how meshes are managed in Babylon.js
            // This is a placeholder for the actual visibility logic
            this.meshContent.setEnabled(visibility);
        }
    }

    /**
     * Applies center model transform
     */
    applyCenterModelTransform() {
        if (!this.json.boundingVolume.region) return;
        
        const region = this.json.boundingVolume.region;
        const centerLon = (region[0] + region[2]) * 0.5;
        const centerLat = (region[1] + region[3]) * 0.5;
        const centerHeight = (region[4] + region[5]) * 0.5;
        
        transformWGS84ToCartesian(centerLon, centerLat, centerHeight, OGC3DTileRefactored.#tempVec1);
        
        OGC3DTileRefactored.#tempQuaternion.setFromUnitVectors(
            OGC3DTileRefactored.#tempVec1.normalize(),
            OGC3DTileRefactored.#upVector.normalize()
        );
        
        this.applyQuaternion(OGC3DTileRefactored.#tempQuaternion);
        
        const tempSphere = this.boundingVolume;
        this.translateX(-tempSphere.center.x * this.scale.x);
        this.translateY(-tempSphere.center.y * this.scale.y);
        this.translateZ(-tempSphere.center.z * this.scale.z);
    }

    /**
     * Disposes children tiles
     */
    disposeChildren() {
        this.childrenTiles.forEach((tile) => tile.dispose());
        this.childrenTiles = [];
    }

    /**
     * Generates a UUID
     * @returns {string} UUID
     */
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Disposes the tile
     */
    dispose() {
        // Handle copyright removal
        if (this.meshContent && this.meshContent.asset && this.meshContent.asset.copyright) {
            globalCopyrightManager.removeCopyright(this.meshContent.asset.copyright);
        }

        // Change visibility and dispose children
        this.changeContentVisibility(false);
        this.disposeChildren();
        
        // Mark as deleted
        this.deleted = true;
        this.stateMachine.transition(TILE_STATE.DISPOSED);

        // Invalidate from tile loader
        if (this.contentURL) {
            this.tileLoader.invalidate(this.contentURL, this.uuid);
        }

        // Abort any pending requests
        if (this.abortController) {
            this.abortController.abort();
        }

        // Dispose components
        this.errorManager.dispose();
        this.stateMachine.dispose();

        // Call parent dispose
        super.dispose();
    }
}