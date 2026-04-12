import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

const canvas = document.querySelector("#webgl-canvas");

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffffff, 9, 26);

const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.1,
  60
);
camera.position.set(-1.3, 1.6, 11.6);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0xffffff, 0);

const ambient = new THREE.AmbientLight(0xffffff, 1.3);
scene.add(ambient);

const hemi = new THREE.HemisphereLight(0xffffff, 0xf1ece8, 1.15);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight(0xffffff, 0.78);
keyLight.position.set(-6, 8, 6);
scene.add(keyLight);

const blushLight = new THREE.PointLight(0xffd5e7, 4, 18, 2);
blushLight.position.set(2.4, 4.8, 2.6);
scene.add(blushLight);

const root = new THREE.Group();
root.position.set(3.55, -1.9, -3.7);
scene.add(root);

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

    float stain(vec2 uv, vec2 center, vec2 radius, float softness) {
      vec2 p = (uv - center) / radius;
      float d = dot(p, p);
      return smoothstep(1.0, softness, d);
    }

    void main() {
      vec2 uv = vUv;
      float drift = uTime * 0.02;

      float a = stain(uv, vec2(0.68, 0.66), vec2(0.23, 0.17), 0.18);
      a *= 0.45 + fbm(uv * 5.0 + vec2(drift, 0.0)) * 0.6;

      float b = stain(uv, vec2(0.58, 0.46), vec2(0.20, 0.16), 0.12);
      b *= 0.4 + fbm(uv * 6.5 + vec2(-drift * 0.7, drift)) * 0.7;

      float c = stain(uv, vec2(0.76, 0.36), vec2(0.15, 0.11), 0.08);
      c *= 0.35 + fbm(uv * 8.0 + 4.0) * 0.8;

      float haze = fbm(uv * 3.8 + vec2(drift * 0.4, 0.0));
      haze = smoothstep(0.48, 0.8, haze) * 0.2;

      vec3 color = vec3(1.0);
      color = mix(color, vec3(0.99, 0.83, 0.90), a * 0.34);
      color = mix(color, vec3(0.96, 0.77, 0.86), b * 0.24);
      color = mix(color, vec3(0.92, 0.74, 0.83), c * 0.18);
      color = mix(color, vec3(0.97, 0.96, 0.97), haze);

      float alpha = a * 0.32 + b * 0.24 + c * 0.16 + haze;
      gl_FragColor = vec4(color, alpha);
    }
  `,
});

const washPlane = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), washMaterial);
washPlane.position.set(1.1, 1.8, -14);
scene.add(washPlane);

const groundWash = new THREE.Mesh(
  new THREE.PlaneGeometry(9, 4),
  new THREE.ShaderMaterial({
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
        float n = fbm(vec2(uv.x * 4.0, uv.y * 11.0 + uTime * 0.02));
        float streak = smoothstep(0.45, 0.85, n);
        float fade = smoothstep(0.0, 0.2, uv.y) * (1.0 - smoothstep(0.62, 1.0, uv.y));
        vec3 color = mix(vec3(0.76, 0.74, 0.74), vec3(0.95, 0.80, 0.88), streak * 0.45);
        gl_FragColor = vec4(color, fade * (0.09 + streak * 0.14));
      }
    `,
  })
);
groundWash.rotation.x = -Math.PI / 2;
groundWash.position.set(0.08, -0.9, 0.3);
root.add(groundWash);

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function v(x, y, z = 0) {
  return new THREE.Vector3(x, y, z);
}

function createCloudTexture({ size = 256, palette, dots = 18 }) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext("2d");

  ctx.clearRect(0, 0, size, size);

  for (let i = 0; i < dots; i += 1) {
    const x = size * (0.25 + Math.random() * 0.5);
    const y = size * (0.22 + Math.random() * 0.56);
    const radius = size * (0.07 + Math.random() * 0.16);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, palette[i % palette.length]);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  return new THREE.CanvasTexture(textureCanvas);
}

