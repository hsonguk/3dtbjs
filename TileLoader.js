function setIntervalAsync(fn, delay) {
    let timeout;

    const run = async () => {
        const startTime = Date.now();
        // try {
            await fn();
        // } catch (err) {
            // console.error(err);
        // } finally {
            const endTime = Date.now();
            const elapsedTime = endTime - startTime;
            const nextDelay = elapsedTime >= delay ? 0 : delay - elapsedTime;
            timeout = setTimeout(run, nextDelay);
        // }
    };

    timeout = setTimeout(run, delay);

    return { clearInterval: () => clearTimeout(timeout) };
}

async function checkLoaderInitialized(loader) {
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (loader.dracoLoader && loader.ktx2Loader) {
          clearInterval(interval);
          resolve();
        }
      }, 10); // check every 100ms
    });
  };

function simplifyPath(main_path) {

    var parts = main_path.split('/'),
        new_path = [],
        length = 0;
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (part === '.' || part === '' || part === '..') {
            if (part === '..' && length > 0) {
                length--;
            }
            continue;
        }
        new_path[length++] = part;
    }

    if (length === 0) {
        return '/';
    }

    var result = '';
    for (var i = 0; i < length; i++) {
        result += '/' + new_path[i];
    }

    return result;
}

class LinkedHashMap {
    // Public properties that were on the prototype
    firstNode = null;
    lastNode = null;
    length = 0;

    // Internal storage for nodes.
    // We'll make this a regular property, accessible within the class.
    // For true privacy, you'd use #nodes (see alternative below).
    _nodes = {}; // Changed from a scoped variable within the constructor

    constructor(values) {
        if (values) {
            this.putAll(values);
        }
        // No need to return 'this' explicitly from a constructor
    }

    /**
     * @private
     * Create new instance of node given a value.
     */
    _createNode(key, value) {
        return {
            key: key,
            value: value,
            prev: null,
            next: null
        };
    }

    /**
     * Iterator function similar to native array's "forEach" API.
     */
    each(fn, scope) {
        if (typeof(fn) !== "function") {
            return false;
        }

        const fnScope = (scope || globalThis); // Use globalThis for better environment compatibility
        let index = 0;
        let node = this.firstNode;

        while (node) {
            if (node.value !== undefined && node.value !== null) {
                const result = fn.call(fnScope, node.value, node.key, index);
                if (result === true) {
                    return true;
                }
            }
            node = node.next;
            index++;
        }
        return false;
    }

    put(key, value) {
        if (!key) {
            return undefined; // Return undefined for consistency
        }

        const oldValue = this.remove(key);
        const node = this._createNode(key, value);

        this._nodes[key] = node; // Use the instance property

        if (!this.firstNode) {
            this.firstNode = node;
        } else {
            this.lastNode.next = node;
            node.prev = this.lastNode;
        }

        this.lastNode = node;
        this.length++;

        return oldValue;
    }

    putAll(values, valueKey) {
        const status = {
            success: true,
            failures: []
        };

        if (!values || !valueKey) {
            status.success = false;
            return status;
        }

        for (let i = 0, l = values.length; i < l; i++) {
            const value = values[i];
            const key = value[valueKey];

            if (!key) {
                status.failures.push(value);
                continue;
            }
            this.put(key, value);
        }
        return status;
    }

    get(key) {
        const node = this._nodes[key]; // Use the instance property
        return node ? node.value : null;
    }

    getAt(index) {
        const node = this._getNodeAt(index);
        return node ? node.value : null;
    }

    head() {
        return this.firstNode;
    }

    /**
     * @private
     * Returns node at specified index.
     */
    _getNodeAt(index) {
        if (isNaN(index) || index < 0 || index >= this.length) {
            return null;
        }

        let runningIndex = 0;
        let runningNode = this.firstNode;

        while (runningNode) {
            if (runningIndex === index) {
                return runningNode;
            }
            runningNode = runningNode.next;
            runningIndex++;
        }
        return null; // Should ideally not be reached if length is correct
    }

