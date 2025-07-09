import { OGC3DTile } from './OGC3DTile.js';
import { TileLoader } from './TileLoader.js';

var canvas = document.getElementById("renderCanvas");

var startRenderLoop = function (engine, canvas) {
    engine.runRenderLoop(function () {
        if (sceneToRender && sceneToRender.activeCamera) {
            sceneToRender.render();
        }
    });
}

var engine = null;
var scene = null;
var sceneToRender = null;
var createDefaultEngine = function() { return new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true,  disableWebGL2Support: false}); };
// Babylon.js Playground Code
function setupUI(engine, scene, camera) {
    // --- GUI ---
    const advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");

    // Main Panel to hold all controls
    const mainPanel = new BABYLON.GUI.StackPanel();
    mainPanel.width = "300px";
    mainPanel.isVertical = true;
    mainPanel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    mainPanel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    mainPanel.paddingTop = "20px";
    mainPanel.paddingRight = "20px";
    advancedTexture.addControl(mainPanel);
    
    // Helper function to create a label and input pair
    function createInputRow(panel, labelText, inputName, placeholderText = "", isNumber = true) {
        const container = new BABYLON.GUI.StackPanel(inputName + "Container");
        container.isVertical = false;
        container.height = "40px"; // Adjust as needed
        container.paddingTop = "5px";
        panel.addControl(container);

        const label = new BABYLON.GUI.TextBlock(inputName + "Label", labelText);
        label.width = "100px";
        label.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        label.color = "white";
        container.addControl(label);

        const input = new BABYLON.GUI.InputText(inputName);
        input.width = "180px";
        input.maxWidth = "180px";
        input.height = "30px";
        input.placeholderText = placeholderText;
        input.color = "white";
        input.background = "rgba(0,0,0,0.5)";
        input.focusedBackground = "rgba(0,0,0,0.8)";
        container.addControl(input);
        
        return input; // Return the input control so we can access its value
    }

    // Latitude Input
    const latInput = createInputRow(mainPanel, "Latitude:", "latInput", "e.g., 40.7128");
    latInput.text = "41.850157";//"51.50073844249350"; // Default value

    // Longitude Input
    const lonInput = createInputRow(mainPanel, "Longitude:", "lonInput", "e.g., -74.0060");
    lonInput.text = "78.185370";//"-0.12462623169077370"; // Default value

    // Altitude Input
    const altInput = createInputRow(mainPanel, "Altitude:", "altInput", "e.g., 100 (meters)");
    altInput.text = "4000";//"300"; // Default value

    // Key Input
    const keyInput = createInputRow(mainPanel, "API Key:", "keyInput", "Enter your key", false);
    keyInput.text = ""; // Default value

    // Submit Button
    const submitButton = BABYLON.GUI.Button.CreateSimpleButton("submitBtn", "Submit Data");
    submitButton.width = "280px"; // Match input width
    submitButton.height = "40px";
    submitButton.color = "white";
    submitButton.background = "green";
    submitButton.paddingTop = "10px";
    mainPanel.addControl(submitButton);

    // Output TextBlock (optional, for displaying results in UI)
    const outputText = new BABYLON.GUI.TextBlock("outputText", "");
    outputText.color = "white";
    outputText.fontSize = 14;
    outputText.textWrapping = true;
    outputText.height = "100px";
    outputText.paddingTop = "10px";
    mainPanel.addControl(outputText);


    submitButton.onPointerUpObservable.add(function() {
        const latitude = parseFloat(latInput.text);
        const longitude = parseFloat(lonInput.text);
        const altitude = parseFloat(altInput.text);
        const apiKey = keyInput.text;

        // Basic validation for numbers
        if (isNaN(latitude) || isNaN(longitude) || isNaN(altitude)) {
            const errorMsg = "Error: Latitude, Longitude, and Altitude must be valid numbers.";
            console.error(errorMsg);
            outputText.text = errorMsg;
            outputText.color = "red";
            return;
        }
         if (apiKey.trim() === "") {
            const errorMsg = "Error: API Key cannot be empty.";
            console.error(errorMsg);
            outputText.text = errorMsg;
            outputText.color = "red";
            return;
        }


        const data = {
            latitude: latitude,
            longitude: longitude,
            altitude: altitude,
            key: apiKey
        };

        console.log("Submitted Data:", data);

        // You can update the outputText in the UI as well
        outputText.text = `Submitted:\nLat: ${latitude}\nLon: ${longitude}\nAlt: ${altitude}\nKey: ${apiKey.substring(0,10)}...`; // Show only part of key for brevity
        outputText.color = "lightgreen";

        setupTileService(engine, scene, camera, data) 
    });
}

