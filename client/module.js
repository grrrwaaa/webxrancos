const IS_LOCALHOST = (window.location.hostname == "localhost");
const IS_HEROKU = (window.location.hostname.indexOf("herokuapp") !== -1);
const WS_ADDRESS = IS_HEROKU || IS_LOCALHOST ? location.origin.replace(/^http/, 'ws') : "wss://webxrancos.herokuapp.com"
const RELOAD_ON_DISCONNECT = IS_LOCALHOST;

// first, import the Three.js modules we need:
const THREE = await import('https://cdn.skypack.dev/three@0.126.0');
const { LightProbeGenerator } = await import(
  'https://cdn.skypack.dev/three@0.126.0/examples/jsm/lights/LightProbeGenerator.js'
);
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
const { GUI } = await import(
  'https://unpkg.com/three@0.126.0/examples/jsm/libs/dat.gui.module.js'
);

const { vec2, vec3, vec4, quat, mat2, mat3, mat4 } = await import(
  'https://cdn.skypack.dev/gl-matrix@3.3.0'
);


const RESOURCE_URL_BASE = IS_LOCALHOST ? window.origin+"/" : 'https://artificialnature.net/webxrancos/';
console.log("loading assets from " + RESOURCE_URL_BASE)

let EYE_HEIGHT = 1.4;

const PROJECTOR_ASPECT = 1920 / 1200;
const PROJECTOR_THROW_RATIO = 0.6;
const PROJECTOR_HEIGHT = 3.2;
const PROJECTOR1_POSITION = new THREE.Vector3(1, PROJECTOR_HEIGHT, 3);
const PROJECTOR2_POSITION = new THREE.Vector3(-0.5, PROJECTOR_HEIGHT, -2.5);

const LIDAR_HEIGHT = PROJECTOR_HEIGHT;
const LIDAR1_POSITION = new THREE.Vector3(
  PROJECTOR1_POSITION.x - 0.2,
  LIDAR_HEIGHT,
  PROJECTOR1_POSITION.z
);
const LIDAR2_POSITION = new THREE.Vector3(
  PROJECTOR2_POSITION.x + 0.2,
  LIDAR_HEIGHT,
  PROJECTOR2_POSITION.z
);

// throw ratio is throw distance / image width
// tan(halfangle) = halfwidth/distance (in radians)
// Field of view (Y) is twice that angle, in degrees, divided by aspect
const PROJECTOR_W = PROJECTOR_HEIGHT / PROJECTOR_THROW_RATIO;
const PROJECTOR_H = PROJECTOR_W / PROJECTOR_ASPECT;
const PROJECTOR_FOVX =
  (Math.atan((0.5 * PROJECTOR_W) / PROJECTOR_HEIGHT) * 2 * 180) / Math.PI;
const PROJECTOR_FOVY =
  (Math.atan((0.5 * PROJECTOR_H) / PROJECTOR_HEIGHT) * 2 * 180) / Math.PI;

const app = {
  renderer: null,
  camera: null,

  

  scene: new THREE.Scene(),
  clock: new THREE.Clock(),
  stats: new Stats(),

  textureLoader: new THREE.TextureLoader(),
  objLoader: new OBJLoader(),

  pointerControls: null,
  move: {
    forward: 0,
    backward: 0,
    right: 0,
    left: 0,
    crouch: 0,
    dir: new THREE.Vector3(),
  },
}

