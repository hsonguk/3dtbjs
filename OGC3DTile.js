import { TileLoader } from './TileLoader.js';
import { OGC3DTileRefactored } from './src/tile/ogc-3d-tile-refactored.js';
import { globalCopyrightManager } from './src/managers/copyright-manager.js';
import { showError } from './src/managers/error-manager.js';
import { assembleURL, extractQueryParams } from './src/utils/url-utils.js';
import { transformWGS84ToCartesian } from './src/geometry/coordinate-transform.js';

// Global copyright management - maintained for backward compatibility
let copyrightDiv;
const copyright = {};

// Utility function for backward compatibility
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Utility function for backward compatibility
function dirname(path) {
    const lastSlashIndex = path.lastIndexOf('/');
    return lastSlashIndex > 0 ? path.substring(0, lastSlashIndex) : path;
}

// Copyright update function for backward compatibility
function updateCopyrightLabel() {
    globalCopyrightManager.updateDisplay();
}

export class OGC3DTile extends BABYLON.TransformNode {
    static #tempSphere = new BABYLON.BoundingSphere(new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(0, 1, 0));
    static #tempVec1 = new BABYLON.Vector3(0, 0, 0);
    static #tempVec2 = new BABYLON.Vector3(0, 0, 0);
    static #upVector = new BABYLON.Vector3(0, 1, 0);
    static #rendererSize = new BABYLON.Vector2(1000, 1000);
    static #tempQuaternion = new BABYLON.Quaternion();

