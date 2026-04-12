import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

const canvas = document.querySelector("#webgl-canvas");

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x120815, 0.055);

const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.1,
  90
);
camera.position.set(0, 1.35, 8.8);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.setClearColor(0x07040b, 1);

const world = new THREE.Group();
scene.add(world);

const ambientLight = new THREE.AmbientLight(0xf4dff0, 1.2);
scene.add(ambientLight);

const hemisphere = new THREE.HemisphereLight(0xf9d4e9, 0x170c19, 1.9);
scene.add(hemisphere);

const dawnLight = new THREE.DirectionalLight(0xf8b6d7, 1.35);
dawnLight.position.set(-4, 4, -6);
scene.add(dawnLight);

const coolFill = new THREE.PointLight(0xa58cff, 8, 20, 2);
coolFill.position.set(5, 3, 3);
scene.add(coolFill);

const warmLantern = new THREE.PointLight(0xffd4b0, 10, 18, 2);
warmLantern.position.set(0, -0.4, -7.5);
scene.add(warmLantern);

const noiseGLSL = /* glsl */ `
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p *= 2.02;
      amplitude *= 0.5;
    }
    return value;
  }
`;

const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vWorldPosition;

    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    varying vec3 vWorldPosition;
    ${noiseGLSL}

    void main() {
      vec3 dir = normalize(vWorldPosition);
      float height = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

      vec3 top = vec3(0.06, 0.03, 0.12);
      vec3 mid = vec3(0.23, 0.11, 0.24);
      vec3 horizon = vec3(0.93, 0.70, 0.82);
      vec3 sky = mix(horizon, mid, smoothstep(0.06, 0.62, height));
      sky = mix(sky, top, smoothstep(0.55, 1.0, height));

      vec3 sunDir = normalize(vec3(-0.22, 0.12, -1.0));
      float sun = pow(max(dot(dir, sunDir), 0.0), 42.0);
      float bloom = pow(max(dot(dir, sunDir), 0.0), 6.0);
      sky += bloom * vec3(0.44, 0.12, 0.20);
      sky += sun * vec3(0.95, 0.53, 0.72) * 1.2;

      vec2 cloudUv = dir.xz * 1.8 + vec2(uTime * 0.01, 0.0);
      float cloud = fbm(cloudUv + fbm(cloudUv * 1.7) * 0.45);
      float cloudMask = smoothstep(0.48, 0.78, cloud) * (1.0 - smoothstep(0.40, 0.95, height));
      sky = mix(sky, sky + vec3(0.16, 0.11, 0.19), cloudMask * 0.22);

      float haze = smoothstep(0.0, 0.42, 1.0 - abs(dir.y + 0.08));
      sky += haze * vec3(0.15, 0.06, 0.11) * 0.28;

      gl_FragColor = vec4(sky, 1.0);
    }
  `,
});

const sky = new THREE.Mesh(new THREE.SphereGeometry(48, 64, 64), skyMaterial);
scene.add(sky);

const sun = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
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

      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float pulse = sin(uTime * 0.4) * 0.02;
        float glow = smoothstep(1.0, 0.0, r + pulse);
        vec3 col = mix(vec3(1.0, 0.92, 0.96), vec3(0.95, 0.48, 0.72), smoothstep(0.05, 0.95, r));
        gl_FragColor = vec4(col, glow * 0.26);
      }
    `,
  })
);
sun.position.set(-1.2, 3.3, -18);
scene.add(sun);

function createMountainLayer({ width, height, y, z, seed, base, peak, opacity }) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uSeed: { value: seed },
      uBase: { value: new THREE.Color(base) },
      uPeak: { value: new THREE.Color(peak) },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uSeed;
      uniform vec3 uBase;
      uniform vec3 uPeak;
      uniform float uOpacity;
      varying vec2 vUv;
      ${noiseGLSL}

      void main() {
        float ridge = 0.22 + fbm(vec2(vUv.x * 2.4 + uSeed * 0.37, uSeed)) * 0.34;
        ridge += sin(vUv.x * 8.0 + uSeed) * 0.03;
        float alpha = smoothstep(ridge + 0.02, ridge - 0.02, vUv.y);
        if (alpha < 0.01) discard;

        float gradient = smoothstep(0.0, ridge + 0.06, vUv.y);
        vec3 color = mix(uBase, uPeak, gradient);
        float rim = smoothstep(ridge - 0.025, ridge + 0.04, vUv.y);
        color += rim * vec3(0.12, 0.09, 0.14);

        gl_FragColor = vec4(color, alpha * uOpacity);
      }
    `,
  });

  const layer = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  layer.position.set(0, y, z);
  scene.add(layer);
}

createMountainLayer({
  width: 34,
  height: 12,
  y: 0.3,
  z: -20,
  seed: 1.2,
  base: 0x1a0d20,
  peak: 0x2b1632,
  opacity: 0.95,
});

createMountainLayer({
  width: 28,
  height: 10,
  y: -0.1,
  z: -17,
  seed: 3.9,
  base: 0x24112b,
  peak: 0x3d1c41,
  opacity: 0.85,
});

createMountainLayer({
  width: 24,
  height: 8,
  y: -0.45,
  z: -14,
  seed: 7.4,
  base: 0x321334,
  peak: 0x512049,
  opacity: 0.7,
});

function createMist({ width, height, y, z, speed, color, opacity }) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
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
      uniform float uSpeed;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      ${noiseGLSL}

      void main() {
        vec2 uv = vUv;
        float n = fbm(uv * 4.5 + vec2(uTime * uSpeed, 0.0));
        float alpha = smoothstep(0.42, 0.86, n);
        alpha *= smoothstep(0.0, 0.3, uv.y);
        alpha *= 1.0 - smoothstep(0.65, 1.0, uv.y);
        alpha *= smoothstep(1.0, 0.15, abs(uv.x - 0.5) * 2.0);
        gl_FragColor = vec4(uColor, alpha * uOpacity);
      }
    `,
  });

  const mist = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mist.position.set(0, y, z);
  mist.renderOrder = 1;
  scene.add(mist);
  return material;
}