function geodeticToCartesian(lon, lat, alt) {
    // Constants for WGS84 ellipsoid
    const a = 6378137; // semi-major axis
    const f = 1 / 298.257223563; // flattening
    const e = Math.sqrt(2 * f - f * f); // eccentricity

    // Convert degrees to radians
    lon *= (Math.PI / 180);
    lat *= (Math.PI / 180);

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
                        -Math.sin(long), 0, -Math.cos(long), 0,                                    
                        Math.cos(lat)*Math.cos(long), Math.sin(lat), -Math.cos(lat)*Math.sin(long), 0,
                        Math.sin(lat)*Math.cos(long), -Math.cos(lat), -Math.sin(lat)*Math.sin(long), 0,                                               
                        0, 0, 0, 1
                    ]);
    
    
    matrix = matrix.transpose();
    const scale = new BABYLON.Vector3();
    const rotation = new BABYLON.Quaternion();
    const position = new BABYLON.Vector3();

    // variable matrix is matrix you're trying to derive yaw, pitch, and roll from
    matrix.decompose(scale, rotation, position);

    // convert quaternion to Euler angles
    return rotation;//.toEulerAngles();
}

function cartesianToGeodetic(x, y, z) {
    // Constants for WGS84 ellipsoid
    const a = 6378137; // semi-major axis
    const f = 1 / 298.257223563; // flattening
    const b = a * (1 - f); // semi-minor axis
    const e = Math.sqrt(2 * f - f * f); // eccentricity

    const p = Math.sqrt(x * x + z * z); // distance from minor axis
    const th = Math.atan2(a * y, b * p); // angle between p and y;

    // Calculate longitude
    let lon = Math.atan2(-z, x);

    // Calculate latitude
    let lat = Math.atan2((y + Math.pow(e, 2) * b * Math.pow(Math.sin(th), 3)), (p - Math.pow(e, 2) * a * Math.pow(Math.cos(th), 3)));

    // Calculate N, the radius of curvature in the prime vertical
    const N = a / Math.sqrt(1 - Math.pow(e, 2) * Math.sin(lat) * Math.sin(lat));

    // Calculate altitude
    const alt = p / Math.cos(lat) - N;

    // Convert to degrees
    lon *= (180 / Math.PI);
    lat *= (180 / Math.PI);

    return [lon, lat, alt];
}