    /**
     * @param {Object} [properties] - the properties for this tileset
     * @param {Object} [properties.renderer] - the renderer used to display the tileset
     * @param {Object} [properties.url] - the url to the parent tileset.json
     * @param {Object} [properties.queryParams] - optional, path params to add to individual tile urls (starts with "?").
     * @param {Object} [properties.geometricErrorMultiplier] - the geometric error of the parent. 1.0 by default corresponds to a maxScreenSpaceError of 16
     * @param {Object} [properties.loadOutsideView] - if truthy, tiles otside the camera frustum will be loaded with the least possible amount of detail
     * @param {Object} [properties.tileLoader] - A tile loader that can be shared among tilesets in order to share a common cache.
     * @param {Object} [properties.meshCallback] - A callback function that will be called on every mesh
     * @param {Object} [properties.pointsCallback] - A callback function that will be called on every points
     * @param {Object} [properties.onLoadCallback] - A callback function that will be called when the root tile has been loaded
     * @param {Object} [properties.occlusionCullingService] - A service that handles occlusion culling
     * @param {Object} [properties.centerModel] - If true, the tileset will be centered on 0,0,0 and in the case of georeferenced tilesets that use the "region" bounding volume, it will also be rotated so that the up axis matched the world y axis.
     * @param {Object} [properties.static] - If true, the tileset is considered static which improves performance but the tileset cannot be moved
     * @param {Object} [properties.rootPath] - optional the root path for fetching children
     * @param {Object} [properties.json] - optional json object representing the tileset sub-tree
     * @param {Object} [properties.parentGeometricError] - optional geometric error of the parent
     * @param {Object} [properties.parentBoundingVolume] - optional bounding volume of the parent
     * @param {Object} [properties.parentRefine] - optional refine strategy of the parent of the parent
     * @param {Object} [properties.cameraOnLoad] - optional the camera used when loading this particular sub-tile
     * @param {Object} [properties.parentTile] - optional the OGC3DTile object that loaded this tile as a child
     * @param {Object} [properties.proxy] - optional the url to a proxy service. Instead of fetching tiles via a GET request, a POST will be sent to the proxy url with the real tile address in the body of the request.
     * @param {Object} [properties.yUp] - optional value indicating the meshes are y up rather than z-up. This parameter is used only for box and sphere bounding volumes.
     * @param {Object} [properties.displayErrors] - optional value indicating that errors should be shown on screen.
     */
    constructor(properties) {
        super();
        const self = this;

        this.proxy = properties.proxy;
        this.yUp = properties.yUp;
        this.displayErrors = properties.displayErrors;
        this.displayCopyright = properties.displayCopyright;
        if (properties.queryParams) {
            this.queryParams = { ...properties.queryParams };
        }
        this.uuid = uuidv4();
        if (properties.tileLoader) {
            this.tileLoader = properties.tileLoader;
        } else {
            const tileLoaderOptions = {};
            tileLoaderOptions.meshCallback = properties.meshCallback || ((mesh) => {
                // Default mesh processing - placeholder for future implementation
                console.debug('Processing mesh:', mesh);
            });
            tileLoaderOptions.pointsCallback = properties.pointsCallback || ((points) => {
                // Default points processing - placeholder for future implementation
                console.debug('Processing points:', points);
            });
            tileLoaderOptions.proxy = this.proxy;
            tileLoaderOptions.scene = properties.scene;
            this.tileLoader = new TileLoader(tileLoaderOptions);
        }
        this.displayCopyright = properties.displayCopyright;
        // set properties general to the entire tileset
        this.geometricErrorMultiplier = properties.geometricErrorMultiplier ? properties.geometricErrorMultiplier : 1.0;

        this.scene = properties.scene;
        this.renderer = properties.renderer;
        this.rootNode = properties.rootNode;
        this.meshCallback = properties.meshCallback;
        this.loadOutsideView = properties.loadOutsideView;
        this.cameraOnLoad = properties.cameraOnLoad;
        this.parentTile = properties.parentTile;
        this.parent = properties.parentTile;
        this.occlusionCullingService = properties.occlusionCullingService;
        this.static = properties.static;
        // if (this.occlusionCullingService) {
        //     this.color = new THREE.Color();
        //     this.color.setHex(Math.random() * 0xffffff);
        //     this.colorID = clamp(self.color.r * 255, 0, 255) << 16 ^ clamp(self.color.g * 255, 0, 255) << 8 ^ clamp(self.color.b * 255, 0, 255) << 0;
        // }
        if (this.static) {
            this.matrixAutoUpdate = false;
        }

        // declare properties specific to the tile for clarity
        this.childrenTiles = [];
        this.meshContent;
        this.tileContent;
        this.refine; // defaults to "REPLACE"
        this.rootPath;
        this.geometricError;
        this.boundingVolume;
        // Custom inspector properties.
        this.inspectableCustomProperties = [
            {
                label: 'My BoundingVolume',
                propertyName: 'boundingVolume',
                type: BABYLON.InspectableType.String,
            },
            {
                label: 'My Metric',
                propertyName: 'metric',
                type: BABYLON.InspectableType.String,
            },
            {
                label: 'My geometricError',
                propertyName: 'geometricError',
                type: BABYLON.InspectableType.String,
            },
            {
                label: 'My key',
                propertyName: 'contentURL',
                type: BABYLON.InspectableType.String,
            },
        ];

        this.json; // the json corresponding to this tile
        this.materialVisibility = false;
        this.inFrustum = true;
        this.level = properties.level ? properties.level : 0;
        this.hasMeshContent = false; // true when the provided json has a content field pointing to a B3DM file
        this.hasUnloadedJSONContent = false; // true when the provided json has a content field pointing to a JSON file that is not yet loaded
        this.centerModel = properties.centerModel;
        this.abortController = new AbortController();
        this.name = 'Level' + this.level;

        if (properties.json) {
            // If this tile is created as a child of another tile, properties.json is not null
            self.setup(properties);
            if (properties.onLoadCallback) properties.onLoadCallback(self);
        } else if (properties.url) {
            // If only the url to the tileset.json is provided
            console.log('url:' + properties.url);
            let url = properties.url;
            if (self.queryParams) {
                let props = '';
                for (let key in self.queryParams) {
                    if (Object.prototype.hasOwnProperty.call(self.queryParams, key)) {
                        props += '&' + key + '=' + self.queryParams[key];
                    }
                }
                if (url.includes('?')) {
                    url += props;
                } else {
                    url += '?' + props.substring(1);
                }
            }
            console.log('url:' + properties.url);
            let fetchFunction;
            if (self.proxy) {
                fetchFunction = () => {
                    return fetch(self.proxy, {
                        method: 'POST',
                        body: url,
                        signal: self.abortController.signal,
                    });
                };
            } else {
                fetchFunction = () => {
                    console.log('url:' + url);

                    return fetch(url, { signal: self.abortController.signal });
                };
            }
            fetchFunction()
                .then((result) => {
                    if (!result.ok) {
                        throw new Error(
                            `couldn't load "${properties.url}". Request failed with status ${result.status} : ${result.statusText}`
                        );
                    }
                    result.json().then((json) => {
                        self.setup({ rootPath: dirname(properties.url), json: json });
                        if (properties.onLoadCallback) properties.onLoadCallback(self);
                        if (self.centerModel) {
                            const tempSphere = BABYLON.BoundingSphere.CreateFromCenterAndRadius(
                                new BABYLON.Vector3(0, 0, 0),
                                1
                            );
                            // if (self.boundingVolume instanceof BBO.BBO) {
                            //     // box
                            //     tempSphere.copy(self.boundingVolume.sphere);
                            // } else
                            if (self.boundingVolume instanceof BABYLON.BoundingSphere) {
                                //sphere
                                tempSphere.copy(self.boundingVolume);
                            }

                            //tempSphere.applyMatrix4(self.matrixWorld);
                            if (this.json.boundingVolume.region) {
                                this.transformWGS84ToCartesian(
                                    (this.json.boundingVolume.region[0] + this.json.boundingVolume.region[2]) * 0.5,
                                    (this.json.boundingVolume.region[1] + this.json.boundingVolume.region[3]) * 0.5,
                                    (this.json.boundingVolume.region[4] + this.json.boundingVolume.region[5]) * 0.5,
                                    OGC3DTile.#tempVec1
                                );

                                OGC3DTile.#tempQuaternion.setFromUnitVectors(
                                    OGC3DTile.#tempVec1.normalize(),
                                    OGC3DTile.#upVector.normalize()
                                );
                                self.applyQuaternion(OGC3DTile.#tempQuaternion);
                            }

                            self.translateX(-tempSphere.center.x * self.scale.x);
                            self.translateY(-tempSphere.center.y * self.scale.y);
                            self.translateZ(-tempSphere.center.z * self.scale.z);
                        }
                    });
                })
                .catch((e) => {
                    if (self.displayErrors) showError(e);
                });
        }
    }