function app_init(app) {
  const {scene, move} = app;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
  renderer.shadowMap.enabled = true;
  //renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  //renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));
  renderer.domElement.tabIndex = 0; // allow it to get keyboard focus

  app.renderer = renderer;

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

  app.camera = camera;

  // ensure the renderer fills the page, and the camera aspect ratio matches:
  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    //camera_wasd.updateProjectionMatrix();
  }
  // do this now and whenever the window is resized()
  resize();
  window.addEventListener('resize', resize, false);

  document.body.appendChild(app.stats.dom);

  // add basic lighting
  const hemispherelight = new THREE.HemisphereLight(0xeeeeee, 0x080808, 1);
  hemispherelight.position.set(1, 1, 1);
  scene.add(hemispherelight);
  const ambientlight = new THREE.AmbientLight(0x404040);
  scene.add(ambientlight);

  const pointlight1 = new THREE.SpotLight(
    0xffffff,
    1,
    PROJECTOR_HEIGHT * 3,
    (PROJECTOR_FOVX * Math.PI) / 180
  );
  pointlight1.position.copy(PROJECTOR1_POSITION);
  pointlight1.castShadow = true;
  pointlight1.shadow.camera.near = 1;
  pointlight1.shadow.camera.far = PROJECTOR_HEIGHT;
  //pointlight1.shadow.bias = -0.000222;
  pointlight1.shadow.mapSize.width = 1920 / 2;
  pointlight1.shadow.mapSize.height = 1200 / 2;
  pointlight1.target.position.set(
    PROJECTOR1_POSITION.x,
    0,
    PROJECTOR1_POSITION.z
  );
  pointlight1.target.updateMatrixWorld();
  pointlight1.penumbra = 0.2;
  pointlight1.decay = 1;
  pointlight1.shadow.focus = 1;
  scene.add(pointlight1);

  const pointlight2 = new THREE.SpotLight(
    0xffffff,
    1,
    PROJECTOR_HEIGHT * 3,
    (PROJECTOR_FOVX * Math.PI) / 180
  );
  pointlight2.position.copy(PROJECTOR2_POSITION);
  pointlight2.castShadow = true;
  pointlight2.shadow.camera.near = 1;
  pointlight2.shadow.camera.far = PROJECTOR_HEIGHT;
  //pointlight2.shadow.bias = -0.000222;
  pointlight2.shadow.mapSize.width = 1920 / 2;
  pointlight2.shadow.mapSize.height = 1200 / 2;
  pointlight2.target.position.set(
    PROJECTOR2_POSITION.x,
    0,
    PROJECTOR2_POSITION.z
  );
  pointlight2.target.updateMatrixWorld();
  pointlight2.penumbra = 0.2;
  pointlight2.decay = 1;
  pointlight2.shadow.focus = 1;
  scene.add(pointlight2);

  const axesHelper = new THREE.AxesHelper(1);
  scene.add(axesHelper);
  
  const pointerControls = new PointerLockControls(camera, document.body);
  renderer.domElement.addEventListener('click', function () {
    pointerControls.lock();
    renderer.domElement.focus(); // and focus it
  });
  scene.add(pointerControls.getObject());
  

  app.pointerControls = pointerControls;
  app.move = move;

  document.addEventListener('keydown', function (event) {
    event.preventDefault();
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
    event.preventDefault();
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

}


function loadzkm(app) {
  const { renderer, textureLoader, objLoader } = app;

  const scene = new THREE.Scene()

  const floorMatPrefix = RESOURCE_URL_BASE + 'Wood_Floor_009_';
  const floorMat = new THREE.MeshStandardMaterial({
    roughness: 0.8,
    metalness: 0,
    color: 0x222222,
  });

  function loadTex(path, map = 'map', rx = 1, ry = 1) {
    textureLoader.load(path, (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(rx, ry);
      floorMat[map] = texture;
      floorMat.needsUpdate = true;
    });
  }
  loadTex(floorMatPrefix + 'basecolor.jpg', 'map', 10, 10);
  loadTex(floorMatPrefix + 'roughness.jpg', 'roughnessMap', 10, 10);
  loadTex(floorMatPrefix + 'normal.jpg', 'normalMap', 10, 10);
  loadTex(floorMatPrefix + 'ambientOcclusion.jpg', 'aoMap', 10, 10);
  loadTex(floorMatPrefix + 'height.png', 'bumpMap', 10, 10);

  let columnsMat = new THREE.MeshStandardMaterial({
    wireframe: false,
    color: 0x999088,
  });
  let wallsMat = new THREE.MeshStandardMaterial({
    wireframe: false,
    color: 0x444444,
  });
  
  const floorGeom = new THREE.BoxGeometry(20, 0.01, 20, 20, 1, 20);
  floorGeom.translate(0, -0.01, 0);
  const floor = new THREE.Mesh(floorGeom, floorMat);
  scene.add(floor);

  const lidarMat = new THREE.LineBasicMaterial({ color: 0xff0000 });


  // preview the lidar:
  let lidar1 = new THREE.PerspectiveCamera(55, 640 / 480, 0.4, LIDAR1_POSITION.y);
  lidar1.position.copy(LIDAR1_POSITION);
  lidar1.rotateY(+Math.PI / 2);
  lidar1.rotateX(-Math.PI / 2);
  scene.add(lidar1);
  const lidar1viz = new THREE.CameraHelper(lidar1);
  lidar1viz.material = lidarMat;
  scene.add(lidar1viz);

  let lidar2 = new THREE.PerspectiveCamera(55, 640 / 480, 0.4, LIDAR2_POSITION.y);
  lidar2.position.copy(LIDAR2_POSITION);
  lidar2.rotateY(+Math.PI / 2);
  lidar2.rotateX(-Math.PI / 2);
  scene.add(lidar2);
  const lidar2viz = new THREE.CameraHelper(lidar2);
  lidar2viz.material = lidarMat;
  scene.add(lidar2viz);

  // preview the projector:
  let projector1 = new THREE.PerspectiveCamera(
    PROJECTOR_FOVY,
    PROJECTOR_ASPECT,
    0.01,
    PROJECTOR1_POSITION.y
  );
  projector1.position.copy(PROJECTOR1_POSITION);
  projector1.rotateY(+Math.PI / 2);
  projector1.rotateX(-Math.PI / 2);
  scene.add(projector1);
  const projector1viz = new THREE.CameraHelper(projector1);
  scene.add(projector1viz);

  let projector2 = new THREE.PerspectiveCamera(
    PROJECTOR_FOVY,
    PROJECTOR_ASPECT,
    0.01,
    PROJECTOR2_POSITION.y
  );
  projector2.position.copy(PROJECTOR2_POSITION);
  projector2.rotateY(+Math.PI / 2);
  projector2.rotateX(-Math.PI / 2);
  scene.add(projector2);
  const projector2viz = new THREE.CameraHelper(projector2);
  scene.add(projector2viz);

  const shadowMat = new THREE.ShadowMaterial({
    side: THREE.DoubleSide,
    opacity: 0.5,
  });
  let sand2_geom = new THREE.PlaneGeometry(PROJECTOR_W, PROJECTOR_H);
  sand2_geom.rotateX(-Math.PI / 2);
  sand2_geom.rotateY(+Math.PI / 2);
  sand2_geom.translate(PROJECTOR2_POSITION.x, 0, PROJECTOR2_POSITION.z);
  let proj2_quad = new THREE.Mesh(sand2_geom, shadowMat);
  proj2_quad.receiveShadow = true;
  scene.add(proj2_quad);
  
  let proj1_scene = new THREE.Scene();
  let proj1_texture = new THREE.WebGLRenderTarget(1920, 1200, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBFormat,
  });
  
  let sand1_geom = new THREE.PlaneGeometry(PROJECTOR_W, PROJECTOR_H);
  sand1_geom.rotateX(-Math.PI / 2);
  sand1_geom.rotateY(+Math.PI / 2);
  sand1_geom.translate(PROJECTOR1_POSITION.x, 0, PROJECTOR1_POSITION.z);
  let proj1_quad = new THREE.Mesh(
    sand1_geom,
    new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      color: 0xffffff,
      map: proj1_texture.texture,
    })
  );
  scene.add(proj1_quad);

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
    size: 0.01,
    color: 0x666666,
    //vertexColors: true,
    map: sprite,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    transparent: true,
    sizeAttenuation: true,
  });
  
  let clouds = new THREE.Group();
  clouds.visible = false;
  scene.add(clouds);
  function showClouds(show) {
    // show/hide let clouds = new THREE.Group();
    clouds.visible = show;
    // load if not yet loaded:
    if (show && !clouds.children.length) {
      objLoader.load(
        // resource URL
        RESOURCE_URL_BASE + 'ObiwanIna.obj',
        // called when resource is loaded
        function (group) {
          let mesh = group.children[0];
          let geom = mesh.geometry;
          geom.rotateX(-Math.PI / 2);
          geom.rotateY(+Math.PI / 2);
          geom.translate(LIDAR1_POSITION.x, 2.65, LIDAR1_POSITION.z);
          // possibly
          let pts = new THREE.Points(mesh.geometry, pointsMat);
          pts.castShadow = true;
          //clouds.add(pts);
          proj1_scene.add(pts.clone());
        }
      );
      objLoader.load(
        // resource URL
        RESOURCE_URL_BASE + 'ObiwanHaru.obj',
        // called when resource is loaded
        function (group) {
          let mesh = group.children[0];
          let geom = mesh.geometry;
          geom.rotateX(-Math.PI / 2);
          geom.rotateY(+Math.PI / 2);
          geom.translate(LIDAR2_POSITION.x, 2.65, LIDAR2_POSITION.z);
          // possibly
          let pts = new THREE.Points(mesh.geometry, pointsMat);
          pts.castShadow = true;
          clouds.add(pts);
        }
      );
    }
  }
  showClouds(true);

  const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
    encoding: THREE.sRGBEncoding, // since gamma is applied during rendering, the cubeCamera renderTarget texture encoding must be sRGBEncoding
    format: THREE.RGBAFormat,
  });
  const cubeCamera = new THREE.CubeCamera(0.1, 10, cubeRenderTarget);
  const lightProbe = new THREE.LightProbe();
  lightProbe.position.y = EYE_HEIGHT;
  scene.add(lightProbe);
  cubeCamera.update(renderer, scene);
  lightProbe.copy(
    LightProbeGenerator.fromCubeRenderTarget(renderer, cubeRenderTarget)
  );
  
  let simpleMat = new THREE.MeshStandardMaterial({
    color: 0x666666,
  });
  let bellsMat = new THREE.MeshStandardMaterial({
    color: 0x665544,
    metalness: 1,
    roughness: 0,
    envMap: cubeRenderTarget.texture,
  });
  let esp32_geom = new THREE.BoxGeometry(0.1, 0.05, 0.075);
  let bell_geom = new THREE.SphereGeometry(0.01, 15, 16);

  function makeBells() {
    let positions = [
      {
        pos: new THREE.Vector3(
          PROJECTOR1_POSITION.x,
          3.9,
          PROJECTOR1_POSITION.z + 1
        ),
        angle: 0,
      },
      {
        pos: new THREE.Vector3(
          PROJECTOR1_POSITION.x,
          3.9,
          PROJECTOR1_POSITION.z - 1
        ),
        angle: Math.PI,
      },
      {
        pos: new THREE.Vector3(
          PROJECTOR2_POSITION.x,
          3.9,
          PROJECTOR2_POSITION.z + 1
        ),
        angle: 0,
      },
      {
        pos: new THREE.Vector3(
          PROJECTOR2_POSITION.x,
          3.9,
          PROJECTOR2_POSITION.z - 1
        ),
        angle: Math.PI,
      },
    ];

    for (let { pos, angle } of positions) {
      let grp = new THREE.Group();
      grp.position.copy(pos);
      scene.add(grp);

      let esp32 = new THREE.Mesh(esp32_geom, simpleMat);
      grp.add(esp32);

      for (let i = 0; i < 14; i++) {
        let r = 1.3;
        let a = (Math.PI * i) / 13 + angle;
        let x = r * Math.cos(a);
        let z = r * Math.sin(a);
        let y = i % 2 ? -2.5 : -1.5; //(Math.random() * (1-pos.y))
        let a2 = Math.random() * Math.PI * 2;
        x += 0.25 * (Math.random() - 0.5);
        z += 0.25 * (Math.random() - 0.5);
        y += 0.5 * (Math.random() - 0.5);

        let bellpair = new THREE.Group();
        bellpair.position.set(x, y, z);
        bellpair.rotation.y = a2;
        grp.add(bellpair);

        let positions = [
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(x, 0, z),
          new THREE.Vector3(x, y, z),
        ];

        let curve = new THREE.CatmullRomCurve3(
          positions,
          false,
          'catmullrom',
          0.2
        );
        const geometry = new THREE.BufferGeometry().setFromPoints(
          curve.getPoints(32)
        );
        curve.curveType = 'chordal'; //centripetal, chordal and catmullrom.
        curve.mesh = new THREE.Line(
          geometry.clone(),
          new THREE.LineBasicMaterial({
            color: 0x222222,
            opacity: 0.35,
          })
        );
        grp.add(curve.mesh);

        let bell1 = new THREE.Mesh(bell_geom, bellsMat);
        bell1.position.x = -0.01;
        bell1.castShadow = true;
        bellpair.add(bell1);

        let bell2 = new THREE.Mesh(bell_geom, bellsMat);
        bell2.position.x = 0.01;
        bell2.castShadow = true;
        bellpair.add(bell2);
      }
    }
  }

  makeBells();

  
  let MAX_NUM_POINTS = 1000000;
  let pointsCount = MAX_NUM_POINTS / 10;
  let positions = new Float32Array(MAX_NUM_POINTS * 3);
  for (let i = 0; i < MAX_NUM_POINTS * 3; i++) {
    //positions[i] = THREE.MathUtils.randFloatSpread(0.5);
  }
  const pointsGeom = new THREE.BufferGeometry();
  pointsGeom.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  //pointsGeom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));//

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

  // load a resource
  if (1) {
    objLoader.load(
      // resource URL
      RESOURCE_URL_BASE + 'gallery.obj',
      // called when resource is loaded
      function (group) {
        //console.log('gallery', group);
        let mesh = group.children[0];
        mesh.geometry.translate(0, 0, 4);
        mesh.material = wallsMat;
        scene.add(mesh);
      }
    );
    objLoader.load(
      // resource URL
      RESOURCE_URL_BASE + 'gallery_etc.obj',
      // called when resource is loaded
      function (group) {
        //console.log('etc', group);
        let mesh = group.children[0];
        mesh.geometry.translate(0, 0, 4);
        mesh.material = columnsMat;
        scene.add(mesh);
      }
    );
  }

  return scene;
}