function createPetalTexture(size = 220) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext("2d");

  ctx.translate(size / 2, size / 2);
  const gradient = ctx.createLinearGradient(0, -size * 0.28, 0, size * 0.3);
  gradient.addColorStop(0, "rgba(255,243,248,0.98)");
  gradient.addColorStop(0.55, "rgba(248,181,216,0.94)");
  gradient.addColorStop(1, "rgba(219,125,172,0.88)");
  ctx.fillStyle = gradient;

  ctx.beginPath();
  ctx.moveTo(0, -size * 0.26);
  ctx.bezierCurveTo(size * 0.2, -size * 0.15, size * 0.19, size * 0.08, 0, size * 0.28);
  ctx.bezierCurveTo(-size * 0.19, size * 0.08, -size * 0.2, -size * 0.15, 0, -size * 0.26);
  ctx.fill();

  ctx.strokeStyle = "rgba(112,53,79,0.18)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.18);
  ctx.lineTo(0, size * 0.14);
  ctx.stroke();

  return new THREE.CanvasTexture(textureCanvas);
}

function createLeafTexture(size = 220) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext("2d");

  ctx.translate(size / 2, size / 2);
  const gradient = ctx.createLinearGradient(0, -size * 0.24, 0, size * 0.22);
  gradient.addColorStop(0, "rgba(229,210,181,0.95)");
  gradient.addColorStop(1, "rgba(168,142,110,0.92)");
  ctx.fillStyle = gradient;

  ctx.beginPath();
  ctx.moveTo(0, -size * 0.24);
  ctx.quadraticCurveTo(size * 0.18, -size * 0.02, 0, size * 0.26);
  ctx.quadraticCurveTo(-size * 0.18, -size * 0.02, 0, -size * 0.24);
  ctx.fill();

  ctx.strokeStyle = "rgba(108,86,56,0.22)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.14);
  ctx.lineTo(0, size * 0.14);
  ctx.stroke();

  return new THREE.CanvasTexture(textureCanvas);
}

const blossomTexture = createCloudTexture({
  palette: [
    "rgba(255, 169, 211, 0.42)",
    "rgba(240, 132, 188, 0.28)",
    "rgba(185, 110, 145, 0.16)",
  ],
  dots: 22,
});

const fogTexture = createCloudTexture({
  palette: [
    "rgba(255,255,255,0.58)",
    "rgba(247,233,238,0.34)",
    "rgba(244,226,232,0.18)",
  ],
  dots: 12,
});

const petalTexture = createPetalTexture();
const leafTexture = createLeafTexture();

const barkMaterial = new THREE.MeshBasicMaterial({
  color: 0x1f1718,
});

const twigMaterial = new THREE.LineBasicMaterial({
  color: 0x22191a,
  transparent: true,
  opacity: 0.88,
});

const branchAnchors = [];
const branchMidpoints = [];

function addBranch(points, radius) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, 18, radius, 8, false);
  const mesh = new THREE.Mesh(geometry, barkMaterial);
  root.add(mesh);
  branchAnchors.push(points[points.length - 1].clone());
  branchMidpoints.push(points[Math.floor(points.length / 2)].clone());
}

function addTwig(points) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, twigMaterial);
  root.add(line);
}

addBranch([v(0, -1.85), v(-0.05, -0.7), v(-0.42, 0.8, 0.06), v(-1.08, 2.65, 0.12)], 0.17);
addBranch([v(0, -1.85), v(0.12, -0.9, -0.02), v(0.52, 0.7, -0.04), v(1.18, 2.55, -0.06)], 0.17);
addBranch([v(-1.04, 2.62, 0.12), v(-1.68, 3.5, 0.16), v(-2.32, 4.52, 0.18)], 0.075);
addBranch([v(-0.92, 2.8, 0.1), v(-0.36, 3.74, 0.16), v(0.22, 4.88, 0.2)], 0.07);
addBranch([v(1.1, 2.48, -0.06), v(1.72, 3.42, -0.08), v(2.42, 4.36, -0.12)], 0.075);
addBranch([v(1.24, 2.62, -0.06), v(1.88, 3.02, -0.12), v(2.92, 3.86, -0.18)], 0.06);
addBranch([v(0.88, 2.82, -0.02), v(0.72, 3.84, 0.04), v(0.58, 4.92, 0.08)], 0.065);