    setup(properties) {
        // console.log("rootPath:"+properties.json.rootPath)
        // console.log("refine:"+properties.json.root.refine)
        // console.log("geometricError:"+properties.json.root.geometricError)
        // console.log("transform:"+properties.json.root.transform)
        // console.log("boundingVolume:"+properties.json.root.boundingVolume.box)

        if (properties.json.root) {
            this.json = properties.json.root;
            if (!this.json.refine) this.json.refine = properties.json.refine;
            if (!this.json.geometricError) this.json.geometricError = properties.json.geometricError;
            if (!this.json.transform) this.json.transform = properties.json.transform;
            if (!this.json.boundingVolume) this.json.boundingVolume = properties.json.boundingVolume;
        } else {
            this.json = properties.json;
        }
        this.rootPath = properties.json.rootPath ? properties.json.rootPath : properties.rootPath;

        // decode refine
        if (this.json.refine) {
            this.refine = this.json.refine;
        } else {
            this.refine = properties.parentRefine;
        }
        // decode geometric error
        if (this.json.geometricError) {
            this.geometricError = this.json.geometricError;
        } else {
            this.geometricError = properties.parentGeometricError;
        }

        // decode transform
        if (this.json.transform && !this.centerModel) {
            console.log('transform:' + properties.json.transform);
            let mat = BABYLON.Matrix().FromArray(this.json.transform);
            this.setPreTransformMatrix(mat);
        }

        // decode volume
        const worldMatrix = this.computeWorldMatrix(true);
        // console.log("worldMatrix: "+worldMatrix)
        if (this.json.boundingVolume) {
            if (this.json.boundingVolume.box) {
                const values = this.json.boundingVolume.box;
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

                this.boundingVolume = BABYLON.BoundingSphere.CreateFromCenterAndRadius(center, radius);
            } else if (this.json.boundingVolume.region) {
                const region = this.json.boundingVolume.region;
                this.transformWGS84ToCartesian(region[0], region[1], region[4], OGC3DTile.#tempVec1);
                this.transformWGS84ToCartesian(region[2], region[3], region[5], OGC3DTile.#tempVec2);
                OGC3DTile.#tempVec1 = BABYLON.Vector3.Lerp(OGC3DTile.#tempVec1, OGC3DTile.#tempVec2, 0.5);
                this.boundingVolume = BABYLON.BoundingSphere.CreateFromCenterAndRadius(
                    OGC3DTile.#tempVec1,
                    BABYLON.Vector3.Distance(OGC3DTile.#tempVec1, OGC3DTile.#tempVec2)
                );
            } else if (this.json.boundingVolume.sphere) {
                const sphere = this.json.boundingVolume.sphere;
                this.boundingVolume = BABYLON.BoundingSphere.CreateFromCenterAndRadius(
                    new BABYLON.Vector3(sphere[0], sphere[1], sphere[2]),
                    sphere[3]
                );
            } else {
                this.boundingVolume = properties.parentBoundingVolume;
            }
        } else {
            this.boundingVolume = properties.parentBoundingVolume;
        }

        // console.log("content:"+this.json.content)
        if (this.json.content) {
            //if there is a content, json or otherwise, schedule it to be loaded
            if (this.json.content.uri && this.json.content.uri.includes('json')) {
                this.hasUnloadedJSONContent = true;
            } else if (this.json.content.url && this.json.content.url.includes('json')) {
                this.hasUnloadedJSONContent = true;
            } else {
                this.hasMeshContent = true;
            }
            this.load();
        }
    }

    assembleURL(root, relative) {
        // Append a slash to the root URL if it doesn't already have one
        if (!root.endsWith('/')) {
            root += '/';
        }

        const rootUrl = new URL(root);
        let rootParts = rootUrl.pathname.split('/').filter((p) => p !== '');
        let relativeParts = relative.split('/').filter((p) => p !== '');

        for (let i = 1; i <= rootParts.length; i++) {
            if (i >= relativeParts.length) break;
            const rootToken = rootParts.slice(rootParts.length - i, rootParts.length).join('/');
            const relativeToken = relativeParts.slice(0, i).join('/');
            if (rootToken === relativeToken) {
                for (let j = 0; j < i; j++) {
                    rootParts.pop();
                }
                break;
            }
        }

        while (relativeParts.length > 0 && relativeParts[0] === '..') {
            rootParts.pop();
            relativeParts.shift();
        }

        return `${rootUrl.protocol}//${rootUrl.host}/${[...rootParts, ...relativeParts].join('/')}`;
    }

    extractQueryParams(url, params) {
        const urlObj = new URL(url);

        // Iterate over all the search parameters
        for (let [key, value] of urlObj.searchParams) {
            params[key] = value;
        }

        // Remove the query string
        urlObj.search = '';
        return urlObj.toString();
    }

    load() {
        const self = this;
        if (self.deleted) return;
        if (self.json.content) {
            let url;
            if (self.json.content.uri) {
                url = self.json.content.uri;
            } else if (self.json.content.url) {
                url = self.json.content.url;
            }
            const urlRegex = /^(?:http|https|ftp|tcp|udp):\/\/\S+/;

            if (urlRegex.test(self.rootPath)) {
                // url

                if (!urlRegex.test(url)) {
                    url = self.assembleURL(self.rootPath, url);
                }
            }
            url = self.extractQueryParams(url, self.queryParams);
            if (self.queryParams) {
                let props = '';
                for (let key in self.queryParams) {
                    if (Object.prototype.hasOwnProperty.call(self.queryParams, key)) {
                        // This check is necessary to skip properties from the object's prototype chain
                        props += '&' + key + '=' + self.queryParams[key];
                    }
                }
                if (url.includes('?')) {
                    url += props;
                } else {
                    url += '?' + props.substring(1);
                }
            }

            if (url) {
                if (url.includes('.b3dm') || url.includes('.glb') || url.includes('.gltf')) {
                    self.contentURL = url;
                    // console.log("loading:"+url)
                    try {
                        self.tileLoader.get(
                            self.abortController,
                            this.uuid,
                            url,
                            (mesh) => {
                                if (self.deleted) return;

                                if (mesh.asset && mesh.asset.copyright) {
                                    mesh.asset.copyright.split(';').forEach((s) => {
                                        if (copyright[s]) {
                                            copyright[s]++;
                                        } else {
                                            copyright[s] = 1;
                                        }
                                    });
                                    if (self.displayCopyright) {
                                        updateCopyrightLabel();
                                    }
                                }

                                if (mesh) {
                                    mesh.meshes.forEach((m) => {
                                        m.alwaysSelectAsActiveMesh = true;
                                    });
                                    mesh.materials.forEach((m) => {
                                        m.freeze();
                                    });

                                    // self.add(mesh);
                                    // self.updateWorldMatrix(false, true);
                                    // mesh.layers.disable(0);
                                    // const tileroot = mesh.meshes[1];
                                    // tileroot.parent = null;
                                    // mesh.meshes[0].dispose();

                                    // tileroot.setEnabled(false);
                                    // mesh.addAllToScene();
                                    // tileroot.setParent(self);
                                    // mesh.rootNodes[0].setEnabled(false);
                                    // mesh.addAllToScene();
                                    // mesh.rootNodes[0].parent = self;
                                    self.meshContent = mesh;
                                }
                            },
                            !self.cameraOnLoad
                                ? () => 0
                                : () => {
                                      return self.calculateDistanceToCamera(self.cameraOnLoad);
                                  },
                            () => {
                                // if current tile is 10 times farther than the camera radius, choose not the load the sliblings
                                if (self.calculateDistanceToCamera(self.cameraOnLoad) > 10 * self.cameraOnLoad.radius)
                                    return [];
                                return self.getSiblings();
                            },
                            self.level,
                            self.json.boundingVolume.region ? false : self.yUp === undefined || self.yUp,
                            self.json.boundingVolume.region,
                            self.geometricError
                        );
                    } catch (e) {
                        if (self.displayErrors) showError(e);
                    }
                } else if (url.includes('.json')) {
                    self.tileLoader.get(self.abortController, this.uuid, url, (json) => {
                        if (self.deleted) return;
                        if (!self.json.children) self.json.children = [];
                        json.rootPath = dirname(url);
                        self.json.children.push(json);
                        delete self.json.content;
                        self.hasUnloadedJSONContent = false;
                    });
                }
            }
        }
    }

    dispose() {
        if (this.meshContent && this.meshContent.asset && this.meshContent.asset.copyright) {
            this.meshContent.asset.copyright.split(';').forEach((s) => {
                if (copyright[s]) {
                    copyright[s]--;
                }
            });
            if (self.displayCopyright) {
                updateCopyrightLabel();
            }
        }

        this.changeContentVisibility(false);
        this.childrenTiles.forEach((tile) => tile.dispose());
        this.childrenTiles = [];
        this.deleted = true;

        if (this.contentURL) {
            this.tileLoader.invalidate(this.contentURL, this.uuid);
        }

        if (this.abortController) {
            // abort tile request
            this.abortController.abort();
        }

        // console.log("Level:"+this.level+"Name: "+this.name + "ID: "+this.uniqueIdSearch + "abortController: "+this.abortController)

        // const descendants = this.getDescendants(false);
        // console.log("Childern: "+descendants.length)
        // descendants.forEach((element) => {
        //     if (element.contentURL) {
        //         self.tileLoader.invalidate(element.contentURL, element.uuid);
        //     }
        //     if (element.abortController) { // abort tile request
        //         element.abortController.abort();
        //     }
        //     console.log("Level:"+this.level+"Name: "+element.name + "ID: "+this.uniqueIdSearch +"contentURL: "+element.contentURL+" uuid: "+element.uuid+" level: "+element.level+"abortController: "+element.abortController)
        // });
        // this.parent = null;
        // this.parentTile = null;
        super.dispose();
        // this.dispatchEvent({ type: 'removed' });
    }

    disposeChildren() {
        this.childrenTiles.forEach((tile) => tile.dispose());
        this.childrenTiles = [];
        // self.children = [];
        // if (self.meshContent) self.children.push(self.meshContent);
    }

    update(camera) {
        const self = this;
        const visibilityBeforeUpdate = self.materialVisibility;
        // console.log("boundingVolume: "+ self.boundingVolume)
        // console.log("geometricError: "+ self.geometricError)

        if (self.boundingVolume && self.geometricError) {
            self.metric = self.calculateUpdateMetric(camera);
        }
        self.childrenTiles.forEach((child) => child.update(camera));

        // console.log("metric: "+self.metric)
        updateNodeVisibility(self.metric);
        updateTree(self.metric);
        trimTree(self.metric, visibilityBeforeUpdate);

        function updateTree(metric) {
            // If this tile does not have mesh content but it has children
            if (metric < 0 && self.hasMeshContent) return;

            if (
                self.occlusionCullingService &&
                self.hasMeshContent &&
                !self.occlusionCullingService.hasID(self.colorID)
            ) {
                return;
            }

            if (
                !self.hasMeshContent ||
                (metric < self.geometricErrorMultiplier * self.geometricError && self.meshContent)
            ) {
                if (self.json && self.json.children) {
                    // && self.childrenTiles.length != childrenLength){//self.json.children.length) {
                    let childrenLength = 0;
                    self.json.children.forEach((childJSON) => {
                        if (childJSON.root || childJSON.children || childJSON.content) {
                            childrenLength++;
                        }
                    });

                    if (self.childrenTiles.length != childrenLength) {
                        loadJsonChildren();
                    }
                    return;
                }
            }
        }

        function updateNodeVisibility(metric) {
            //doesn't have a mesh content
            if (!self.hasMeshContent || !self.meshContent) return;

            if (metric < 0) {
                self.inFrustum = false;
                self.changeContentVisibility(self.loadOutsideView);
            } else {
                self.inFrustum = true;

                // has no children
                if (self.childrenTiles.length == 0) {
                    self.changeContentVisibility(true);
                } else if (metric >= self.geometricErrorMultiplier * self.geometricError) {
                    // Ideal LOD or before ideal lod
                    self.changeContentVisibility(true);
                } else {
                    // Ideal LOD is past this one
                    // if children are visible and have been displayed, can be hidden
                    if (self.refine == 'REPLACE' && self.childrenTiles.every((child) => child.isReady())) {
                        self.changeContentVisibility(false);
                    }
                }
            }
        }

        function trimTree(metric, visibilityBeforeUpdate) {
            if (!self.hasMeshContent) return;

            if (!self.inFrustum) {
                // outside frustum
                self.disposeChildren();
                // updateNodeVisibility(metric);
                return;
            }

            if (
                self.occlusionCullingService &&
                !visibilityBeforeUpdate &&
                self.hasMeshContent &&
                self.meshContent &&
                self.meshDisplayed &&
                self.areAllChildrenLoadedAndHidden()
            ) {
                self.disposeChildren();
                // updateNodeVisibility(metric);
                return;
            }

            if (metric >= self.geometricErrorMultiplier * self.geometricError) {
                self.disposeChildren();
                // updateNodeVisibility(metric);
                return;
            }
        }

        function loadJsonChildren() {
            self.json.children.forEach((childJSON) => {
                if (!childJSON.root && !childJSON.children && !childJSON.content) {
                    return;
                }

                let childTile = new OGC3DTile({
                    parentTile: self,
                    queryParams: self.queryParams,
                    parentGeometricError: self.geometricError,
                    parentBoundingVolume: self.boundingVolume,
                    parentRefine: self.refine,
                    json: childJSON,
                    rootPath: self.rootPath,
                    geometricErrorMultiplier: self.geometricErrorMultiplier,
                    loadOutsideView: self.loadOutsideView,
                    level: self.level + 1,
                    tileLoader: self.tileLoader,
                    cameraOnLoad: camera,
                    occlusionCullingService: self.occlusionCullingService,
                    scene: self.scene,
                    renderer: self.renderer,
                    rootNode: self.rootNode,
                    static: self.static,
                    centerModel: false,
                    yUp: self.yUp,
                    displayErrors: self.displayErrors,
                    displayCopyright: self.displayCopyright,
                });
                self.childrenTiles.push(childTile);
                // self.add(childTile);
            });
        }
    }

    areAllChildrenLoadedAndHidden() {
        let allLoadedAndHidden = true;
        const self = this;
        this.childrenTiles.every((child) => {
            if (child.hasMeshContent) {
                if (child.childrenTiles.length > 0) {
                    allLoadedAndHidden = false;
                    return false;
                }
                if (!child.inFrustum) {
                    return true;
                }
                if (!child.materialVisibility || child.meshDisplayed) {
                    allLoadedAndHidden = false;
                    return false;
                } else if (self.occlusionCullingService.hasID(child.colorID)) {
                    allLoadedAndHidden = false;
                    return false;
                }
            } else {
                if (!child.areAllChildrenLoadedAndHidden()) {
                    allLoadedAndHidden = false;
                    return false;
                }
            }
            return true;
        });
        return allLoadedAndHidden;
    }

    /**
     * Node is ready if it is outside frustum, if it was drawn at least once or if all it's children are ready
     * @returns true if ready
     */
    isReady() {
        // if outside frustum
        if (!this.inFrustum) {
            return true;
        }
        // if json is not done loading
        if (this.hasUnloadedJSONContent) {
            return false;
        }
        // if this tile has no mesh content or if it's marked as visible false, look at children
        if (!this.hasMeshContent || !this.meshContent || !this.materialVisibility) {
            if (this.childrenTiles.length > 0) {
                return this.childrenTiles.every((child) => child.isReady());
                // let allChildrenReady = true;
                // this.childrenTiles.every(child => {
                //     if (!child.isReady()) {
                //         allChildrenReady = false;
                //         return false;
                //     }
                //     return true;
                // });
                // return allChildrenReady;
            } else {
                return false;
            }
        }

        // if this tile has no mesh content
        if (!this.hasMeshContent) {
            return true;
        }
        // if mesh content not yet loaded
        if (!this.meshContent) {
            return false;
        }

        // if this tile has been marked to hide it's content
        if (!this.materialVisibility) {
            return false;
        }

        // if all meshes have been displayed once
        if (this.meshDisplayed) {
            return true;
        }

        return false;
    }

    changeContentVisibility(visibility) {
        const self = this;

        if (self.hasMeshContent && self.meshContent) {
            if (visibility) {
                self.meshContent.addAllToScene();
                self.meshContent.rootNodes[0].parent = self;
            } else {
                self.meshContent.rootNodes[0].parent = null;
                self.meshContent.removeAllFromScene();
            }
        }

        if (self.materialVisibility == visibility) {
            return;
        }
        self.materialVisibility = visibility;
        self.meshDisplayed = true;
    }

    calculateUpdateMetric(camera) {
        // ////// return -1 if not in frustum
        // if (this.boundingVolume instanceof OBB.OBB) {
        //     // box
        //     // OGC3DTile.#tempSphere.copy(this.boundingVolume.sphere);
        //     // OGC3DTile.#tempSphere.applyMatrix(this.matrixWorld);
        //     // if (!camera.isInFrustum(OGC3DTile.#tempSphere, ture)) return -1;
        //     OGC3DTile.#tempSphere = this.boundingVolume.sphere;
        //     const inOriginalCameraFrustum = OGC3DTile.#tempSphere.isInFrustum(
        //         BABYLON.Frustum.GetPlanes(camera.getTransformationMatrix())
        //     );
        //     if (!inOriginalCameraFrustum) return -1;
        // } else
        if (this.boundingVolume instanceof BABYLON.BoundingSphere) {
            let tempSphere = this.boundingVolume;
            const inOriginalCameraFrustum = tempSphere.isInFrustum(
                BABYLON.Frustum.GetPlanes(camera.getTransformationMatrix())
            );
            if (!inOriginalCameraFrustum) return -1;
        } else {
            console.error('unsupported shape');
            return -1;
        }

        /////// return metric based on geometric error and distance
        const distance = Math.max(
            0,
            BABYLON.Vector3.Distance(camera.position, this.boundingVolume.center) - this.boundingVolume.radius
        );

        if (distance == 0) {
            return 0;
        }
        const scale = 1; //this.matrixWorld.getMaxScaleOnAxis();
        let aspect = 1;
        if (this.renderer) {
            // this.renderer.getDrawingBufferSize(OGC3DTile.#rendererSize);
            OGC3DTile.#rendererSize.x = this.renderer.getRenderWidth(true);
            OGC3DTile.#rendererSize.y = this.renderer.getRenderHeight(true);
            aspect = this.renderer.getScreenAspectRatio();
        }
        let s = OGC3DTile.#rendererSize.y;
        let fov = camera.fov;
        if (aspect < 1) {
            fov *= aspect;
            s = OGC3DTile.#rendererSize.x;
        }

        let lambda = 2.0 * Math.tan(0.5 * fov) * distance;

        return (window.devicePixelRatio * 16 * lambda) / (s * scale);
    }

    getSiblings() {
        const self = this;
        const tiles = [];
        if (!self.parentTile) return tiles;
        let p = self.parentTile;
        while (!p.hasMeshContent && p.parentTile) {
            p = p.parentTile;
        }
        p.childrenTiles.forEach((child) => {
            if (child && child != self) {
                while (!child.hasMeshContent && child.childrenTiles[0]) {
                    child = child.childrenTiles[0];
                }
                tiles.push(child);
            }
        });
        return tiles;
    }

    calculateDistanceToCamera(camera) {
        // if (this.boundingVolume instanceof OBB.OBB) {
        //     // // box
        //     // OGC3DTile.#tempSphere.copy(this.boundingVolume.sphere);
        //     // OGC3DTile.#tempSphere.applyMatrix(this.matrixWorld);
        //     // //if (!frustum.intersectsSphere(OGC3DTile.#tempSphere)) return -1;
        //     OGC3DTile.#tempSphere = this.boundingVolume.sphere;
        // } else
        if (this.boundingVolume instanceof BABYLON.BoundingSphere) {
            let tempSphere = this.boundingVolume;
        } else {
            console.error('unsupported shape');
        }

        return Math.max(
            0,
            BABYLON.Vector3.Distance(camera.position, this.boundingVolume.center) - this.boundingVolume.radius
        );
    }

    setGeometricErrorMultiplier(geometricErrorMultiplier) {
        this.geometricErrorMultiplier = geometricErrorMultiplier;
        this.childrenTiles.forEach((child) => child.setGeometricErrorMultiplier(geometricErrorMultiplier));
    }

    transformWGS84ToCartesian(lon, lat, h, sfct) {
        const a = 6378137.0;
        const e = 0.006694384442042;
        const N = a / Math.sqrt(1.0 - e * Math.pow(Math.sin(lat), 2));
        const cosLat = Math.cos(lat);
        const cosLon = Math.cos(lon);
        const sinLat = Math.sin(lat);
        const sinLon = Math.sin(lon);
        const nPh = N + h;
        const x = nPh * cosLat * cosLon;
        const y = nPh * cosLat * sinLon;
        const z = (0.993305615557957 * N + h) * sinLat;

        sfct.set(x, y, z);
    }
}

// showError function is now imported from error-manager.js

// updateCopyrightLabel function is now defined above for backward compatibility

// uuidv4 function is already defined above for backward compatibility

// dirname function is already defined above for backward compatibility
