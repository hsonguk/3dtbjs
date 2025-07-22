# 3DTiles for Babylon.js

A high-performance, modular 3D Tiles library for Babylon.js, supporting OGC 3D Tiles specification with Google 3D Tiles integration.

## 🚀 Features

- **High Performance**: Event-driven architecture with priority queues and optimized update loops
- **Modular Design**: Clean separation of concerns with 20+ focused modules
- **Google 3D Tiles Support**: Seamless integration with Google's 3D Tiles API
- **Level of Detail (LOD)**: Automatic tile refinement based on camera distance and screen space error
- **Caching System**: Intelligent LRU cache with configurable size limits
- **Error Handling**: Comprehensive error management with visual feedback
- **Copyright Management**: Automatic copyright attribution display
- **State Management**: Proper tile lifecycle management with state machines
- **TypeScript Ready**: Well-documented APIs with JSDoc annotations

## 📦 Installation

```bash
# Clone the repository
git clone <repository-url>
cd 3dtbjs

# Install dependencies
npm install

# Start the development server
npm start
```

## 🎮 Quick Start

### Basic Usage

```javascript
import { OGC3DTile } from './OGC3DTile.js';
import { TileLoader } from './TileLoader.js';

// Create a tile loader
const tileLoader = new TileLoader({
    renderer: engine,
    maxCachedItems: 10000,
    scene: scene,
    meshCallback: (mesh) => {
        console.log('Mesh loaded:', mesh);
    }
});

// Create and configure the 3D tileset
const ogc3DTile = new OGC3DTile({
    url: 'https://tile.googleapis.com/v1/3dtiles/root.json',
    queryParams: { key: 'YOUR_GOOGLE_API_KEY' },
    tileLoader: tileLoader,
    scene: scene,
    renderer: engine,
    rootNode: parentNode,
    displayErrors: true,
    displayCopyright: true,
    onLoadCallback: (tile) => {
        console.log('Tileset loaded:', tile);
    }
});

// Update tiles in your render loop
function renderLoop() {
    ogc3DTile.update(camera);
    scene.render();
}
```

### Configuration Options

```javascript
const config = {
    // Core settings
    url: 'https://tile.googleapis.com/v1/3dtiles/root.json',
    queryParams: { key: 'YOUR_API_KEY' },
    
    // Performance settings
    geometricErrorMultiplier: 0.5,    // Lower = higher quality
    loadOutsideView: false,            // Load tiles outside camera view
    maxCachedItems: 10000,            // Cache size limit
    
    // Display settings
    displayErrors: true,               // Show error messages
    displayCopyright: true,            // Show copyright notices
    centerModel: false,                // Center the model at origin
    yUp: true,                        // Y-axis up orientation
    
    // Advanced settings
    static: false,                     // Static tileset optimization
    occlusionCullingService: null,     // Custom occlusion culling
    
    // Callbacks
    onLoadCallback: (tile) => {},      // Called when tileset loads
    meshCallback: (mesh) => {},        // Called for each mesh
    pointsCallback: (points) => {}     // Called for each point cloud
};
```

## 🏗️ Architecture

The library follows a modular architecture with clear separation of concerns:

### Core Components

```
src/
├── config/                    # Configuration and constants
│   └── tile-config.js        # Default settings and enums
├── data-structures/          # Data structures and containers
│   ├── linked-hash-map.js    # LRU cache implementation
│   └── load-request.js       # Request/response objects
├── geometry/                 # 3D geometry utilities
│   ├── bounding-volume.js    # Bounding volume calculations
│   └── coordinate-transform.js # WGS84 coordinate transformations
├── loaders/                  # File format loaders
│   ├── base-loader.js        # Abstract loader interface
│   ├── gltf-loader.js        # GLTF/GLB loader
│   ├── b3dm-loader.js        # B3DM loader (placeholder)
│   ├── json-loader.js        # JSON tileset loader
│   └── loader-registry.js    # Loader management
├── managers/                 # System managers
│   ├── copyright-manager.js  # Copyright display
│   └── error-manager.js      # Error handling and display
├── rendering/                # Rendering and LOD
│   ├── lod-calculator.js     # Level of detail calculations
│   └── tile-updater.js       # Tile update logic
├── scheduling/               # Task scheduling
│   └── priority-queue.js     # Priority-based task queue
├── tile/                     # Tile management
│   ├── ogc-3d-tile-refactored.js # Modern tile implementation
│   └── tile-state-machine.js     # Tile lifecycle management
└── utils/                    # Utility functions
    ├── async-utils.js        # Async helpers
    ├── path-utils.js         # Path manipulation
    └── url-utils.js          # URL handling
```

### Legacy Components

- `OGC3DTile.js` - Main legacy class (backward compatible)
- `TileLoader.js` - Legacy loader (backward compatible)
- `main.js` - Example implementation

## 🔧 API Reference

### OGC3DTile Class

The main class for loading and managing 3D tilesets.

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | string | - | URL to the tileset.json file |
| `queryParams` | object | `{}` | Query parameters (e.g., API key) |
| `geometricErrorMultiplier` | number | `1.0` | LOD quality multiplier |
| `loadOutsideView` | boolean | `false` | Load tiles outside camera frustum |
| `tileLoader` | TileLoader | - | Custom tile loader instance |
| `scene` | BABYLON.Scene | - | Babylon.js scene |
| `renderer` | BABYLON.Engine | - | Babylon.js engine |
| `rootNode` | BABYLON.TransformNode | - | Parent node for tiles |
| `displayErrors` | boolean | `false` | Show error messages |
| `displayCopyright` | boolean | `false` | Show copyright notices |

