// The 3D coin renderer, extracted from the Clickflip extension and rebuilt on top of
// named three.js APIs. It owns a WebGL scene with a single quarter, studio lighting from
// a RoomEnvironment, and a soft contact shadow. `flip(seed)` runs the physics from
// ./physics.js and resolves with "Heads" or "Tails" once the coin settles.

import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  Vector3,
  Color,
  PMREMGenerator,
  TextureLoader,
  MeshStandardMaterial,
  ShadowMaterial,
  Group,
  Mesh,
  CylinderGeometry,
  CircleGeometry,
  PlaneGeometry,
  HemisphereLight,
  DirectionalLight,
  ACESFilmicToneMapping,
  SRGBColorSpace,
  PCFShadowMap,
  RepeatWrapping,
  ClampToEdgeWrapping,
  Timer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { initSim, advance, COIN_RADIUS, COIN_THICKNESS, HALF_THICKNESS } from "./physics.js";

const HALF_PI = Math.PI / 2;

const FACE_REPEAT = 0.935; // trims the face texture in a touch from the geometry edge
const EDGE_REPEAT = 2; // times the reeded edge texture wraps around the rim
const FACE_TINT = 0xd9dadc;
const EDGE_TINT = 0xd9dadc;
const FACE_BUMP = 2.2;

export class Coin {
  constructor(el, urlFor) {
    this.el = el;
    this.raf = 0;
    this.timer = new Timer();
    this.sim = null;
    this.parityOffset = 0; // 0 → Heads up at rest, π → Tails up
    this.disposers = [];
    this.landResolve = null;

    // --- renderer ---
    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    el.appendChild(renderer.domElement);
    this.renderer = renderer;

    // --- scene & camera ---
    const scene = new Scene();
    this.scene = scene;

    const camera = new PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 4.1, 6.9);
    const lookTarget = new Vector3(0, 0.62, 0);
    camera.lookAt(lookTarget);
    const viewDir = camera.position.clone().sub(lookTarget).normalize();
    const fitWidth = 4.73;
    const fitHeight = 3.6;
    this.camera = camera;

    // --- image-based lighting from a studio room ---
    const pmrem = new PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    // --- textures & materials ---
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const loader = new TextureLoader();
    const loadColor = (name) => {
      const t = loader.load(urlFor(name));
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = maxAniso;
      return t;
    };
    const loadLinear = (name) => {
      const t = loader.load(urlFor(name));
      t.anisotropy = maxAniso;
      return t;
    };
    const makeFaceMaterial = () =>
      new MeshStandardMaterial({
        bumpScale: FACE_BUMP,
        metalness: 1,
        roughness: 0.34,
        envMapIntensity: 0.85,
        alphaTest: 0.5,
      });

    const obverseMat = makeFaceMaterial();
    const reverseMat = makeFaceMaterial();
    const edgeMat = new MeshStandardMaterial({
      bumpScale: 4,
      metalness: 1,
      roughness: 0.36,
      envMapIntensity: 0.9,
    });

    const obverseMap = loadColor("quarter-obverse.png");
    const reverseMap = loadColor("quarter-reverse.png");
    const obverseBump = loadLinear("quarter-obverse-bump.png");
    const reverseBump = loadLinear("quarter-reverse-bump.png");
    [obverseMap, reverseMap, obverseBump, reverseBump].forEach((t) => {
      t.center.set(0.5, 0.5);
      t.repeat.set(FACE_REPEAT, FACE_REPEAT);
    });

    const edgeMap = loadColor("quarter-edge.png");
    const edgeBump = loadLinear("quarter-edge-bump.png");
    [edgeMap, edgeBump].forEach((t) => {
      t.wrapS = RepeatWrapping;
      t.wrapT = ClampToEdgeWrapping;
      t.repeat.set(EDGE_REPEAT, 1);
    });

    obverseMat.map = obverseMap;
    obverseMat.bumpMap = obverseBump;
    obverseMat.color = new Color(FACE_TINT);
    reverseMat.map = reverseMap;
    reverseMat.bumpMap = reverseBump;
    reverseMat.color = new Color(FACE_TINT);
    edgeMat.map = edgeMap;
    edgeMat.bumpMap = edgeBump;
    edgeMat.color = new Color(EDGE_TINT);

    // --- coin geometry: an edge cylinder capped by two textured face discs ---
    const coin = new Group();
    const edgeGeo = new CylinderGeometry(
      COIN_RADIUS,
      COIN_RADIUS,
      COIN_THICKNESS,
      256,
      1,
      true, // open-ended: the discs close it off
    );
    const edgeMesh = new Mesh(edgeGeo, edgeMat);
    edgeMesh.castShadow = true;
    coin.add(edgeMesh);

