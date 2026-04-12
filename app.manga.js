import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";

const canvas = document.querySelector("#webgl-canvas");
const cursor = document.querySelector("#cursor");
const hoverable = [...document.querySelectorAll("a")];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xfcfcfc);
scene.fog = new THREE.FogExp2(0xfcfcfc, 0.019);

const camera = new THREE.PerspectiveCamera(
  72,
  window.innerWidth / window.innerHeight,
  0.1,
  1200
);
camera.position.set(0, 0.4, 10);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const lightDirection = new THREE.Vector3(0.6, 0.8, 1.0).normalize();

const toonVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const toonFragmentShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  uniform vec3 uColor;
  uniform vec3 uLightDir;

  void main() {
    float intensity = dot(normalize(vNormal), normalize(uLightDir));
    intensity = intensity * 0.5 + 0.5;

    if (intensity > 0.88) intensity = 1.0;
    else if (intensity > 0.62) intensity = 0.76;
    else if (intensity > 0.36) intensity = 0.5;
    else intensity = 0.24;

    float tone = sin(gl_FragCoord.x * 0.7) * sin(gl_FragCoord.y * 0.7);
    if (intensity < 0.55 && tone > 0.0) {
      intensity *= 0.82;
    }

    gl_FragColor = vec4(uColor * intensity, 1.0);
  }