#### Methods

```javascript
// Update tiles based on camera position
ogc3DTile.update(camera);

// Dispose of the tileset and free resources
ogc3DTile.dispose();

// Check if tileset is ready
const isReady = ogc3DTile.isReady();

// Get tileset statistics
const stats = ogc3DTile.getStats();
```

### TileLoader Class

Manages tile loading, caching, and prioritization.

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxCachedItems` | number | `100` | Maximum cached tiles |
| `scene` | BABYLON.Scene | - | Babylon.js scene |
| `renderer` | BABYLON.Engine | - | Babylon.js engine |
| `meshCallback` | function | - | Called for each loaded mesh |
| `pointsCallback` | function | - | Called for each point cloud |
| `proxy` | string | - | Proxy server URL |

## 🎯 Examples

### Basic Google 3D Tiles

```javascript
import { OGC3DTile, TileLoader } from './path/to/library';

// Setup Babylon.js scene
const engine = new BABYLON.Engine(canvas, true);
const scene = new BABYLON.Scene(engine);
const camera = new BABYLON.ArcRotateCamera('camera', 0, 0, 100, BABYLON.Vector3.Zero(), scene);

// Create tileset
const tileset = new OGC3DTile({
    url: 'https://tile.googleapis.com/v1/3dtiles/root.json',
    queryParams: { key: 'YOUR_GOOGLE_API_KEY' },
    scene: scene,
    renderer: engine,
    displayErrors: true,
    displayCopyright: true
});

// Render loop
engine.runRenderLoop(() => {
    tileset.update(camera);
    scene.render();
});
```

### Custom Tile Processing

```javascript
const tileLoader = new TileLoader({
    scene: scene,
    renderer: engine,
    meshCallback: (mesh) => {
        // Custom mesh processing
        mesh.material.wireframe = true;
        mesh.scaling = new BABYLON.Vector3(2, 2, 2);
    },
    pointsCallback: (points) => {
        // Custom point cloud processing
        points.material.pointSize = 2.0;
    }
});

const tileset = new OGC3DTile({
    url: 'your-tileset-url',
    tileLoader: tileLoader,
    geometricErrorMultiplier: 0.3, // Higher quality
    loadOutsideView: true          // Preload nearby tiles
});
```

### Geographic Positioning

```javascript
// Position tileset at specific coordinates
function setupGeographicTileset(latitude, longitude, altitude) {
    const geoXYZ = geodeticToCartesian(longitude, latitude, altitude);
    
    const tileMapRootNode = new BABYLON.TransformNode('TileMapRoot', scene);
    const euler = latLongToEulerAngles(latitude * Math.PI/180, longitude * Math.PI/180);
    tileMapRootNode.rotationQuaternion = euler;
    
    const tileMapNode = new BABYLON.TransformNode('TileMap', scene);
    tileMapNode.parent = tileMapRootNode;
    tileMapNode.position = new BABYLON.Vector3(-geoXYZ[0], -geoXYZ[2], geoXYZ[1]);
    
    const tileset = new OGC3DTile({
        url: 'https://tile.googleapis.com/v1/3dtiles/root.json',
        queryParams: { key: apiKey },
        rootNode: tileMapNode,
        scene: scene,
        renderer: engine
    });
    
    return tileset;
}
```

## 🛠️ Development

### Scripts

```bash
# Start development server
npm start

# Run linting
npm run lint

# Format code
npm run format
```

### Project Structure

- **Legacy Files**: `OGC3DTile.js`, `TileLoader.js` - Backward compatible main classes
- **Modern Architecture**: `src/` - Modular, refactored components
- **Example**: `main.js` - Complete usage example with UI
- **Web Assets**: `index.html` - Demo page

### Code Quality

The project maintains high code quality with:
- ESLint configuration for consistent code style
- Prettier for automatic code formatting
- Comprehensive JSDoc documentation
- Modular architecture with single responsibility principle
- 100% backward compatibility

## 🔍 Troubleshooting

### Common Issues

1. **API Key Required**: Google 3D Tiles requires a valid API key
2. **CORS Issues**: Use a local server (npm start) for development
3. **Performance**: Adjust `geometricErrorMultiplier` for quality vs performance
4. **Memory Usage**: Configure `maxCachedItems` based on available memory

### Debug Mode

Enable debug logging:

```javascript
const tileset = new OGC3DTile({
    displayErrors: true,
    onLoadCallback: (tile) => {
        console.log('Tileset loaded:', tile);
        console.log('Stats:', tile.getStats());
    }
});
```

## 📄 License

ISC License

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## 📚 References

- [OGC 3D Tiles Specification](https://www.ogc.org/standards/3DTiles)
- [Google 3D Tiles API](https://developers.google.com/maps/documentation/tile)
- [Babylon.js Documentation](https://doc.babylonjs.com/)
- [Original Three.js Implementation](https://github.com/ebeaufay/threedtiles)

## 🎮 Live Demo

Try the live demo: [Babylon.js Playground](https://playground.babylonjs.com/#7SB5DU#10)

---

**Note**: This library is a refactored and optimized version of the original Three.js implementation, specifically designed for Babylon.js with improved performance, modularity, and maintainability.