    const faceGeo = new CircleGeometry(COIN_RADIUS, 128);
    const topFace = new Mesh(faceGeo, obverseMat); // Heads
    topFace.rotation.x = -HALF_PI;
    topFace.position.y = COIN_THICKNESS / 2 + 5e-4;
    topFace.castShadow = true;
    coin.add(topFace);

    const bottomFace = new Mesh(faceGeo, reverseMat); // Tails
    bottomFace.rotation.x = HALF_PI;
    bottomFace.position.y = -COIN_THICKNESS / 2 - 5e-4;
    bottomFace.castShadow = true;
    coin.add(bottomFace);

    coin.position.y = HALF_THICKNESS;
    coin.rotation.x = this.parityOffset;
    scene.add(coin);
    this.coin = coin;

    // --- lights ---
    scene.add(new HemisphereLight(0xffffff, 0x9a9ea8, 0.42));

    const keyLight = new DirectionalLight(0xfff7ee, 2.5);
    keyLight.position.set(-4, 5.4, 3);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(3072, 3072);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 30;
    keyLight.shadow.camera.left = -7.07;
    keyLight.shadow.camera.right = 7.07;
    keyLight.shadow.camera.top = 7.07;
    keyLight.shadow.camera.bottom = -7.07;
    keyLight.shadow.bias = -2e-4;
    keyLight.shadow.normalBias = 0.006;
    keyLight.shadow.radius = 3.5;
    scene.add(keyLight);

    const fillLight = new DirectionalLight(0xbfd4ff, 0.45);
    fillLight.position.set(5, 2.5, 4);
    scene.add(fillLight);

    const rimLight = new DirectionalLight(0xffffff, 0.8);
    rimLight.position.set(2, 3, -6);
    scene.add(rimLight);

    // --- soft contact shadow catcher ---
    const shadowCatcher = new Mesh(
      new PlaneGeometry(60, 60),
      new ShadowMaterial({ opacity: 0.26 }),
    );
    shadowCatcher.rotation.x = -HALF_PI;
    shadowCatcher.receiveShadow = true;
    scene.add(shadowCatcher);

    // --- responsive framing: keep the coin fully in view at any aspect ratio ---
    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      const halfFov = Math.tan(((camera.fov * Math.PI) / 180) / 2);
      const distForWidth = fitWidth / 2 / (halfFov * camera.aspect);
      const distForHeight = fitHeight / 2 / halfFov;
      camera.position
        .copy(lookTarget)
        .addScaledVector(viewDir, Math.max(distForHeight, distForWidth));
      camera.lookAt(lookTarget);
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(el);

    // --- render loop ---
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.timer.update();
      const dt = Math.min(this.timer.getDelta(), 1 / 30);
      this.update(dt);
      renderer.render(scene, camera);
    };
    loop();

    this.disposers.push(() => {
      cancelAnimationFrame(this.raf);
      resizeObserver.disconnect();
      [
        obverseMap,
        reverseMap,
        obverseBump,
        reverseBump,
        edgeMap,
        edgeBump,
        envTex,
      ].forEach((t) => t.dispose());
      [obverseMat, reverseMat, edgeMat, shadowCatcher.material].forEach((m) =>
        m.dispose(),
      );
      [edgeGeo, faceGeo, shadowCatcher.geometry].forEach((g) => g.dispose());
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) {
        el.removeChild(renderer.domElement);
      }
    });
  }

  get busy() {
    return this.sim !== null;
  }

  // Start a toss. Resolves with "Heads" or "Tails" once the coin comes to rest.
  flip(seed) {
    return new Promise((resolve) => {
      this.landResolve = resolve;
      this.sim = initSim(seed, 0, 0);
    });
  }

  update(dt) {
    if (!this.sim) return;
    advance(this.sim, dt);
    const s = this.sim;
    this.coin.position.set(s.posX, s.posY, s.posZ);
    this.coin.rotation.x = s.rotX + this.parityOffset;
    this.coin.rotation.y = 0;

    if (s.done) {
      const finalRot = s.rotX + this.parityOffset;
      const parity = ((Math.round(finalRot / Math.PI) % 2) + 2) % 2;
      this.parityOffset = parity * Math.PI;
      this.coin.rotation.x = this.parityOffset;
      this.sim = null;
      const resolve = this.landResolve;
      this.landResolve = null;
      resolve?.(parity === 0 ? "Heads" : "Tails");
    }
  }

  destroy() {
    this.disposers.forEach((d) => d());
    this.disposers = [];
  }
}