`;

function mangaMaterial(color) {
  return new THREE.ShaderMaterial({
    vertexShader: toonVertexShader,
    fragmentShader: toonFragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uLightDir: { value: lightDirection.clone() },
    },
  });
}

function createFogTexture(size = 256) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const ctx = textureCanvas.getContext("2d");

  for (let i = 0; i < 10; i += 1) {
    const x = size * (0.25 + Math.random() * 0.5);
    const y = size * (0.25 + Math.random() * 0.5);
    const r = size * (0.18 + Math.random() * 0.2);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, i % 2 === 0 ? "rgba(255,255,255,0.9)" : "rgba(255,218,230,0.65)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return new THREE.CanvasTexture(textureCanvas);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

const roadGroup = new THREE.Group();
scene.add(roadGroup);

const road = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 1000),
  mangaMaterial(0xf5f5f5)
);
road.rotation.x = -Math.PI / 2;
road.position.y = -6;
roadGroup.add(road);

const edgeGeo = new THREE.BoxGeometry(0.18, 0.18, 1000);
const leftEdge = new THREE.Mesh(edgeGeo, mangaMaterial(0x111111));
const rightEdge = new THREE.Mesh(edgeGeo, mangaMaterial(0x111111));
leftEdge.position.set(-5.1, -5.94, -500);
rightEdge.position.set(5.1, -5.94, -500);
roadGroup.add(leftEdge, rightEdge);

const gatesGroup = new THREE.Group();
scene.add(gatesGroup);

function createGate(z, index) {
  const gate = new THREE.Group();
  const blackMat = mangaMaterial(0x111111);

  const postGeo = new THREE.BoxGeometry(0.82, 12, 0.82);
  const beamGeo = new THREE.BoxGeometry(14.2, 1.05, 1.0);
  const capGeo = new THREE.BoxGeometry(16.2, 0.55, 1.28);
  const tieGeo = new THREE.BoxGeometry(8.4, 0.6, 0.7);

  const leftPost = new THREE.Mesh(postGeo, blackMat);
  const rightPost = new THREE.Mesh(postGeo, blackMat);
  leftPost.position.x = -5;
  rightPost.position.x = 5;

  const topBeam = new THREE.Mesh(beamGeo, blackMat);
  topBeam.position.y = 6.1;

  const capBeam = new THREE.Mesh(capGeo, blackMat);
  capBeam.position.y = 6.95;

  const tieBeam = new THREE.Mesh(tieGeo, blackMat);
  tieBeam.position.y = 4.75;

  gate.add(leftPost, rightPost, topBeam, capBeam, tieBeam);
  gate.position.z = z;
  gate.position.y = index % 2 === 0 ? 0 : 0.08;
  gatesGroup.add(gate);
}

for (let i = 0; i < 15; i += 1) {
  createGate(-i * 28, i);
}

const treeGroup = new THREE.Group();
scene.add(treeGroup);

function createCherryTree(x, z, scale = 1) {
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.42, 8, 8),
    mangaMaterial(0x111111)
  );
  trunk.position.y = -2.1;
  trunk.rotation.z = randomBetween(-0.14, 0.14);

  const branchA = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 3.8, 8),
    mangaMaterial(0x111111)
  );
  branchA.position.set(-0.8, 0.8, 0);
  branchA.rotation.z = 0.9;

  const branchB = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 4.1, 8),
    mangaMaterial(0x111111)
  );
  branchB.position.set(0.95, 1.0, 0);
  branchB.rotation.z = -0.88;

  const branchC = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.15, 2.8, 8),
    mangaMaterial(0x111111)
  );
  branchC.position.set(0.2, 1.6, 0);
  branchC.rotation.z = -0.12;

  group.add(trunk, branchA, branchB, branchC);

  const blossomColors = [0xffb7c5, 0xf28ead, 0xffd8e3];
  const blossomGeo = new THREE.IcosahedronGeometry(0.9, 0);
  const blossomPositions = [
    [-0.9, 2.7, 0.2],
    [0.9, 2.95, -0.1],
    [0.1, 3.35, 0.12],
    [-0.2, 2.25, -0.16],
    [0.45, 2.45, 0.18],
  ];

  blossomPositions.forEach((position, index) => {
    const blossom = new THREE.Mesh(
      blossomGeo,
      mangaMaterial(blossomColors[index % blossomColors.length])
    );
    blossom.position.set(position[0], position[1], position[2]);
    blossom.scale.setScalar(randomBetween(0.85, 1.25));
    group.add(blossom);
  });

  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  treeGroup.add(group);
}

for (let i = 0; i < 7; i += 1) {
  const z = -8 - i * 42;
  createCherryTree(-10.5 - randomBetween(-1.4, 1.2), z, randomBetween(0.9, 1.2));
  createCherryTree(10.5 + randomBetween(-1.2, 1.4), z - randomBetween(6, 12), randomBetween(0.88, 1.18));
}

const hazeGroup = new THREE.Group();
scene.add(hazeGroup);
const fogTexture = createFogTexture();

function addHaze(x, y, z, scale, opacity) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: fogTexture,
      color: 0xffffff,
      transparent: true,
      opacity,
      depthWrite: false,
    })
  );
  sprite.position.set(x, y, z);
  sprite.scale.set(scale, scale * 0.58, 1);
  sprite.userData.baseX = x;
  sprite.userData.baseOpacity = opacity;
  sprite.userData.seed = randomBetween(0, Math.PI * 2);
  hazeGroup.add(sprite);
}

for (let i = 0; i < 12; i += 1) {
  addHaze(
    randomBetween(-3, 3),
    randomBetween(-0.5, 4),
    -i * 34 - 8,
    randomBetween(18, 28),
    randomBetween(0.14, 0.24)
  );
}

const particleGroup = new THREE.Group();
scene.add(particleGroup);

const petalGeometry = new THREE.TetrahedronGeometry(0.12, 0);
const leafGeometry = new THREE.OctahedronGeometry(0.1, 0);
const petalMaterials = [
  mangaMaterial(0xffb7c5),
  mangaMaterial(0xffd9e3),
  mangaMaterial(0xf18dad),
];
const leafMaterials = [
  mangaMaterial(0xdcb48b),
  mangaMaterial(0xc9b087),
];

const particles = [];

function resetParticle(particle, initial = false) {
  particle.baseX = randomBetween(-30, 30);
  particle.y = initial ? randomBetween(-24, 30) : 28;
  particle.z = randomBetween(camera.position.z - 120, camera.position.z + 60);
  particle.speed = randomBetween(0.03, 0.09);
  particle.drift = randomBetween(0.004, 0.018);
  particle.swing = randomBetween(0.6, 1.8);
  particle.phase = randomBetween(0, Math.PI * 2);
  particle.mesh.position.set(particle.baseX, particle.y, particle.z);
  particle.mesh.rotation.set(
    randomBetween(0, Math.PI),
    randomBetween(0, Math.PI),
    randomBetween(0, Math.PI)
  );
}

for (let i = 0; i < 260; i += 1) {
  const isLeaf = i > 210;
  const mesh = new THREE.Mesh(
    isLeaf ? leafGeometry : petalGeometry,
    isLeaf
      ? leafMaterials[i % leafMaterials.length]
      : petalMaterials[i % petalMaterials.length]
  );
  const particle = { mesh, baseX: 0, y: 0, z: 0, speed: 0, drift: 0, swing: 0, phase: 0 };
  resetParticle(particle, true);
  particleGroup.add(mesh);
  particles.push(particle);
}

let mouseX = 0;
let scrollTarget = 0;
let scrollCurrent = 0;

window.addEventListener("mousemove", (event) => {
  mouseX = (event.clientX / window.innerWidth - 0.5) * 2;

  if (cursor) {
    cursor.style.transform = `translate(${event.clientX - 19}px, ${event.clientY - 19}px)`;
  }
});

hoverable.forEach((element) => {
  element.addEventListener("mouseenter", () => {
    if (cursor) {
      cursor.style.width = "54px";
      cursor.style.height = "54px";
      cursor.style.backgroundColor = "rgba(255, 183, 197, 0.12)";
    }
  });

  element.addEventListener("mouseleave", () => {
    if (cursor) {
      cursor.style.width = "38px";
      cursor.style.height = "38px";
      cursor.style.backgroundColor = "transparent";
    }
  });
});

window.addEventListener("scroll", () => {
  const maxScroll = document.body.scrollHeight - window.innerHeight;
  scrollTarget = maxScroll > 0 ? window.scrollY / maxScroll : 0;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();
  const delta = Math.min(clock.getDelta(), 0.033);

  scrollCurrent += (scrollTarget - scrollCurrent) * 0.05;

  camera.position.z = 10 - scrollCurrent * 380;
  camera.position.x += (mouseX * 2 - camera.position.x) * 0.05;
  camera.position.y = 0.35 + Math.sin(elapsed * 0.4) * 0.08;
  camera.lookAt(mouseX * 0.6, 0.3, camera.position.z - 18);

  gatesGroup.children.forEach((gate, index) => {
    gate.rotation.z = Math.sin(elapsed * 0.35 + index) * 0.004;
  });

  treeGroup.children.forEach((tree, index) => {
    tree.rotation.z = Math.sin(elapsed * 0.55 + index) * 0.02;
  });

  hazeGroup.children.forEach((haze, index) => {
    haze.position.x = haze.userData.baseX + Math.sin(elapsed * 0.18 + haze.userData.seed) * 0.35;
    haze.material.opacity = haze.userData.baseOpacity + Math.sin(elapsed * 0.35 + index) * 0.02;
  });

  particles.forEach((particle) => {
    particle.mesh.position.y -= particle.speed;
    particle.mesh.position.x =
      particle.baseX + Math.sin(elapsed * particle.swing + particle.phase + particle.mesh.position.y * 0.08) * particle.drift * 18;
    particle.mesh.rotation.x += delta * 0.8;
    particle.mesh.rotation.y += delta * 0.6;

    if (particle.mesh.position.y < -28) {
      resetParticle(particle);
    }

    if (particle.mesh.position.z > camera.position.z + 50) {
      particle.mesh.position.z -= 180;
    }
  });

  renderer.render(scene, camera);
}

animate();
