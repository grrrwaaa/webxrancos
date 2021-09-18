// first, import the Three.js modules we need:
const THREE = await import('https://cdn.skypack.dev/three@0.126.0');
const { OrbitControls } = await import(
  'https://cdn.skypack.dev/three@0.126.0/examples/jsm/controls/OrbitControls.js'
);
const { PointerLockControls } = await import(
  'https://cdn.skypack.dev/three@0.126.0/examples/jsm/controls/PointerLockControls.js'
);
const { VRButton } = await import(
  'https://cdn.skypack.dev/three@0.126.0/examples/jsm/webxr/VRButton.js'
);
let Stats = await import(
  'https://cdn.skypack.dev/three@0.126.0/examples/jsm/libs/stats.module'
);
Stats = Stats.default;
const { PLYLoader } = await import(
  'https://cdn.skypack.dev/three@0.126.0/examples/jsm/loaders/PLYLoader.js'
);
const { OBJLoader } = await import(
  'https://cdn.skypack.dev/three@0.126.0/examples/jsm/loaders/OBJLoader.js'
);
const { vec2, vec3, vec4, quat, mat2, mat3, mat4 } = await import(
  'https://cdn.skypack.dev/gl-matrix@3.3.0'
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

let EYE_HEIGHT = 1.3;
let USE_VR_MIRROR = true;

// arguments: vertical field of view (degrees), aspect ratio, near clip, far clip:
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.05,
  100
);
// Z axis point out of the screen toward you; units are meters
camera.position.y = EYE_HEIGHT;
camera.position.z = 2;

// make an indepenent camera for VR:
let camera_vr = camera.clone();

// ensure the renderer fills the page, and the camera aspect ratio matches:
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
// do this now and whenever the window is resized()
resize();
window.addEventListener('resize', resize, false);

// build a scene graph:
const scene = new THREE.Scene();

// A mesh requires a geometry and a material:
const geometry = new THREE.BoxGeometry(1, 1, 1, 10, 10, 10);
geometry.scale(3, 0.01, 3);
const material = new THREE.MeshStandardMaterial({
  wireframe: true,
});
const cube = new THREE.Mesh(geometry, material);

// add basic lighting
const light = new THREE.HemisphereLight(0xfff0f0, 0x606066);
//light.position.set(1, 1, 1);
scene.add(light);

let MAX_NUM_POINTS = 1000000;
let pointsCount = MAX_NUM_POINTS / 10;
let positions = new Float32Array(MAX_NUM_POINTS * 3);
for (let i = 0; i < MAX_NUM_POINTS * 3; i++) {
  positions[i] = THREE.MathUtils.randFloatSpread(0.5);
}
const pointsGeom = new THREE.BufferGeometry();
pointsGeom.setAttribute(
  'position',
  new THREE.Float32BufferAttribute(positions, 3)
);
//pointsGeom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));//

const sprite = (function (size = 128) {
  // create canvas
  let canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  // get context
  let context = canvas.getContext('2d');
  // draw circle
  context.beginPath();
  context.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI, false);
  context.fillStyle = '#FFFFFF';
  context.fill();
  return new THREE.CanvasTexture(canvas);
})();
sprite.needsUpdate = true; // important

const pointsMat = new THREE.PointsMaterial({
  size: 0.001,
  //vertexColors: true,
  map: sprite,
  blending: THREE.AdditiveBlending,
  depthTest: true,
  transparent: true,
  sizeAttenuation: true,
});

const points = new THREE.Points(pointsGeom, pointsMat);
//points.position.y = 1.5;
scene.add(points);

// copy cube points in:
function copyPointsGeom(src) {
  // typedarray.set is like memcpy()
  pointsGeom.attributes.position.array.set(src.attributes.position.array);
  pointsCount = src.attributes.position.count;
  pointsGeom.attributes.position.needsUpdate = true;
}
copyPointsGeom(geometry.toNonIndexed());