addTwig([v(-2.25, 4.5, 0.18), v(-2.72, 4.96, 0.24), v(-2.98, 5.28, 0.3)]);
addTwig([v(0.24, 4.84, 0.2), v(0.56, 5.22, 0.24), v(0.84, 5.54, 0.28)]);
addTwig([v(2.4, 4.33, -0.12), v(2.86, 4.74, -0.16), v(3.12, 5.02, -0.2)]);
addTwig([v(2.9, 3.83, -0.18), v(3.2, 4.14, -0.22), v(3.42, 4.42, -0.25)]);

const blossomMaterials = [
  new THREE.SpriteMaterial({
    map: blossomTexture,
    color: 0xffb7d9,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  }),
  new THREE.SpriteMaterial({
    map: blossomTexture,
    color: 0xdc7ba8,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
  }),
];

const blossomGroup = new THREE.Group();
root.add(blossomGroup);

branchAnchors.forEach((anchor, index) => {
  const clusterCount = 14 + (index % 5);
  for (let i = 0; i < clusterCount; i += 1) {
    const sprite = new THREE.Sprite(blossomMaterials[i % blossomMaterials.length]);
    sprite.position.copy(anchor).add(
      new THREE.Vector3(
        randomBetween(-0.58, 0.58),
        randomBetween(-0.32, 0.44),
        randomBetween(-0.18, 0.18)
      )
    );
    const scale = randomBetween(0.48, 0.92);
    sprite.scale.set(scale, scale * randomBetween(0.84, 1.16), 1);
    blossomGroup.add(sprite);
  }
});

const splatterPositions = [];
const splatterColors = [];
const splatterPalette = [new THREE.Color(0xff4d8d), new THREE.Color(0xff8ec6), new THREE.Color(0xb85177)];

branchMidpoints.forEach((anchor) => {
  for (let i = 0; i < 32; i += 1) {
    splatterPositions.push(
      anchor.x + randomBetween(-1.0, 1.0),
      anchor.y + randomBetween(-0.75, 0.8),
      anchor.z + randomBetween(-0.22, 0.22)
    );
    const color = splatterPalette[i % splatterPalette.length];
    splatterColors.push(color.r, color.g, color.b);
  }
});

const splatterGeometry = new THREE.BufferGeometry();
splatterGeometry.setAttribute("position", new THREE.Float32BufferAttribute(splatterPositions, 3));
splatterGeometry.setAttribute("color", new THREE.Float32BufferAttribute(splatterColors, 3));

const splatter = new THREE.Points(
  splatterGeometry,
  new THREE.PointsMaterial({
    size: 0.055,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  })
);
root.add(splatter);

const hazeGroup = new THREE.Group();
scene.add(hazeGroup);

function addHaze(x, y, z, scale, color, opacity) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: fogTexture,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    })
  );
  sprite.position.set(x, y, z);
  sprite.scale.set(scale, scale * 0.66, 1);
  sprite.userData.baseX = x;
  sprite.userData.baseOpacity = opacity;
  sprite.userData.seed = randomBetween(0, Math.PI * 2);
  hazeGroup.add(sprite);
}

addHaze(3.8, 2.6, -8.4, 8.3, 0xfbe8f0, 0.24);
addHaze(4.6, 0.7, -5.4, 7.1, 0xf7edf0, 0.18);
addHaze(2.0, -0.2, -4.1, 5.8, 0xffffff, 0.17);

const petalGeometry = new THREE.PlaneGeometry(0.23, 0.29);
const petalMaterial = new THREE.MeshBasicMaterial({
  map: petalTexture,
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
});

const leafMaterial = new THREE.MeshBasicMaterial({
  map: leafTexture,
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
});

const driftingThings = [];

