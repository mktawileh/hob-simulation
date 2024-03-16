import * as THREE from "three";
import "./style.css";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as dat from "dat.gui";
import Terrain from "./Terrain";

// Create physics worker
const worker = new Worker("./physics.js");

// Load heightmap image for terrain
var heightmapImage = new Image();
heightmapImage.src = "/heightmap.png";

var sizes;

// Main app function
async function init() {
    // Create dat.GUI for debugging
    const gui = new dat.GUI();

    // Create scene
    const scene = new THREE.Scene();

    // Create renderer with antialiasing
    const renderer = new THREE.WebGLRenderer({ antialias: true });

    // Set size and pixel ratio
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));

    // Enable shadows
    renderer.shadowMap.enabled = true;

    sizes = {
        width: window.innerWidth,
        height: window.innerHeight,
    };
    // Listen for window resize
    window.addEventListener("resize", () => {
        // Update sizes, camera, and renderer on resize
        sizes.width = window.innerWidth;
        sizes.height = window.innerHeight;
        camera.aspect = sizes.width / sizes.height;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Add renderer to page
    document.body.appendChild(renderer.domElement);

    // Initialize camera
    var camera = initCamera(scene);

    // Initialize environment maps
    initWorldEnv(scene);

    // Initialize lights
    initLights(scene);

    const control = new OrbitControls(camera, renderer.domElement);
    control.enableDamping = true;

    // Load 3D model
    var model = await loadModel("./static/models/hab.gltf");
    var balloon = model.scene.children[0];
    console.log(balloon);

    // Create world state
    const world = {
        // State properties
        air_angle_x: -45,
        air_angle_z: 45,
        air_velocity: 75,
        ballon_mass: 48,
        ballon_radius: 7, // in meters
        ballon_mesh_thickness: 0.3,
        ballon_torch_temp: 400,
        density: 1.2,
        ballon_density: 1.2,
    };

    // Configure balloon
    balloon.children.map((m) => {
        m.castShadow = true;
        m.morphTargetInfluences[0] = 1-world.ballon_radius / 10;
    });

    // Initialize GUI
    initSettings(world, gui);

    // Add balloon to scene
    scene.add(balloon);

    // Handle physics worker messages
    worker.onmessage = function (message) {
        // Update state from worker
        const data = message.data;
        if (data) {
            let { x, y, z, temp, ballon_density, density } = data;
            const v = 60;
            x /= v;
            y /= v;
            z /= v;

            balloon.position.set(x, y, z);
            world.temp = temp;
            world.ballon_density = ballon_density;
            world.density = density;
        }
    };

    let time = Date.now();

    function update(dt) {
        balloon.children.map((m) => {
            m.castShadow = true;
            m.morphTargetInfluences[0] = 1-world.ballon_radius / 10;
        });
        worker.postMessage({
            method: "update",
            args: [dt],
        });
        document.getElementById("temp").innerText = parseInt(world.temp);
        document.getElementById("density").innerText = world.density.toFixed(3);
        document.getElementById("ballon_density").innerText =
            world.ballon_density.toFixed(3);
        document.getElementById("height").innerText =
            balloon.position.y.toFixed(3);
    }

    // Main render loop
    function tick() {
        // Render and update
        let curTime = Date.now();
        control.update();
        renderer.render(scene, camera);
        update((curTime - time) / 1000);
        setTimeout(tick, 1000 / 30);
        time = curTime;
    }

    tick();
}

// Camera setup
function initCamera(scene) {
    // Create camera
    const camera = new THREE.PerspectiveCamera(
        60,
        sizes.width / sizes.height,
        1,
        10000,
    );
    // Set position
    camera.position.z = -6;
    camera.position.y = 4.5;
    camera.position.x = 20;
    // Add to scene
    scene.add(camera);
    camera.lookAt(0, 0, 0);

    return camera;
}

// Environment maps
function initWorldEnv(scene) {
    var skyDome, water;
    // Skybox
    new THREE.TextureLoader().load("/sky1.jpg", function (t1) {
        t1.minFilter = THREE.LinearFilter; // Texture is not a power-of-two size; use smoother interpolation.
        skyDome = new THREE.Mesh(
            new THREE.SphereGeometry(
                8192,
                16,
                16,
                0,
                Math.PI * 2,
                0,
                Math.PI * 0.5,
            ),
            new THREE.MeshBasicMaterial({
                map: t1,
                side: THREE.BackSide,
                fog: false,
            }),
        );
        skyDome.position.y = -99;
        scene.add(skyDome);
    });

    // Water plane
    water = new THREE.Mesh(
        new THREE.PlaneBufferGeometry(16384 + 1024, 16384 + 1024, 16, 16),
        new THREE.MeshLambertMaterial({
            color: 0x006ba0,
            transparent: true,
            opacity: 0.6,
        }),
    );
    water.position.y = -99;
    water.rotation.x = -0.5 * Math.PI;
    scene.add(water);

    var xS = 255,
        yS = 255;
    var terrainMaterial = new THREE.MeshStandardMaterial({
        color: 0x7ec850,
        flatShading: false,
    });
    var terrainScene = Terrain({
        easing: Terrain.Linear,
        heightmap: heightmapImage,
        material: terrainMaterial,
        maxHeight: 59,
        minHeight: -41,
        stretch: true,
        steps: 1,
        sky: true,
        xSegments: xS,
        xSize: 1024,
        ySegments: yS,
        ySize: 1024,
    });
    var boxTerrainGeometry = new THREE.BoxGeometry(10, 10, 10);
    var boxTarrain = new THREE.Mesh(
        boxTerrainGeometry,
        new THREE.MeshStandardMaterial({
            color: 0xa3a3a3,
        }),
    );
    boxTarrain.position.y = -5;
    scene.add(terrainScene);
    scene.add(boxTarrain);
}

// Lights
function initLights(scene) {
    // Directional lights
    let skyLight = new THREE.DirectionalLight(0xe8bdb0, 1.5);
    skyLight.position.set(2950, 2625, -160); // Sun on the sky texture
    scene.add(skyLight);
    let light2 = new THREE.DirectionalLight(0xc3eaff, 0.75);
    light2.position.set(-1, -0.5, -1);
    scene.add(light2);
}

// Load model
function loadModel(url) {
    // Load glTF
    return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        loader.load(url, resolve, undefined, reject);
    });
}