    getAll() {
        const values = [];
        this.each(function(value) {
            values.push(value);
        });
        return values;
    }

    getAllKeys() {
        const keys = [];
        this.each(function(value, key) {
            keys.push(key);
        });
        return keys;
    }

    remove(key) {
        const existingNode = this._nodes[key]; // Use the instance property

        if (!existingNode) {
            return null;
        }

        if (existingNode.prev) {
            existingNode.prev.next = existingNode.next;
        }
        else {
            this.firstNode = existingNode.next;
        }

        if (existingNode.next) {
            existingNode.next.prev = existingNode.prev;
        }
        else {
            this.lastNode = existingNode.prev;
        }
        
        // Make sure to nullify links from the removed node as well (good practice)
        // existingNode.prev = null; 
        // existingNode.next = null;

        delete this._nodes[key]; // Use delete for object properties
        this.length--;

        // Edge case: if map becomes empty
        if (this.length === 0) {
            this.firstNode = null;
            this.lastNode = null;
        }

        return existingNode.value;
    }

    removeAt(index) {
        const node = this._getNodeAt(index);
        if (node) {
            return this.remove(node.key);
        }
        return null;
    }

    removeAll() {
        this.firstNode = null;
        this.lastNode = null;
        this.length = 0;
        this._nodes = {}; // Reset the instance property
    }

    isEmpty() {
        return this.length === 0;
    }

    size() {
        return this.length;
    }

    hasValue(key) {
        const value = this.get(key);
        return value !== undefined && value !== null;
    }

    toString(beautify) {
        const display = {};
        this.each(function(value, key) {
            display[key] = value;
        });

        let space = null;
        if (typeof(beautify) === "boolean" && beautify === true) {
            space = "\t";
        }
        else if (!isNaN(beautify) || typeof(beautify) === "string") {
            space = beautify;
        }
        return JSON.stringify(display, null, space);
    }
}

/**
 * A Tile loader that manages caching and load order.
 * The cache is an LRU cache and is defined by the number of items it can hold.
 * The actual number of cached items might grow beyond max if all items are in use.
 * 
 * The load order is designed for optimal perceived loading speed (nearby tiles are refined first).
 *
 * @param {Object} [options] - Optional configuration object.
 * @param {number} [options.maxCachedItems=100] - the cache size.
 * @param {function} [options.meshCallback] - A callback to call on newly decoded meshes.
 * @param {function} [options.pointsCallback] - A callback to call on newly decoded points.
 * @param {renderer} [options.renderer] - The renderer, this is required for KTX2 support.
 * @param {object} [options.scene] - The scene to load the tiles into.
 * @param {string} [options.proxy] - An optional proxy that tile requests will be directed too as POST requests with the actual tile url in the body of the request.
 */
export class TileLoader {


    constructor(options) {
        this.maxCachedItems = 100;
        this.proxy = options.proxy;
        if (!!options) {
            this.meshCallback = options.meshCallback;
            this.pointsCallback = options.pointsCallback;
            if (options.maxCachedItems) this.maxCachedItems = options.maxCachedItems;
        
            if (!!options && !!options.scene) {
                this.scene = options.scene;            
            }
        }

        // this.gltfLoader = new GLTFLoader();
        // const dracoLoader = new DRACOLoader();
        // dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.4.3/');
        // this.gltfLoader.setDRACOLoader(dracoLoader);

        // if (!!options && !!options.renderer) {
        //     const ktx2Loader = new KTX2Loader();
        //     ktx2Loader.setTranscoderPath('https://storage.googleapis.com/ogc-3d-tiles/basis/').detectSupport(options.renderer);
        //     this.gltfLoader.setKTX2Loader(ktx2Loader);

        //     this.b3dmDecoder = new B3DMDecoder(options.renderer);
        // } else {
        //     this.b3dmDecoder = new B3DMDecoder(null);
        // }

        this.cache = new LinkedHashMap();
        this.register = {};


        this.ready = [];
        this.downloads = [];
        this.nextReady = [];
        this.nextDownloads = [];
        this.init();
    }