function createDrifter(material, count, spread, fallRange, scaleRange) {
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(petalGeometry, material);
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
      minX: spread[0],
      maxX: spread[1],
      minY: spread[2],
      maxY: spread[3],
      minZ: spread[4],
      maxZ: spread[5],
      fallRange,
      scaleRange,
    };

    resetDrifter(state, true);
    mesh.rotation.set(
      randomBetween(0, Math.PI),
      randomBetween(0, Math.PI),
      randomBetween(0, Math.PI)
    );
    scene.add(mesh);
    driftingThings.push(state);
  }
}

function resetDrifter(state, initial) {
  state.x = randomBetween(state.minX, state.maxX);
  state.y = initial ? randomBetween(state.minY, state.maxY) : randomBetween(state.maxY - 1.2, state.maxY + 1.6);
  state.z = randomBetween(state.minZ, state.maxZ);
  state.scale = randomBetween(state.scaleRange[0], state.scaleRange[1]);
  state.fall = randomBetween(state.fallRange[0], state.fallRange[1]);
  state.drift = randomBetween(0.12, 0.38);
  state.sway = randomBetween(0.6, 1.9);
  state.phase = randomBetween(0, Math.PI * 2);
  state.spinX = randomBetween(-1.25, 1.25);
  state.spinY = randomBetween(-1.15, 1.15);
  state.spinZ = randomBetween(-1.5, 1.5);
  state.mesh.position.set(state.x, state.y, state.z);
  state.mesh.scale.setScalar(state.scale);
}

createDrifter(petalMaterial, 120, [-8.5, 7.8, -0.2, 8.4, -10.5, 2.6], [0.26, 0.68], [0.46, 1.12]);
createDrifter(leafMaterial, 24, [-8.2, 7.2, 0.8, 8.6, -9.8, 2.2], [0.18, 0.42], [0.34, 0.72]);

let mouseX = 0;
let mouseY = 0;
let scrollTarget = 0;

window.addEventListener("pointermove", (event) => {
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  mouseY = (event.clientY / window.innerHeight) * 2 - 1;
});

window.addEventListener("scroll", () => {
  scrollTarget = Math.min(window.scrollY / window.innerHeight, 2.4);
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
  groundWash.material.uniforms.uTime.value = elapsed;

  root.rotation.z = Math.sin(elapsed * 0.12) * 0.016;
  root.rotation.y = THREE.MathUtils.lerp(root.rotation.y, mouseX * 0.04, 0.03);
  root.position.x = THREE.MathUtils.lerp(root.position.x, 3.55 + mouseX * 0.32, 0.025);

  hazeGroup.children.forEach((sprite, index) => {
    sprite.position.x = sprite.userData.baseX + Math.sin(elapsed * 0.16 + sprite.userData.seed) * 0.14;
    sprite.material.opacity = sprite.userData.baseOpacity + Math.sin(elapsed * 0.22 + index) * 0.02;
  });

  driftingThings.forEach((state) => {
    state.y -= state.fall * delta;
    state.x += Math.sin(elapsed * state.sway + state.phase) * state.drift * delta;
    state.z += Math.cos(elapsed * 0.32 + state.phase) * 0.008;

    state.mesh.position.set(state.x, state.y, state.z);
    state.mesh.rotation.x += state.spinX * delta * 0.7;
    state.mesh.rotation.y += state.spinY * delta * 0.7;
    state.mesh.rotation.z += state.spinZ * delta * 0.7;

    if (state.y < -2.9 || state.x < state.minX - 1.2 || state.x > state.maxX + 1.2) {
      resetDrifter(state, false);
    }
  });

  camera.position.x = THREE.MathUtils.lerp(camera.position.x, -1.3 + mouseX * 0.28, 0.035);
  camera.position.y = THREE.MathUtils.lerp(
    camera.position.y,
    1.6 + -mouseY * 0.15 + scrollTarget * 0.06,
    0.035
  );
  camera.lookAt(2.2, 1.0 + scrollTarget * 0.03, -3.8);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