function setIntervalAsync(fn, delay) {
    let timeout;

    const run = async () => {
        const startTime = Date.now();
        // try {
            await fn();
        // } catch (err) {
        //     console.error(err);
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

function setupTileService(engine, scene, camera, data) {
    // 3D tilemap
    var geoLatLongA = [data.latitude, data.longitude, data.altitude];//[51.5007384424935, -0.1246262316907737, 300];//[48.85839143962933, 2.294390520081066, 300];//[55.84676946, -4.20752643, 20]; //[-33.865143, 151.209900, 100];//////[44.50210523178806, -88.06237983234793, 100]; //[40.74845, -73.98564, 100]; //[45, 45, 100];//// 
    var geoXYZ = geodeticToCartesian(geoLatLongA[1], geoLatLongA[0], geoLatLongA[2]);
    console.log("geo X, Y, Z: "+ geoXYZ);
    console.log("camera position: "+ camera.position);

    var tileMapRootNode = new BABYLON.TransformNode("TileMapRoot", scene);
    var euler = latLongToEulerAngles(geoLatLongA[0]*0.0174533, geoLatLongA[1]*0.0174533);
    tileMapRootNode.rotationQuaternion = euler;
    var tileMapNode = new BABYLON.TransformNode("TileMap", scene);
    tileMapNode.parent = tileMapRootNode;
    
    var orgin = new BABYLON.Vector3(-geoXYZ[0], -geoXYZ[2], geoXYZ[1]);
    tileMapNode.position = orgin;

    const ogc3DTile = initTileset(engine, scene, camera, tileMapNode, data.key);
    const IsSyncMap = true;

    setIntervalAsync(function () {
    // update tile map
        if (IsSyncMap){
            ogc3DTile.update(camera);
        }            
    }, 10);
}

function initTileset(engine, scene, camera, tileMapNode, apikey) {
    
            const tileLoader = new TileLoader({
                renderer: engine,
                maxCachedItems: 10000,
                scene: scene,
                camera: camera,
                //occlusionCullingService: occlusionCullingService,
                meshCallback: mesh => {
                    // Insert code to be called on every newly decoded mesh 
                },
                pointsCallback: points => {
                    // Insert code to be called on every newly decoded points
                }
            });
            
            const ogc3DTile = new OGC3DTile({   
                url: "https://tile.googleapis.com/v1/3dtiles/root.json",
                queryParams: { key: apikey },
                yUp: true, // this value is normally true by default  

                geometricErrorMultiplier: 0.5,
                loadOutsideView: false,
                tileLoader: tileLoader,
                //occlusionCullingService: occlusionCullingService,
                static: false,
                centerModel: false,
                scene: scene,
                renderer: engine,
                cameraOnload: camera,
                rootNode: tileMapNode,
                // renderer: renderer,
                //yUp:false,
                //displayErrors: true,
                //displayCopyright: true,
                onLoadCallback:(e)=>{
                    console.log(e)
                }
            });

            ogc3DTile.parent = tileMapNode;
            // setIntervalAsync(function () {
            //     // update tile map
            //         if (IsSyncMap){
            //             ogc3DTile.update(camera);
            //         }            
            // }, 10);

            return ogc3DTile;
        }

var createScene = function () {
    var scene = new BABYLON.Scene(engine);
    // scene.clearColor = new BABYLON.Color3(1, 0, 0);
    scene.useRightHandedSystem = true;

    var arcCameraAlpha = 2*Math.PI/5;
    var arcCameraBeta = Math.PI/3;
    var arcCameraRadius = 100;
    var camera = new BABYLON.ArcRotateCamera("Camera", arcCameraAlpha, arcCameraBeta, arcCameraRadius, new BABYLON.Vector3(0, 0, 0), scene);
    camera.setTarget(BABYLON.Vector3.Zero());
    camera.zoomToMouseLocation = true;
    camera.wheelDeltaPercentage = 0.1;
    camera.panningSensibility = 100;

    camera.attachControl(canvas, true);
    var light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.7;
    var sphere = BABYLON.Mesh.CreateSphere("sphere1", 16, 2, scene);

    // --- Load your library ---
    setupUI(engine, scene, camera);    
    // --- End library loading ---

    return scene;
};
window.initFunction = async function() {
    console.log("initFunction started");
    var asyncEngineCreation = async function() {
        try {
            return createDefaultEngine();
        } catch(e) {
            console.log("the available createEngine function failed. Creating the default engine instead");
            return createDefaultEngine();
        }
    }

    engine = await asyncEngineCreation();
    console.log("Engine created");
    if (!engine) throw 'engine should not be null.';
    startRenderLoop(engine, canvas);
    console.log("Render loop started");
    scene = createScene();
    console.log("Scene created");
    sceneToRender = scene;

    // Resize
    window.addEventListener("resize", function () {
        engine.resize();
    });
};
initFunction();