    init() {

        const self = this;
        setIntervalAsync(() => {
            self.download();
        }, 10);
        setIntervalAsync(() => {
            const start = Date.now();
            let loaded = 0;
            do {
                loaded = self.loadBatch();
            } while (loaded > 0 && (Date.now() - start) <= 0)

        }, 10);
    }

    scheduleDownload(f) {
        this.downloads.unshift(f);
    }
    
    download() {

        if (this.nextDownloads.length == 0) {
            this.getNextDownloads();
            if (this.nextDownloads.length == 0) return;
        }
        while (this.nextDownloads.length > 0) {
            const nextDownload = this.nextDownloads.shift();
            if (!!nextDownload && nextDownload.shouldDoDownload()) {
                nextDownload.doDownload();
            }
        }
        return;
    }
    meshReceived(cache, register, key, distanceFunction, getSiblings, level, uuid) {
        this.ready.unshift([cache, register, key, distanceFunction, getSiblings, level, uuid]);
    }
    loadBatch() {
        if (this.nextReady.length == 0) {
            this.getNextReady();
            if (this.nextReady.length == 0) return 0;
        }
        const data = this.nextReady.shift();
        if (!data) return 0;
        const cache = data[0];
        const register = data[1];
        const key = data[2];
        const mesh = cache.get(key);

        if (!!mesh && !!register[key]) {
            Object.keys(register[key]).forEach(tile => {
                const callback = register[key][tile];
                if (!!callback) {
                    callback(mesh);
                    register[key][tile] = null;
                }
            });
        }
        return 1;
    }

    getNextDownloads() {
        let smallestDistance = Number.MAX_VALUE;
        let closest = -1;
        for (let i = this.downloads.length - 1; i >= 0; i--) {
            if (!this.downloads[i].shouldDoDownload()) {
                this.downloads.splice(i, 1);
                continue;
            }
            if (!this.downloads[i].distanceFunction) { // if no distance function, must be a json, give absolute priority!
                this.nextDownloads.push(this.downloads.splice(i, 1)[0]);
            }
        }
        if (this.nextDownloads.length > 0) return;
        for (let i = this.downloads.length - 1; i >= 0; i--) {
            const dist = this.downloads[i].distanceFunction() * this.downloads[i].level;
            if (dist < smallestDistance) {
                smallestDistance = dist;
                closest = i;
            }
        }
        if (closest >= 0) {
            const closestItem = this.downloads.splice(closest, 1).pop();
            this.nextDownloads.push(closestItem);

            const siblings = closestItem.getSiblings();
        
            if(!!siblings && siblings.length > 0){
                for (let i = this.downloads.length - 1; i >= 0; i--) {
                    if (siblings.find((tile)=>tile.uuid == this.downloads[i].uuid)) {
                        this.nextDownloads.push(this.downloads.splice(i, 1).pop());                       
                    }
                }
            }
        }
    }

    getNextReady() {
        let smallestDistance = Number.MAX_VALUE;
        let closest = -1;
        for (let i = this.ready.length - 1; i >= 0; i--) {

            if (!this.ready[i][3]) {// if no distance function, must be a json, give absolute priority!
                this.nextReady.push(this.ready.splice(i, 1)[0]);
            }
        }
        if (this.nextReady.length > 0) return;
        for (let i = this.ready.length - 1; i >= 0; i--) {
            const dist = this.ready[i][3]() * this.ready[i][5];
            if (dist < smallestDistance) {
                smallestDistance = dist;
                closest = i
            }
        }
        if (closest >= 0) {
            const closestItem = this.ready.splice(closest, 1).pop();
            this.nextReady.push(closestItem);
            const siblings = closestItem[4]();
            for (let i = this.ready.length - 1; i >= 0; i--) {
                if (siblings.includes(this.ready[i][6])) {
                    this.nextReady.push(this.ready.splice(i, 1).pop());
                }
            }
        }
    }