const mistMaterials = [
  createMist({ width: 18, height: 6, y: -1.2, z: -10, speed: 0.03, color: 0xf2d8e5, opacity: 0.16 }),
  createMist({ width: 20, height: 7, y: -1.8, z: -7.5, speed: 0.05, color: 0xdcc5ef, opacity: 0.14 }),
];

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 30, 1, 1),
  new THREE.ShaderMaterial({
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
        vec3 base = mix(vec3(0.08, 0.04, 0.09), vec3(0.20, 0.08, 0.14), pow(1.0 - uv.y, 2.1));

        float road = smoothstep(0.34, 0.10, abs(uv.x - 0.5));
        float shoulder = smoothstep(0.24, 0.02, abs(abs(uv.x - 0.5) - 0.22));
        float shimmer = fbm(vec2(uv.y * 6.0 + uTime * 0.04, uv.x * 11.0));
        shimmer = smoothstep(0.58, 0.86, shimmer) * road * (0.24 + pow(1.0 - uv.y, 1.8));

        vec3 color = base;
        color += road * vec3(0.04, 0.01, 0.03);
        color += shoulder * vec3(0.22, 0.08, 0.13) * 0.18;
        color += shimmer * vec3(0.55, 0.18, 0.29) * 0.18;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, -2.45, -8);
world.add(ground);

function createTorii() {
  const group = new THREE.Group();
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x5d2031,
    emissive: 0x1e0810,
    roughness: 0.85,
    metalness: 0.04,
  });

  const postGeometry = new THREE.BoxGeometry(0.28, 3.6, 0.28);
  const beamGeometry = new THREE.BoxGeometry(4.9, 0.28, 0.36);
  const topBeamGeometry = new THREE.BoxGeometry(5.7, 0.18, 0.48);

  const leftPost = new THREE.Mesh(postGeometry, frameMaterial);
  leftPost.position.set(-1.65, 1.8, 0);
  const rightPost = new THREE.Mesh(postGeometry, frameMaterial);
  rightPost.position.set(1.65, 1.8, 0);

  const beam = new THREE.Mesh(beamGeometry, frameMaterial);
  beam.position.set(0, 3.02, 0);
  const topBeam = new THREE.Mesh(topBeamGeometry, frameMaterial);
  topBeam.position.set(0, 3.42, 0);
  topBeam.rotation.z = 0.02;

  group.add(leftPost, rightPost, beam, topBeam);
  group.position.set(0, -2.45, -15.5);
  group.scale.setScalar(1.1);

  return group;
}

world.add(createTorii());

function createLanternRow() {
  const lanternGroup = new THREE.Group();
  const poleMaterial = new THREE.MeshStandardMaterial({
    color: 0x24111b,
    roughness: 0.88,
    metalness: 0.05,
  });
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x6c2f44,
    roughness: 0.72,
    metalness: 0.04,
  });
  const glowMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd0c7,
    emissive: 0xffc2a8,
    emissiveIntensity: 1.6,
    roughness: 0.22,
    metalness: 0.0,
  });

  const poleGeometry = new THREE.CylinderGeometry(0.06, 0.08, 2.0, 12);
  const capGeometry = new THREE.BoxGeometry(0.58, 0.48, 0.58);
  const coreGeometry = new THREE.BoxGeometry(0.34, 0.34, 0.34);

  for (let i = 0; i < 5; i += 1) {
    const z = -2.6 - i * 2.3;
    const spread = 2.45 + i * 0.08;

    [-1, 1].forEach((side) => {
      const group = new THREE.Group();

      const pole = new THREE.Mesh(poleGeometry, poleMaterial);
      pole.position.y = 1.0;

      const cap = new THREE.Mesh(capGeometry, frameMaterial);
      cap.position.y = 2.12;

      const glow = new THREE.Mesh(coreGeometry, glowMaterial);
      glow.position.y = 2.08;

      group.add(pole, cap, glow);
      group.position.set(side * spread, -2.45, z);
      lanternGroup.add(group);
    });
  }

  return lanternGroup;
}

world.add(createLanternRow());