app_init(app);

let zkm = loadzkm(app);
app.scene.add(zkm)


// the function called at frame-rate to animate & render the scene:
function animate() {
  const { scene, renderer, camera, pointerControls, move, clock, stats } = app;
  // monitor our FPS:
  stats.begin();
  // compute current timing:
  const dt = clock.getDelta();
  const t = clock.getElapsedTime();

  if (pointerControls.isLocked === true && dt) {
    move.dir.z = move.forward - move.backward;
    move.dir.x = move.right - move.left;
    move.dir.normalize();
    let spd = 3;
    pointerControls.moveRight(move.dir.x * spd * dt);
    pointerControls.moveForward(move.dir.z * spd * dt);

    camera.position.y = EYE_HEIGHT * (1 / (1 + move.crouch));
  }

  renderer.render(scene, camera);
  // monitor our FPS:
  stats.end();
}

// start!
app.renderer.setAnimationLoop(animate);


function cleanup(world) {
  let trash = new Set();

  function cleanupMaterial(material) {
    if (Array.isArray(material)) {
      material.forEach((m) => cleanupMaterial);
    } else if (material.isMaterial) {
      trash.add(material);
      // We have to check if there are any textures on the material
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) {
          trash.add(value);
        }
      }
      // We also have to check if any uniforms reference textures or arrays of textures
      if (material.uniforms) {
        for (const value of Object.values(material.uniforms)) {
          if (value) {
            const uniformValue = value.value;
            if (
              uniformValue instanceof THREE.Texture ||
              Array.isArray(uniformValue)
            ) {
              trash.add(uniformValue);
            }
          }
        }
      }
    }
  }

  world.parent.remove(world);
  world.traverse((o) => {
    //console.log("traverse", o);
    const { geometry, material } = o;
    if (geometry) {
      trash.add(geometry);
    }
    if (material) {
      // material could be an array
      cleanupMaterial(material);
    }
    if (o.isMesh) trash.add(o);
  });
  //console.log("TRASH", trash);
  for (let o of trash) {
    //console.log(o);
    if (o.dispose) o.dispose();
  }
}