// const controls = new OrbitControls(camera, renderer.domElement);
// controls.target = new THREE.Vector3(0, 1, 0);
// controls.update();
const controls = new PointerLockControls(camera, document.body);
renderer.domElement.addEventListener('click', function () {
  controls.lock();
});
scene.add(controls.getObject());
// for WASD:
const move = {
  forward: 0,
  backward: 0,
  right: 0,
  left: 0,
  crouch: 0,
  dir: new THREE.Vector3(),
};

document.addEventListener('keydown', function (event) {
  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW':
      move.forward = 1;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      move.left = 1;
      break;
    case 'ArrowDown':
    case 'KeyS':
      move.backward = 1;
      break;
    case 'ArrowRight':
    case 'KeyD':
      move.right = 1;
      break;
    case 'ShiftLeft':
      move.crouch = 1;
      break;
    case 'Space':
      //move.jump = 1;
      break;
    default:
    //console.log(event.code);
  }
});

document.addEventListener('keyup', function (event) {
  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW':
      move.forward = 0;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      move.left = 0;
      break;
    case 'ArrowDown':
    case 'KeyS':
      move.backward = 0;
      break;
    case 'ArrowRight':
    case 'KeyD':
      move.right = 0;
      break;
    case 'ShiftLeft':
      move.crouch = 0;
      break;
  }
});

// add a stats view to monitor performance:
const stats = new Stats();
document.body.appendChild(stats.dom);

const clock = new THREE.Clock();

// the function called at frame-rate to animate & render the scene:
function animate() {
  // monitor our FPS:
  stats.begin();

  // compute current timing:
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();

  if (controls.isLocked === true && dt) {
    move.dir.z = move.forward - move.backward;
    move.dir.x = move.right - move.left;
    move.dir.normalize();
    let spd = 1;
    controls.moveRight(move.dir.x * spd * dt);
    controls.moveForward(move.dir.z * spd * dt);

    camera.position.y = EYE_HEIGHT * (1 / (1 + move.crouch));
  }

  pointsGeom.setDrawRange(0, pointsCount);

  // draw the scene:w
  if (renderer.xr.isPresenting) {
    // draw VR first:
    renderer.render(scene, camera_vr);
    // now draw to page:
    renderer.xr.isPresenting = false;
    renderer.setFramebuffer(null);
    renderer.setRenderTarget(renderer.getRenderTarget());
    renderer.clear();
    renderer.render(scene, USE_VR_MIRROR ? camera_vr : camera);
    renderer.xr.isPresenting = true;
  } else {
    renderer.render(scene, camera);
  }

  // monitor our FPS:
  stats.end();
}
// start!
renderer.setAnimationLoop(animate);

// instantiate a loader
const loader = new OBJLoader();
// load a resource
if (1) {
  loader.load(
    // resource URL
    'https://artificialnature.net/webxrancos/gallery_space.obj',
    // called when resource is loaded
    function (group) {
      scene.add(group);
    },
    // called when loading is in progresses
    function (xhr) {
      console.log((xhr.loaded / xhr.total) * 100 + '% loaded');
    },
    // called when loading has errors
    function (error) {
      console.log('An error happened', error);
    }
  );
}
if (1) {
  loader.load(
    // resource URL
    'https://artificialnature.net/webxrancos/ObiwanHaru.obj',
    // called when resource is loaded
    function (group) {
      let mesh = group.children[0];
      let geom = mesh.geometry;
      geom.rotateX(-Math.PI / 2);
      geom.rotateY(+Math.PI / 2);
      geom.translate(0.6, 2.65, -0);
      // possibly
      scene.add(new THREE.Points(mesh.geometry, pointsMat));

      // let geom = mesh.geometry;
      // console.log(geom);
      // geom.rotateX(-Math.PI / 2);
      // geom.translate(0, 2.6, 0);
      // copyPointsGeom(geom);
    },
    // called when loading is in progresses
    function (xhr) {
      console.log((xhr.loaded / xhr.total) * 100 + '% loaded');
    },
    // called when loading has errors
    function (error) {
      console.log('An error happened', error);
    }
  );
}