const petalMaterial = new THREE.ShaderMaterial({
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      vec3 transformed = position;
      transformed.x += sin(uv.y * 3.14159265) * 0.08;
      transformed.z += (uv.x - 0.5) * 0.06;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;

    float petalMask(vec2 uv) {
      vec2 p = uv * 2.0 - 1.0;
      p.y += 0.15;

      float body = 1.0 - smoothstep(0.78, 0.96, length(vec2(p.x * 0.84, p.y * 0.72)));
      float tip = smoothstep(1.0, 0.18, p.y + 0.62);
      float cleft = smoothstep(0.08, -0.22, p.y + (0.55 - abs(p.x)) * 0.35);
      return body * tip * (1.0 - cleft * 0.52);
    }

    void main() {
      float mask = petalMask(vUv);
      if (mask < 0.01) discard;

      vec2 p = vUv * 2.0 - 1.0;
      float ridge = 1.0 - smoothstep(0.0, 0.52, abs(p.x));
      vec3 color = mix(vec3(1.0, 0.88, 0.95), vec3(0.87, 0.56, 0.90), vUv.y);
      color += ridge * vec3(0.09, 0.03, 0.06) * 0.14;

      gl_FragColor = vec4(color, mask * (0.72 + ridge * 0.16));
    }
  `,
});

const petals = [];
const petalGroup = new THREE.Group();
scene.add(petalGroup);
const petalGeometry = new THREE.PlaneGeometry(0.22, 0.28, 1, 1);

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function resetPetal(state, initial) {
  state.x = randomBetween(-7.2, 7.2);
  state.y = initial ? randomBetween(-1.6, 7.8) : randomBetween(4.4, 8.8);
  state.z = randomBetween(-15.5, 3.8);
  state.scale = randomBetween(0.52, 1.36);
  state.fall = randomBetween(0.28, 0.62);
  state.sway = randomBetween(0.7, 1.8);
  state.drift = randomBetween(0.06, 0.22);
  state.phase = randomBetween(0, Math.PI * 2);
  state.spinX = randomBetween(-1.5, 1.5);
  state.spinY = randomBetween(-1.5, 1.5);
  state.spinZ = randomBetween(-1.5, 1.5);
}

for (let i = 0; i < 170; i += 1) {
  const mesh = new THREE.Mesh(petalGeometry, petalMaterial);
  const state = {
    mesh,
    x: 0,
    y: 0,
    z: 0,
    scale: 1,
    fall: 0,
    sway: 0,
    drift: 0,
    phase: 0,
    spinX: 0,
    spinY: 0,
    spinZ: 0,
  };

  resetPetal(state, true);
  mesh.position.set(state.x, state.y, state.z);
  mesh.rotation.set(
    randomBetween(0, Math.PI * 2),
    randomBetween(0, Math.PI * 2),
    randomBetween(0, Math.PI * 2)
  );
  mesh.scale.setScalar(state.scale);
  petalGroup.add(mesh);
  petals.push(state);
}

const dustGeometry = new THREE.BufferGeometry();
const dustCount = 700;
const dustPositions = new Float32Array(dustCount * 3);
for (let i = 0; i < dustCount; i += 1) {
  const i3 = i * 3;
  dustPositions[i3] = randomBetween(-11, 11);
  dustPositions[i3 + 1] = randomBetween(-3, 8);
  dustPositions[i3 + 2] = randomBetween(-20, 6);
}
dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));

const dust = new THREE.Points(
  dustGeometry,
  new THREE.PointsMaterial({
    color: 0xf4c9de,
    size: 0.03,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
);
scene.add(dust);

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

  skyMaterial.uniforms.uTime.value = elapsed;
  sun.material.uniforms.uTime.value = elapsed;
  ground.material.uniforms.uTime.value = elapsed;
  mistMaterials.forEach((material) => {
    material.uniforms.uTime.value = elapsed;
  });

  petals.forEach((state) => {
    state.y -= state.fall * delta;
    state.x += Math.sin(elapsed * state.sway + state.phase) * state.drift * delta;
    state.z += Math.cos(elapsed * 0.35 + state.phase) * 0.012;

    state.mesh.position.set(state.x, state.y, state.z);
    state.mesh.rotation.x += state.spinX * delta * 0.55;
    state.mesh.rotation.y += state.spinY * delta * 0.55;
    state.mesh.rotation.z += state.spinZ * delta * 0.55;

    if (state.y < -2.7 || state.x < -8.5 || state.x > 8.5) {
      resetPetal(state, false);
      state.mesh.scale.setScalar(state.scale);
    }
  });

  dust.rotation.y = elapsed * 0.02;
  dust.rotation.x = elapsed * 0.008;
  world.rotation.y = THREE.MathUtils.lerp(world.rotation.y, mouseX * 0.08, 0.03);
  world.position.x = THREE.MathUtils.lerp(world.position.x, mouseX * 0.18, 0.02);

  const targetX = mouseX * 0.62;
  const targetY = 1.35 + -mouseY * 0.26 + scrollTarget * 0.18;

  camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.035);
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.035);
  camera.lookAt(0, -0.2 + scrollTarget * 0.06, -7.8);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