    get(abortController, tileIdentifier, path, callback, distanceFunction, getSiblings, level, sceneZupToYup, meshZupToYup, geometricError) {
        const self = this;
        const key = simplifyPath(path);

        const realAbortController = new AbortController();
        abortController.signal.addEventListener("abort", () => {
            if (!self.register[key] || Object.keys(self.register[key]).length == 0) {
                realAbortController.abort();
            }
        })

        if (!path.includes(".b3dm") && !path.includes(".json") && !path.includes(".gltf") && !path.includes(".glb")) {
            console.error("the 3DTiles cache can only be used to load B3DM, gltf and json data");
            return;
        }
        if (!self.register[key]) {
            self.register[key] = {};
        }
        if (!!self.register[key][tileIdentifier]) {
            console.error(" a tile should only be loaded once");
        }
        self.register[key][tileIdentifier] = callback;

        const cachedObject = self.cache.get(key);
        if (!!cachedObject) {
            console.log("using cache");
            this.meshReceived(self.cache, self.register, key, distanceFunction, getSiblings, level, tileIdentifier);
        } else if (Object.keys(self.register[key]).length == 1) {
            let downloadFunction;
            if (path.includes(".b3dm")) {
                downloadFunction = () => {
                    var fetchFunction;
                    if (!self.proxy) {
                        fetchFunction = () => {
                            return fetch(path, { signal: realAbortController.signal });
                        }
                    } else {
                        fetchFunction = () => {
                            return fetch(self.proxy,
                                {
                                    method: 'POST',
                                    body: path,
                                    signal: realAbortController.signal
                                }
                            );
                        }
                    }
                    fetchFunction().then(result => {
                        if (!result.ok) {
                            console.error("could not load tile with path : " + path)
                            throw new Error(`couldn't load "${path}". Request failed with status ${result.status} : ${result.statusText}`);
                        }
                        return result.arrayBuffer();

                    }).then(resultArrayBuffer => {
                        return this.b3dmDecoder.parseB3DM(resultArrayBuffer, self.meshCallback, sceneZupToYup, meshZupToYup);
                    }).then(mesh => {
                        self.cache.put(key, mesh);
                        self.checkSize();
                        this.meshReceived(self.cache, self.register, key, distanceFunction, getSiblings, level, tileIdentifier);
                    }).catch((e) => {
                        console.error(e)
                    });
                }
            } else if (path.includes(".glb") || path.includes(".gltf")) {
                downloadFunction = () => {
                    var fetchFunction;
                    if (!self.proxy) {
                        fetchFunction = () => {
                            return fetch(path, { signal: realAbortController.signal });
                        }
                    } else {
                        fetchFunction = () => {
                            return fetch(self.proxy,
                                {
                                    method: 'POST',
                                    body: path,
                                    signal: realAbortController.signal
                                }
                            );
                        }
                    }
                    fetchFunction().then(result => {
                        if (!result.ok) {
                            console.error("could not load tile with path : " + path)
                            throw new Error(`couldn't load "${path}". Request failed with status ${result.status} : ${result.statusText}`);
                        }
                        return result.arrayBuffer();
                    }).then(async arrayBuffer => {
                        // await checkLoaderInitialized(this.gltfLoader);
                        // this.gltfLoader.parse(arrayBuffer, null, gltf => {
                        //     gltf.scene.asset = gltf.asset;
                        //     if (sceneZupToYup) {
                        //         gltf.scene.applyMatrix4(zUpToYUpMatrix);
                        //     }
                        //     gltf.scene.traverse((o) => {
                                
                        //         if (o.isMesh) {
                        //             if (meshZupToYup) {
                        //                 o.applyMatrix4(zUpToYUpMatrix);
                        //             }
                        //             if (!!self.meshCallback) {
                        //                 self.meshCallback(o);
                        //             }
                        //         }
                        //         if (o.isPoints) {
                                    
                        //             if (!!self.pointsCallback) {
                        //                 self.pointsCallback(o);
                        //             }
                        //         }
                        //     });
                        const assetBlob = new Blob([arrayBuffer]);
                        const assetUrl = URL.createObjectURL(assetBlob);
                        BABYLON.LoadAssetContainerAsync(assetUrl, self.scene, {pluginExtension: ".glb"}).then(container =>{
                            self.cache.put(key, container);
                            self.checkSize();
                            self.meshReceived(self.cache, self.register, key, distanceFunction, getSiblings, level, tileIdentifier);   
                            console.log("downloaded:"+level);      
                        });                  
                                         
                    }).catch((e) => {
                        console.error(e)
                    });
                }
            } else if (path.includes(".json")) {
                downloadFunction = () => {
                    var fetchFunction;
                    if (!self.proxy) {
                        fetchFunction = () => {
                            return fetch(path, { signal: realAbortController.signal });
                        }
                    } else {
                        fetchFunction = () => {
                            return fetch(self.proxy,
                                {
                                    method: 'POST',
                                    body: path,
                                    signal: realAbortController.signal
                                }
                            );
                        }
                    }
                    fetchFunction().then(result => {
                        if (!result.ok) {
                            console.error("could not load tile with path : " + path)
                            throw new Error(`couldn't load "${path}". Request failed with status ${result.status} : ${result.statusText}`);
                        }
                        return result.json();

                    }).then(json => {
                        self.cache.put(key, json);
                        self.checkSize();
                        self.meshReceived(self.cache, self.register, key);
                    }).catch((e) => {
                        console.error(e)
                    });
                }
            }
            this.scheduleDownload({
                "shouldDoDownload": () => {
                    return !abortController.signal.aborted && !!self.register[key] && Object.keys(self.register[key]).length > 0;
                },
                "doDownload": downloadFunction,
                "distanceFunction": distanceFunction,
                "getSiblings": getSiblings,
                "level": level,
                "uuid": tileIdentifier
            })
        }
    }

