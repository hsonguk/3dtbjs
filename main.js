import { OGC3DTile } from './OGC3DTile.js';
import { TileLoader } from './TileLoader.js';

const canvas = document.getElementById('renderCanvas');

const startRenderLoop = function (engine) {
    engine.runRenderLoop(function () {
        if (sceneToRender && sceneToRender.activeCamera) {
            sceneToRender.render();
        }
    });
};

let engine = null;
let scene = null;
let sceneToRender = null;

const createDefaultEngine = function () {
    return new BABYLON.Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        disableWebGL2Support: false,
    });
};
// Babylon.js Playground Code
function setupUI(engine, scene, camera) {
    // --- GUI ---
    const advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI('UI');

    // Main Panel to hold all controls
    const mainPanel = new BABYLON.GUI.StackPanel();
    mainPanel.width = '300px';
    mainPanel.isVertical = true;
    mainPanel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    mainPanel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    mainPanel.paddingTop = '20px';
    mainPanel.paddingRight = '20px';
    advancedTexture.addControl(mainPanel);

    // Helper function to create a label and input pair
    function createInputRow(panel, labelText, inputName, placeholderText = '') {
        const container = new BABYLON.GUI.StackPanel(inputName + 'Container');
        container.isVertical = false;
        container.height = '40px'; // Adjust as needed
        container.paddingTop = '5px';
        panel.addControl(container);

        const label = new BABYLON.GUI.TextBlock(inputName + 'Label', labelText);
        label.width = '100px';
        label.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.color = 'white';
        container.addControl(label);

        const input = new BABYLON.GUI.InputText(inputName);
        input.width = '180px';
        input.maxWidth = '180px';
        input.height = '30px';
        input.placeholderText = placeholderText;
        input.color = 'white';
        input.background = 'rgba(0,0,0,0.5)';
        input.focusedBackground = 'rgba(0,0,0,0.8)';
        container.addControl(input);

        return input; // Return the input control so we can access its value
    }

    // Latitude Input
    const latInput = createInputRow(mainPanel, 'Latitude:', 'latInput', 'e.g., 40.7128');
    latInput.text = '51.50073844249350'; //'41.850157'; // Default value

    // Longitude Input
    const lonInput = createInputRow(mainPanel, 'Longitude:', 'lonInput', 'e.g., -74.0060');
    lonInput.text = '-0.12462623169077370'; //'78.185370'; // Default value

    // Altitude Input
    const altInput = createInputRow(mainPanel, 'Altitude:', 'altInput', 'e.g., 100 (meters)');
    altInput.text = '300'; //'4000'; // Default value

    // Key Input
    const keyInput = createInputRow(mainPanel, 'API Key:', 'keyInput', 'Enter your key');
    keyInput.text = ''; // Default value

    // Submit Button
    const submitButton = BABYLON.GUI.Button.CreateSimpleButton('submitBtn', 'Submit Data');
    submitButton.width = '280px'; // Match input width
    submitButton.height = '40px';
    submitButton.color = 'white';
    submitButton.background = 'green';
    submitButton.paddingTop = '10px';
    mainPanel.addControl(submitButton);

    // Output TextBlock (optional, for displaying results in UI)
    const outputText = new BABYLON.GUI.TextBlock('outputText', '');
    outputText.color = 'white';
    outputText.fontSize = 14;
    outputText.textWrapping = true;
    outputText.height = '100px';
    outputText.paddingTop = '10px';
    mainPanel.addControl(outputText);

    submitButton.onPointerUpObservable.add(function () {
        const latitude = parseFloat(latInput.text);
        const longitude = parseFloat(lonInput.text);
        const altitude = parseFloat(altInput.text);
        const apiKey = keyInput.text;

        // Basic validation for numbers
        if (isNaN(latitude) || isNaN(longitude) || isNaN(altitude)) {
            const errorMsg = 'Error: Latitude, Longitude, and Altitude must be valid numbers.';
            console.error(errorMsg);
            outputText.text = errorMsg;
            outputText.color = 'red';
            return;
        }
        if (apiKey.trim() === '') {
            const errorMsg = 'Error: API Key cannot be empty.';
            console.error(errorMsg);
            outputText.text = errorMsg;
            outputText.color = 'red';
            return;
        }

        const data = {
            latitude: latitude,
            longitude: longitude,
            altitude: altitude,
            key: apiKey,
        };

        console.log('Submitted Data:', data);

        // You can update the outputText in the UI as well
        outputText.text = `Submitted:\nLat: ${latitude}\nLon: ${longitude}\nAlt: ${altitude}\nKey: ${apiKey.substring(0, 10)}...`; // Show only part of key for brevity
        outputText.color = 'lightgreen';

        setupTileService(engine, scene, camera, data);
    });
}

function geodeticToCartesian(lon, lat, alt) {
    // Constants for WGS84 ellipsoid
    const a = 6378137; // semi-major axis
    const f = 1 / 298.257223563; // flattening
    const e = Math.sqrt(2 * f - f * f); // eccentricity

    // Convert degrees to radians
    lon *= Math.PI / 180;
    lat *= Math.PI / 180;

    // Calculate N, the radius of curvature in the prime vertical
    const N = a / Math.sqrt(1 - Math.pow(e, 2) * Math.sin(lat) * Math.sin(lat));

    // Calculate Cartesian coordinates
    const x = (N + alt) * Math.cos(lat) * Math.cos(lon);
    const y = (N + alt) * Math.cos(lat) * Math.sin(lon);
    const z = ((1 - Math.pow(e, 2)) * N + alt) * Math.sin(lat);

    return [x, y, z];
}