//////////////////////////////////////////
// websocket

function websocketConnect(options={}) {
  console.log("connection to ws ")
  let self = Object.assign({
    url: location.origin.replace(/^http/, 'ws'),
    subpath: "/",
    reload_on_disconnect: RELOAD_ON_DISCONNECT,
    log: console.log,
    onmessage: console.log,
    onconnect: () => console.log("ws connected"),
    server: null,
  }, options)


  function connect() {
		self.log(`connecting to ${self.url}${self.subpath}`)
		self.server = new WebSocket(self.url + self.subpath);
		self.server.binaryType = "arraybuffer";

		let reconnect = function() {
			self.server = null
			setTimeout(() => {
				if (self.reload_on_disconnect) {
					location.reload();
				} else {
					if (!self.server) connect()
				}
			}, 3000);
		}

		self.server.onerror = function(event, err) {
			self.log("WebSocket error observed:", err, server.readyState);
			self.server.close();
			reconnect();
		}

		self.server.onopen = () => {
			self.log( `connected to ${self.url}${self.subpath}`)
			self.server.onclose = function(event) {
				self.log("disconnected")
				reconnect();
			}
			self.server.onmessage = (event) => {
        self.onmessage(event.data, self.server)
			}
      
      self.onconnect(self.server)
		}
	}

	connect();

  return self;
}

let server = websocketConnect()