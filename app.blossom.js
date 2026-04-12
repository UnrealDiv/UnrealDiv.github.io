import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

const canvas = document.querySelector("#webgl-canvas");

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf7f2ea, 10, 28);

const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.1,
  60
);
camera.position.set(-1.6, 1.7, 12.2);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.setClearColor(0xffffff, 0);

const root = new THREE.Group();
root.position.set(3.5, -1.85, -4.1);
scene.add(root);

const ambient = new THREE.AmbientLight(0xffffff, 1.45);
scene.add(ambient);

const hemi = new THREE.HemisphereLight(0xfff7f6, 0xe7dbd0, 1.4);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
keyLight.position.set(-5, 7, 8);
scene.add(keyLight);

const blushLight = new THREE.PointLight(0xffd6e7, 8, 20, 2);
blushLight.position.set(3, 5, 2);
scene.add(blushLight);

const noiseGLSL = /* glsl */ `
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }
`;

const washMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: {
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;
    ${noiseGLSL}

    float blob(vec2 uv, vec2 center, vec2 scale, float feather) {
      vec2 p = (uv - center) / scale;
      float d = dot(p, p);
      return smoothstep(1.0, feather, d);
    }

    void main() {
      vec2 uv = vUv;
      float drift = uTime * 0.02;

      float blushA = blob(uv, vec2(0.68, 0.64), vec2(0.22, 0.16), 0.18);
      blushA *= 0.55 + fbm(uv * 5.0 + vec2(drift, 0.0)) * 0.65;

      float blushB = blob(uv, vec2(0.58, 0.50), vec2(0.20, 0.18), 0.12);
      blushB *= 0.45 + fbm(uv * 6.0 + vec2(-drift * 0.7, drift)) * 0.7;

      float blushC = blob(uv, vec2(0.78, 0.42), vec2(0.16, 0.12), 0.08);
      blushC *= 0.45 + fbm(uv * 8.0 + 4.0) * 0.8;

      float mist = fbm(uv * 3.8 + vec2(drift * 0.6, 0.0));
      mist = smoothstep(0.45, 0.76, mist) * 0.24;

      vec3 color = vec3(1.0);
      color = mix(color, vec3(0.97, 0.76, 0.85), blushA * 0.32);
      color = mix(color, vec3(0.92, 0.70, 0.81), blushB * 0.24);
      color = mix(color, vec3(0.86, 0.64, 0.76), blushC * 0.18);
      color = mix(color, vec3(0.98, 0.93, 0.94), mist);

      float alpha = (blushA * 0.34) + (blushB * 0.28) + (blushC * 0.16) + mist;
      gl_FragColor = vec4(color, alpha);
    }
  `,
});

const washPlane = new THREE.Mesh(new THREE.PlaneGeometry(28, 18), washMaterial);
washPlane.position.set(0.6, 2.0, -14);
scene.add(washPlane);

const reflectionMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: {
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;
    ${noiseGLSL}

    void main() {
      vec2 uv = vUv;
      float wash = fbm(vec2(uv.x * 4.0, uv.y * 14.0 + uTime * 0.03));
      float streak = smoothstep(0.46, 0.86, wash);
      float fade = smoothstep(0.0, 0.18, uv.y) * (1.0 - smoothstep(0.68, 1.0, uv.y));
      vec3 color = mix(vec3(0.68, 0.66, 0.64), vec3(0.93, 0.77, 0.86), streak * 0.48);
      gl_FragColor = vec4(color, fade * (0.12 + streak * 0.18));
    }
  `,
});

const reflection = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 4.2), reflectionMaterial);
reflection.rotation.x = -Math.PI / 2;
reflection.position.set(0.05, -0.92, 0.45);
root.add(reflection);