function latLongToEulerAngles(lat, long) {
    var matrix = BABYLON.Matrix.FromArray([
        -Math.sin(long),
        0,
        -Math.cos(long),
        0,
        Math.cos(lat) * Math.cos(long),
        Math.sin(lat),
        -Math.cos(lat) * Math.sin(long),
        0,
        Math.sin(lat) * Math.cos(long),
        -Math.cos(lat),
        -Math.sin(lat) * Math.sin(long),
        0,
        0,
        0,
        0,
        1,
    ]);

    matrix = matrix.transpose();
    const scale = new BABYLON.Vector3();
    const rotation = new BABYLON.Quaternion();
    const position = new BABYLON.Vector3();

    // variable matrix is matrix you're trying to derive yaw, pitch, and roll from
    matrix.decompose(scale, rotation, position);

    // convert quaternion to Euler angles
    return rotation; //.toEulerAngles();
}

// cartesianToGeodetic function removed - not used in this example
// If needed, it's available in src/geometry/coordinate-transform.js

// Import setIntervalAsync from our refactored utilities
import { setIntervalAsync } from './src/utils/async-utils.js';

function setupTileService(engine, scene, camera, data) {
    // 3D tilemap setup
    const geoLatLongA = [data.latitude, data.longitude, data.altitude];
    const geoXYZ = geodeticToCartesian(geoLatLongA[1], geoLatLongA[0], geoLatLongA[2]);
    console.log('geo X, Y, Z:', geoXYZ);
    console.log('camera position:', camera.position);

    const tileMapRootNode = new BABYLON.TransformNode('TileMapRoot', scene);
    const euler = latLongToEulerAngles(geoLatLongA[0] * 0.0174533, geoLatLongA[1] * 0.0174533);
    tileMapRootNode.rotationQuaternion = euler;

    const tileMapNode = new BABYLON.TransformNode('TileMap', scene);
    tileMapNode.parent = tileMapRootNode;

    const origin = new BABYLON.Vector3(-geoXYZ[0], -geoXYZ[2], geoXYZ[1]);
    tileMapNode.position = origin;

    const ogc3DTile = initTileset(engine, scene, camera, tileMapNode, data.key);
    const isSyncMap = true;

    // Use refactored setIntervalAsync for better performance
    setIntervalAsync(function () {
        if (isSyncMap) {
            ogc3DTile.update(camera);
        }
    }, 10);
}

function initTileset(engine, scene, camera, tileMapNode, apikey) {
    // Create tile loader with optimized settings
    const tileLoader = new TileLoader({
        renderer: engine,
        maxCachedItems: 10000,
        scene: scene,
        camera: camera,
        meshCallback: (mesh) => {
            // Mesh processing callback - can be customized as needed
            console.debug('Mesh loaded:', mesh);
        },
        pointsCallback: (points) => {
            // Points processing callback - can be customized as needed
            console.debug('Points loaded:', points);
        },
    });

    // Create OGC 3D Tile with optimized configuration
    const ogc3DTile = new OGC3DTile({
        url: 'https://tile.googleapis.com/v1/3dtiles/root.json',
        queryParams: { key: apikey },
        yUp: true,
        geometricErrorMultiplier: 0.5,
        loadOutsideView: false,
        tileLoader: tileLoader,
        static: false,
        centerModel: false,
        scene: scene,
        renderer: engine,
        cameraOnload: camera,
        rootNode: tileMapNode,
        displayErrors: true,
        displayCopyright: true,
        onLoadCallback: (tile) => {
            console.log('Tileset loaded:', tile);
        },
    });

    ogc3DTile.parent = tileMapNode;
    return ogc3DTile;
}

const createScene = function () {
    const scene = new BABYLON.Scene(engine);
    scene.useRightHandedSystem = true;

    // Camera setup
    const arcCameraAlpha = (2 * Math.PI) / 5;
    const arcCameraBeta = Math.PI / 3;
    const arcCameraRadius = 100;
    const camera = new BABYLON.ArcRotateCamera(
        'Camera',
        arcCameraAlpha,
        arcCameraBeta,
        arcCameraRadius,
        new BABYLON.Vector3(0, 0, 0),
        scene
    );
    camera.setTarget(BABYLON.Vector3.Zero());
    camera.zoomToMouseLocation = true;
    camera.wheelDeltaPercentage = 0.1;
    camera.panningSensibility = 10;
    camera.attachControl(canvas, true);

    // Lighting setup
    const light = new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.7;

    // Create a reference sphere (kept for visual reference)
    const referenceSphere = BABYLON.Mesh.CreateSphere('referenceSphere', 16, 2, scene);
    console.debug('Reference sphere created:', referenceSphere);

    // Setup UI
    setupUI(engine, scene, camera);

    return scene;
};
// Main initialization function
async function initFunction() {
    console.log('initFunction started');

    const asyncEngineCreation = async function () {
        try {
            return createDefaultEngine();
        } catch (error) {
            console.log('Engine creation failed, using default engine:', error);
            return createDefaultEngine();
        }
    };

    try {
        engine = await asyncEngineCreation();
        console.log('Engine created');

        if (!engine) {
            throw new Error('Engine should not be null');
        }

        startRenderLoop(engine);
        console.log('Render loop started');

        scene = createScene();
        console.log('Scene created');
        sceneToRender = scene;

        // Handle window resize
        window.addEventListener('resize', function () {
            engine.resize();
        });

    } catch (error) {
        console.error('Initialization failed:', error);
    }
}

// Start the application
initFunction();