// Handle GUI settings changed callback function
function changeProp(p, v) {
    worker.postMessage({
        method: "change",
        args: [p, v],
    });
}

// GUI settings
function initSettings(world, gui) {
    // Add GUI controls
    gui.add(world, "air_angle_x", -180, 180, 0.1)
        .name("Wind Angle X")
        .onChange((v) => changeProp("air_angle_x", v));
    gui.add(world, "air_angle_z", -180, 180, 0.1)
        .name("Wind Angle Z")
        .onChange((v) => changeProp("air_angle_z", v));
    gui.add(world, "air_velocity", 0, 250, 1)
        .name("Wind Speed")
        .onChange((v) => changeProp("air_velocity", v));

    gui.add(world, "ballon_mass", 10, 1000, 20)
        .name("Mass")
        .onChange((v) => changeProp("ballon_mass", v));

    gui.add(world, "ballon_radius", 1, 10, 0.5)
        .name("Balloon Radius")
        .onChange((v) => changeProp("ballon_radius", v));

    gui.add(world, "ballon_mesh_thickness", 0.01, 5, 0.001)
        .name("Mesh Thickness")
        .onChange((v) => changeProp("ballon_mesh_thickness", v));

    gui.add(world, "ballon_torch_temp", 0, 900, 1)
        .name("Torch Temperature")
        .onChange((v) => changeProp("ballon_torch_temp", v + 273.15));
}

// Start app
init();