function createSoftTexture({ size = 256, palette, dots = 14 }) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const context = textureCanvas.getContext("2d");

  context.clearRect(0, 0, size, size);

  for (let i = 0; i < dots; i += 1) {
    const x = size * (0.28 + Math.random() * 0.44);
    const y = size * (0.28 + Math.random() * 0.44);
    const radius = size * (0.07 + Math.random() * 0.16);
    const color = palette[i % palette.length];
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  return new THREE.CanvasTexture(textureCanvas);
}

function createPetalTexture(size = 220) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const context = textureCanvas.getContext("2d");

  context.translate(size / 2, size / 2);
  const gradient = context.createLinearGradient(0, -size * 0.28, 0, size * 0.3);
  gradient.addColorStop(0, "rgba(255, 240, 247, 0.98)");
  gradient.addColorStop(0.55, "rgba(252, 180, 217, 0.94)");
  gradient.addColorStop(1, "rgba(220, 123, 170, 0.88)");
  context.fillStyle = gradient;

  context.beginPath();
  context.moveTo(0, -size * 0.26);
  context.bezierCurveTo(size * 0.22, -size * 0.14, size * 0.18, size * 0.08, 0, size * 0.28);
  context.bezierCurveTo(-size * 0.18, size * 0.08, -size * 0.22, -size * 0.14, 0, -size * 0.26);
  context.fill();

  context.strokeStyle = "rgba(135, 56, 93, 0.18)";
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(0, -size * 0.18);
  context.lineTo(0, size * 0.14);
  context.stroke();

  return new THREE.CanvasTexture(textureCanvas);
}

const blossomTexture = createSoftTexture({
  palette: [
    "rgba(255, 153, 207, 0.42)",
    "rgba(246, 109, 177, 0.3)",
    "rgba(176, 100, 137, 0.18)",
  ],
  dots: 20,
});

const mistTexture = createSoftTexture({
  palette: [
    "rgba(255, 255, 255, 0.5)",
    "rgba(255, 227, 237, 0.28)",
    "rgba(240, 223, 232, 0.18)",
  ],
  dots: 10,
});

const petalTexture = createPetalTexture();

const blossomMaterials = [
  new THREE.SpriteMaterial({
    map: blossomTexture,
    color: 0xffaed4,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  }),
  new THREE.SpriteMaterial({
    map: blossomTexture,
    color: 0xd07ca8,
    transparent: true,
    opacity: 0.74,
    depthWrite: false,
  }),
];

const barkMaterial = new THREE.MeshStandardMaterial({
  color: 0x3d2a27,
  roughness: 0.92,
  metalness: 0.02,
});

const twigMaterial = new THREE.LineBasicMaterial({
  color: 0x4c3430,
  transparent: true,
  opacity: 0.72,
});

const treeGroup = new THREE.Group();
root.add(treeGroup);

const branchAnchors = [];
const splatterSeeds = [];

function v(x, y, z = 0) {
  return new THREE.Vector3(x, y, z);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function addBranch(points, radius) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, 26, radius, 10, false);
  const mesh = new THREE.Mesh(geometry, barkMaterial);
  treeGroup.add(mesh);
  branchAnchors.push(points[points.length - 1].clone());
  splatterSeeds.push(points[Math.floor(points.length / 2)].clone());
}

function addTwig(points) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, twigMaterial);
  treeGroup.add(line);
}

addBranch([v(0, -1.8), v(-0.08, -0.7, 0.04), v(-0.42, 0.65, 0.08), v(-1.08, 2.35, 0.12)], 0.18);
addBranch([v(0, -1.8), v(0.12, -0.85, -0.03), v(0.56, 0.58, -0.04), v(1.12, 2.28, -0.06)], 0.18);

addBranch([v(-1.04, 2.28, 0.1), v(-1.68, 3.15, 0.14), v(-2.25, 4.1, 0.18)], 0.082);
addBranch([v(-0.98, 2.45, 0.08), v(-0.42, 3.28, 0.16), v(0.18, 4.38, 0.22)], 0.074);
addBranch([v(-1.26, 2.55, 0.11), v(-1.04, 3.56, 0.14), v(-0.58, 4.7, 0.2)], 0.06);