    invalidate(path, tileIdentifier) {
        const key = simplifyPath(path);
        if (!!this.register[key]) {
            delete this.register[key][tileIdentifier];
        }
    }

    checkSize() {
        const self = this;

        let i = 0;

        const cacheSize = self.cache.size();
        const sizeToRemove = cacheSize - self.maxCachedItems;
        var entryToRemove = [];
        if(sizeToRemove > 0){
            self.cache.each(function(entry) {
				const reg = self.register[entry.key];
                if (!!reg) {
                    if (sizeToRemove > 0 && Object.keys(reg).length == 0) {
                        entryToRemove.push(entry);
                        sizeToRemove--;
                    }
                }
		    });

            entryToRemove.forEach((entry) => {
                self.cache.remove(entry.key);
                delete self.register[entry.key];
                entry.value.dispose();
            });
        }

        // while (self.cache.size() > self.maxCachedItems && i < self.cache.size()) {
        //     i++;
        //     const entry = self.cache.head();
        //     const reg = self.register[entry.key];
        //     if (!!reg) {
        //         if (Object.keys(reg).length > 0) {
        //             self.cache.remove(entry.key);
        //             self.cache.put(entry.key, entry.value);
        //         } else {
        //             self.cache.remove(entry.key);
        //             delete self.register[entry.key];
        //             entry.value.dispose();
        //             // entry.value.traverse((o) => {

        //             //     if (o.material) {
        //             //         // dispose materials
        //             //         if (o.material.length) {
        //             //             for (let i = 0; i < o.material.length; ++i) {
        //             //                 o.material[i].dispose();
        //             //             }
        //             //         }
        //             //         else {
        //             //             o.material.dispose()
        //             //         }
        //             //     }
        //             //     if (o.geometry) {
        //             //         // dispose geometry
        //             //         o.geometry.dispose();

        //             //     }
        //             // });
        //         }
        //     }

        // }
    }
}