addBranch([v(1.05, 2.25, -0.06), v(1.62, 3.18, -0.08), v(2.28, 4.18, -0.12)], 0.082);
addBranch([v(1.12, 2.34, -0.04), v(0.82, 3.42, 0.06), v(0.66, 4.62, 0.1)], 0.074);
addBranch([v(1.28, 2.48, -0.04), v(2.08, 3.06, -0.12), v(2.88, 3.76, -0.18)], 0.06);

addTwig([v(-2.08, 4.05, 0.18), v(-2.45, 4.62, 0.24), v(-2.7, 5.0, 0.28)]);
addTwig([v(-0.54, 4.64, 0.2), v(-0.36, 5.12, 0.24), v(-0.16, 5.44, 0.3)]);
addTwig([v(0.18, 4.34, 0.22), v(0.5, 4.92, 0.26), v(0.78, 5.28, 0.32)]);
addTwig([v(2.22, 4.12, -0.12), v(2.65, 4.5, -0.16), v(2.98, 4.84, -0.18)]);
addTwig([v(2.82, 3.72, -0.18), v(3.12, 4.05, -0.22), v(3.34, 4.34, -0.24)]);

const blossomGroup = new THREE.Group();
treeGroup.add(blossomGroup);

branchAnchors.forEach((anchor, index) => {
  const clusterCount = 13 + (index % 4);
  for (let i = 0; i < clusterCount; i += 1) {
    const sprite = new THREE.Sprite(blossomMaterials[i % blossomMaterials.length]);
    sprite.position.copy(anchor).add(
      new THREE.Vector3(
        randomBetween(-0.55, 0.55),
        randomBetween(-0.32, 0.4),
        randomBetween(-0.22, 0.22)
      )
    );
    const scale = randomBetween(0.42, 0.9);
    sprite.scale.set(scale, scale * randomBetween(0.88, 1.18), 1);
    blossomGroup.add(sprite);
  }
});

const splatterPositions = [];
const splatterColors = [];
const splatterColorA = new THREE.Color(0xff5c9e);
const splatterColorB = new THREE.Color(0xc34c78);
const splatterColorC = new THREE.Color(0xff8fc8);

splatterSeeds.forEach((anchor) => {
  for (let i = 0; i < 32; i += 1) {
    splatterPositions.push(
      anchor.x + randomBetween(-1.15, 1.15),
      anchor.y + randomBetween(-0.75, 0.82),
      anchor.z + randomBetween(-0.28, 0.28)
    );

    const color = [splatterColorA, splatterColorB, splatterColorC][i % 3];
    splatterColors.push(color.r, color.g, color.b);
  }
});

const splatterGeometry = new THREE.BufferGeometry();
splatterGeometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(splatterPositions, 3)
);
splatterGeometry.setAttribute(
  "color",
  new THREE.Float32BufferAttribute(splatterColors, 3)
);

const splatter = new THREE.Points(
  splatterGeometry,
  new THREE.PointsMaterial({
    size: 0.065,
    vertexColors: true,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  })
);
treeGroup.add(splatter);

const mistGroup = new THREE.Group();
scene.add(mistGroup);

function addMist(x, y, z, scale, color, opacity) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: mistTexture,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    })
  );
  sprite.position.set(x, y, z);
  sprite.scale.set(scale, scale * 0.68, 1);
  sprite.userData.baseX = x;
  sprite.userData.baseOpacity = opacity;
  sprite.userData.floatSeed = randomBetween(0, Math.PI * 2);
  mistGroup.add(sprite);
}

addMist(3.8, 2.5, -8.4, 8.5, 0xf8dbe7, 0.24);
addMist(4.6, 0.5, -5.8, 7.2, 0xf5dfe7, 0.18);
addMist(2.0, -0.4, -4.4, 6.0, 0xffffff, 0.18);

const petalMaterial = new THREE.MeshBasicMaterial({
  map: petalTexture,
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
});

const petalGeometry = new THREE.PlaneGeometry(0.23, 0.29);
const petals = [];

function resetPetal(state, initial) {
  state.x = randomBetween(-8.2, 7.2);
  state.y = initial ? randomBetween(-0.2, 8.2) : randomBetween(6.5, 9.2);
  state.z = randomBetween(-10.5, 2.5);
  state.scale = randomBetween(0.45, 1.15);
  state.fall = randomBetween(0.28, 0.72);
  state.drift = randomBetween(0.12, 0.4);
  state.sway = randomBetween(0.7, 1.9);
  state.phase = randomBetween(0, Math.PI * 2);
  state.spinX = randomBetween(-1.3, 1.3);
  state.spinY = randomBetween(-1.1, 1.1);
  state.spinZ = randomBetween(-1.5, 1.5);
}

for (let i = 0; i < 140; i += 1) {
  const mesh = new THREE.Mesh(petalGeometry, petalMaterial);
  const state = {
    mesh,
    x: 0,
    y: 0,
    z: 0,
    scale: 1,
    fall: 0,
    drift: 0,
    sway: 0,
    phase: 0,
    spinX: 0,
    spinY: 0,
    spinZ: 0,
  };

  resetPetal(state, true);
  mesh.position.set(state.x, state.y, state.z);
  mesh.rotation.set(
    randomBetween(0, Math.PI),
    randomBetween(0, Math.PI),
    randomBetween(0, Math.PI)
  );
  mesh.scale.setScalar(state.scale);
  scene.add(mesh);
  petals.push(state);
}

let mouseX = 0;
let mouseY = 0;
let scrollTarget = 0;

window.addEventListener("pointermove", (event) => {
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  mouseY = (event.clientY / window.innerHeight) * 2 - 1;
});

window.addEventListener("scroll", () => {
  scrollTarget = Math.min(window.scrollY / window.innerHeight, 2.6);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

const clock = new THREE.Clock();

function animate() {
  const delta = Math.min(clock.getDelta(), 0.033);
  const elapsed = clock.elapsedTime;

  washMaterial.uniforms.uTime.value = elapsed;
  reflectionMaterial.uniforms.uTime.value = elapsed;

  root.rotation.z = Math.sin(elapsed * 0.14) * 0.02;
  root.rotation.y = THREE.MathUtils.lerp(root.rotation.y, mouseX * 0.05, 0.03);
  root.position.x = THREE.MathUtils.lerp(root.position.x, 3.5 + mouseX * 0.35, 0.025);

  mistGroup.children.forEach((sprite, index) => {
    sprite.position.x = sprite.userData.baseX + Math.sin(elapsed * 0.18 + sprite.userData.floatSeed) * 0.16;
    sprite.material.opacity = sprite.userData.baseOpacity + Math.sin(elapsed * 0.22 + index) * 0.02;
  });

  petals.forEach((state) => {
    state.y -= state.fall * delta;
    state.x += Math.sin(elapsed * state.sway + state.phase) * state.drift * delta;
    state.z += Math.cos(elapsed * 0.3 + state.phase) * 0.008;

    state.mesh.position.set(state.x, state.y, state.z);
    state.mesh.rotation.x += state.spinX * delta * 0.7;
    state.mesh.rotation.y += state.spinY * delta * 0.7;
    state.mesh.rotation.z += state.spinZ * delta * 0.7;

    if (state.y < -2.8 || state.x < -9.2 || state.x > 8.8) {
      resetPetal(state, false);
      state.mesh.scale.setScalar(state.scale);
    }
  });

  camera.position.x = THREE.MathUtils.lerp(camera.position.x, -1.6 + mouseX * 0.35, 0.035);
  camera.position.y = THREE.MathUtils.lerp(
    camera.position.y,
    1.7 + -mouseY * 0.18 + scrollTarget * 0.08,
    0.035
  );
  camera.lookAt(2.2, 1.0 + scrollTarget * 0.03, -3.8);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
