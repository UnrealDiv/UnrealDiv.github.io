(function () {
  if (!window.THREE) {
    return;
  }

  const THREE = window.THREE;
  const canvas = document.getElementById("webgl");
  const cursor = document.getElementById("cursor");
  const panels = Array.from(document.querySelectorAll(".manga-panel"));
  const links = Array.from(document.querySelectorAll("a"));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfcfcfc);
  scene.fog = new THREE.FogExp2(0xfcfcfc, 0.018);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1400
  );
  camera.position.set(0, 0.4, 12);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const lightDir = new THREE.Vector3(0.6, 0.85, 1.0).normalize();

  const toonVertexShader = [
    "varying vec3 vNormal;",
    "void main() {",
    "  vNormal = normalize(normalMatrix * normal);",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
    "}",
  ].join("\n");

  const toonFragmentShader = [
    "varying vec3 vNormal;",
    "uniform vec3 uColor;",
    "uniform vec3 uLightDir;",
    "void main() {",
    "  float intensity = dot(normalize(vNormal), normalize(uLightDir));",
    "  intensity = intensity * 0.5 + 0.5;",
    "  if (intensity > 0.88) intensity = 1.0;",
    "  else if (intensity > 0.62) intensity = 0.76;",
    "  else if (intensity > 0.36) intensity = 0.5;",
    "  else intensity = 0.24;",
    "  float tone = sin(gl_FragCoord.x * 0.7) * sin(gl_FragCoord.y * 0.7);",
    "  if (intensity < 0.55 && tone > 0.0) intensity *= 0.82;",
    "  gl_FragColor = vec4(uColor * intensity, 1.0);",
    "}",
  ].join("\n");

  function mangaMaterial(color) {
    return new THREE.ShaderMaterial({
      vertexShader: toonVertexShader,
      fragmentShader: toonFragmentShader,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uLightDir: { value: lightDir.clone() },
      },
    });
  }

  const outlineMaterial = new THREE.LineBasicMaterial({
    color: 0x111111,
    transparent: true,
    opacity: 0.95,
  });

  function addOutlinedMesh(parent, geometry, material, position, rotation, scale) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position || new THREE.Vector3());
    mesh.rotation.copy(rotation || new THREE.Euler());

    if (typeof scale === "number") {
      mesh.scale.setScalar(scale);
    } else if (scale) {
      mesh.scale.copy(scale);
    }

    parent.add(mesh);

    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), outlineMaterial);
    outline.position.copy(mesh.position);
    outline.rotation.copy(mesh.rotation);
    outline.scale.copy(mesh.scale);
    parent.add(outline);

    return mesh;
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function createFogTexture(size) {
    const textureCanvas = document.createElement("canvas");
    const textureSize = size || 256;
    textureCanvas.width = textureSize;
    textureCanvas.height = textureSize;
    const ctx = textureCanvas.getContext("2d");

    for (let i = 0; i < 10; i += 1) {
      const x = textureSize * (0.22 + Math.random() * 0.56);
      const y = textureSize * (0.22 + Math.random() * 0.56);
      const radius = textureSize * (0.16 + Math.random() * 0.18);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, i % 2 === 0 ? "rgba(255,255,255,0.95)" : "rgba(255,217,230,0.68)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    return new THREE.CanvasTexture(textureCanvas);
  }

  function inkWaterMaterial(baseColor, accentColor) {
    return new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        uBase: { value: new THREE.Color(baseColor) },
        uAccent: { value: new THREE.Color(accentColor) },
        uTime: { value: 0 },
      },
      vertexShader: [
        "varying vec2 vUv;",
        "void main() {",
        "  vUv = uv;",
        "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
        "}",
      ].join("\n"),
      fragmentShader: [
        "varying vec2 vUv;",
        "uniform vec3 uBase;",
        "uniform vec3 uAccent;",
        "uniform float uTime;",
        "void main() {",
        "  float band = sin(vUv.y * 90.0 + uTime * 2.0 + sin(vUv.x * 10.0) * 2.0) * 0.5 + 0.5;",
        "  float ripple = sin(vUv.y * 30.0 - uTime * 1.5 + vUv.x * 7.0) * 0.5 + 0.5;",
        "  float mask = step(0.48, band);",
        "  float highlight = smoothstep(0.88, 1.0, ripple) * 0.2;",
        "  vec3 color = mix(uBase, uAccent, mask * 0.36);",
        "  color = mix(color, vec3(0.98), highlight);",
        "  gl_FragColor = vec4(color, 1.0);",
        "}",
      ].join("\n"),
    });
  }

  const roadGroup = new THREE.Group();
  scene.add(roadGroup);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 1100),
    mangaMaterial(0xf5f5f5)
  );
  road.rotation.x = -Math.PI / 2;
  road.position.y = -6;
  roadGroup.add(road);

  const edgeGeo = new THREE.BoxGeometry(0.18, 0.18, 1100);
  const leftEdge = new THREE.Mesh(edgeGeo, mangaMaterial(0x111111));
  const rightEdge = new THREE.Mesh(edgeGeo, mangaMaterial(0x111111));
  leftEdge.position.set(-5.1, -5.94, -550);
  rightEdge.position.set(5.1, -5.94, -550);
  roadGroup.add(leftEdge, rightEdge);

  for (let i = 0; i < 26; i += 1) {
    const dash = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.06, 5),
      mangaMaterial(0x111111)
    );
    dash.position.set(0, -5.92, -15 - i * 32);
    roadGroup.add(dash);
  }

  const mountainGroup = new THREE.Group();
  scene.add(mountainGroup);

  function createMountain(x, z, height, radius, color, snowScale) {
    const group = new THREE.Group();
    const rotY = randomBetween(-0.18, 0.18);

    addOutlinedMesh(
      group,
      new THREE.ConeGeometry(radius, height, 6),
      mangaMaterial(color),
      new THREE.Vector3(0, height * 0.5 - 6.3, 0),
      new THREE.Euler(0, rotY, 0)
    );

    addOutlinedMesh(
      group,
      new THREE.ConeGeometry(radius * (snowScale || 0.46), height * 0.28, 6),
      mangaMaterial(0xf7f9fc),
      new THREE.Vector3(0, height * 0.78 - 6.3, 0),
      new THREE.Euler(0, rotY, 0)
    );

    group.position.set(x, 0, z);
    mountainGroup.add(group);
  }

  function createMountainRange(z, largePeak) {
    const configs = [
      { x: -36, height: randomBetween(18, 26), radius: randomBetween(9, 12), color: 0xd2d9e1 },
      { x: -18, height: randomBetween(15, 22), radius: randomBetween(7, 10), color: 0xc2cad4 },
      { x: 18, height: randomBetween(15, 23), radius: randomBetween(7, 10), color: 0xbcc7d3 },
      { x: 38, height: randomBetween(18, 26), radius: randomBetween(9, 12), color: 0xdbe1e7 },
    ];

    configs.forEach((config) => {
      createMountain(config.x, z + randomBetween(-10, 10), config.height, config.radius, config.color, 0.46);
    });

    if (largePeak) {
      createMountain(2, z - 12, 34, 16, 0xb8c2ce, 0.5);
    }
  }

  createMountainRange(-120, true);
  createMountainRange(-240, false);
  createMountainRange(-360, true);
  createMountainRange(-500, false);

  const reservoirGroup = new THREE.Group();
  scene.add(reservoirGroup);
  const reservoirMaterial = inkWaterMaterial(0x29578d, 0x7fb5ef);

  function createReservoirSection(x, z, width, length, rotZ) {
    const group = new THREE.Group();

    addOutlinedMesh(
      group,
      new THREE.PlaneGeometry(width, length, 1, 80),
      reservoirMaterial,
      new THREE.Vector3(0, 0, 0),
      new THREE.Euler(-Math.PI / 2 + randomBetween(-0.02, 0.02), 0, rotZ)
    );

    const bankGeo = new THREE.BoxGeometry(0.18, 0.14, length);
    const bankMat = mangaMaterial(0x111111);
    const leftBank = new THREE.Mesh(bankGeo, bankMat);
    const rightBank = new THREE.Mesh(bankGeo, bankMat);
    leftBank.position.set(-width * 0.5 - 0.1, 0.06, 0);
    rightBank.position.set(width * 0.5 + 0.1, 0.06, 0);
    group.add(leftBank, rightBank);

    group.position.set(x, -5.92, z);
    reservoirGroup.add(group);
  }

  for (let i = 0; i < 8; i += 1) {
    const baseZ = -14 - i * 54;
    createReservoirSection(
      -13.5 - randomBetween(0.2, 1.4),
      baseZ,
      randomBetween(6.2, 8.8),
      randomBetween(26, 44),
      randomBetween(-0.08, 0.08)
    );
    createReservoirSection(
      13.5 + randomBetween(0.2, 1.4),
      baseZ - randomBetween(6, 14),
      randomBetween(6.2, 8.8),
      randomBetween(26, 44),
      randomBetween(-0.08, 0.08)
    );
  }

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
    createGate(-i * 30, i);
  }

  const treeGroup = new THREE.Group();
  scene.add(treeGroup);
  const pineGroup = new THREE.Group();
  scene.add(pineGroup);

  function createCherryTree(x, z, scale) {
    const group = new THREE.Group();

    addOutlinedMesh(
      group,
      new THREE.CylinderGeometry(0.28, 0.42, 8, 8),
      mangaMaterial(0x111111),
      new THREE.Vector3(0, -2.1, 0),
      new THREE.Euler(0, 0, randomBetween(-0.14, 0.14))
    );

    addOutlinedMesh(
      group,
      new THREE.CylinderGeometry(0.12, 0.18, 3.8, 8),
      mangaMaterial(0x111111),
      new THREE.Vector3(-0.8, 0.8, 0),
      new THREE.Euler(0, 0, 0.9)
    );
    addOutlinedMesh(
      group,
      new THREE.CylinderGeometry(0.12, 0.18, 4.1, 8),
      mangaMaterial(0x111111),
      new THREE.Vector3(0.95, 1.0, 0),
      new THREE.Euler(0, 0, -0.88)
    );
    addOutlinedMesh(
      group,
      new THREE.CylinderGeometry(0.1, 0.15, 2.8, 8),
      mangaMaterial(0x111111),
      new THREE.Vector3(0.2, 1.6, 0),
      new THREE.Euler(0, 0, -0.12)
    );

    const blossomGeo = new THREE.IcosahedronGeometry(0.9, 0);
    const blossomColors = [0xffb7c5, 0xf28ead, 0xffd8e3];
    const blossomPositions = [
      [-0.9, 2.7, 0.2],
      [0.9, 2.95, -0.1],
      [0.1, 3.35, 0.12],
      [-0.2, 2.25, -0.16],
      [0.45, 2.45, 0.18],
    ];

    blossomPositions.forEach((pos, index) => {
      addOutlinedMesh(
        group,
        blossomGeo,
        mangaMaterial(blossomColors[index % blossomColors.length]),
        new THREE.Vector3(pos[0], pos[1], pos[2]),
        new THREE.Euler(),
        randomBetween(0.88, 1.22)
      );
    });

    group.position.set(x, 0, z);
    group.scale.setScalar(scale || 1);
    treeGroup.add(group);
  }

  function createPineTree(x, z, scale) {
    const group = new THREE.Group();

    addOutlinedMesh(
      group,
      new THREE.CylinderGeometry(0.18, 0.26, 5.2, 6),
      mangaMaterial(0x111111),
      new THREE.Vector3(0, -3.3, 0)
    );
    addOutlinedMesh(
      group,
      new THREE.ConeGeometry(2.2, 3.3, 6),
      mangaMaterial(0x425c69),
      new THREE.Vector3(0, -1.5, 0)
    );
    addOutlinedMesh(
      group,
      new THREE.ConeGeometry(1.8, 2.8, 6),
      mangaMaterial(0x4b6775),
      new THREE.Vector3(0, 0.2, 0)
    );
    addOutlinedMesh(
      group,
      new THREE.ConeGeometry(1.3, 2.2, 6),
      mangaMaterial(0x567381),
      new THREE.Vector3(0, 1.7, 0)
    );

    group.position.set(x, 0, z);
    group.scale.setScalar(scale || 1);
    pineGroup.add(group);
  }

  for (let i = 0; i < 8; i += 1) {
    const z = -12 - i * 44;
    createCherryTree(-10.5 - randomBetween(-1.4, 1.2), z, randomBetween(0.9, 1.2));
    createCherryTree(10.5 + randomBetween(-1.2, 1.4), z - randomBetween(6, 12), randomBetween(0.88, 1.18));
  }

  for (let i = 0; i < 10; i += 1) {
    const z = -26 - i * 40;
    createPineTree(-18 - randomBetween(0, 4), z - randomBetween(0, 10), randomBetween(0.86, 1.24));
    createPineTree(18 + randomBetween(0, 4), z - randomBetween(4, 16), randomBetween(0.92, 1.28));
  }

  const hazeGroup = new THREE.Group();
  scene.add(hazeGroup);
  const fogTexture = createFogTexture(256);

  function addHaze(x, y, z, scale, opacity) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: fogTexture,
        color: 0xffffff,
        transparent: true,
        opacity: opacity,
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

  function resetParticle(particle, initial) {
    particle.baseX = randomBetween(-30, 30);
    particle.mesh.position.set(
      particle.baseX,
      initial ? randomBetween(-24, 30) : 28,
      randomBetween(camera.position.z - 120, camera.position.z + 60)
    );
    particle.speed = randomBetween(0.03, 0.09);
    particle.drift = randomBetween(0.004, 0.018);
    particle.swing = randomBetween(0.6, 1.8);
    particle.phase = randomBetween(0, Math.PI * 2);
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
    const particle = {
      mesh: mesh,
      baseX: 0,
      speed: 0,
      drift: 0,
      swing: 0,
      phase: 0,
    };
    resetParticle(particle, true);
    particleGroup.add(mesh);
    particles.push(particle);
  }

  let mouseX = 0;
  let scrollTarget = 0;
  let scrollCurrent = 0;

  function updateCursor(event) {
    if (!cursor) {
      return;
    }
    cursor.style.transform = "translate(" + (event.clientX - 19) + "px, " + (event.clientY - 19) + "px)";
  }

  window.addEventListener("mousemove", function (event) {
    mouseX = (event.clientX / window.innerWidth - 0.5) * 2;
    updateCursor(event);
  });

  links.forEach(function (link) {
    link.addEventListener("mouseenter", function () {
      if (!cursor) {
        return;
      }
      cursor.style.width = "54px";
      cursor.style.height = "54px";
      cursor.style.backgroundColor = "rgba(255, 183, 197, 0.12)";
    });

    link.addEventListener("mouseleave", function () {
      if (!cursor) {
        return;
      }
      cursor.style.width = "38px";
      cursor.style.height = "38px";
      cursor.style.backgroundColor = "transparent";
    });
  });

  window.addEventListener("scroll", function () {
    const maxScroll = document.body.scrollHeight - window.innerHeight;
    scrollTarget = maxScroll > 0 ? window.scrollY / maxScroll : 0;
  });

  window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });

  const observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-active");
        }
      });
    },
    { threshold: 0.18 }
  );

  panels.forEach(function (panel) {
    observer.observe(panel);
  });

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
    const delta = Math.min(clock.getDelta(), 0.033);

    scrollCurrent += (scrollTarget - scrollCurrent) * 0.05;
    reservoirMaterial.uniforms.uTime.value = elapsed;

    camera.position.z = 12 - scrollCurrent * 420;
    camera.position.x += (mouseX * 2 - camera.position.x) * 0.05;
    camera.position.y = 0.35 + Math.sin(elapsed * 0.4) * 0.08;
    camera.lookAt(mouseX * 0.5, 0.2, camera.position.z - 18);

    gatesGroup.children.forEach(function (gate, index) {
      gate.rotation.z = Math.sin(elapsed * 0.35 + index) * 0.004;
    });

    treeGroup.children.forEach(function (tree, index) {
      tree.rotation.z = Math.sin(elapsed * 0.5 + index) * 0.02;
    });

    pineGroup.children.forEach(function (tree, index) {
      tree.rotation.z = Math.sin(elapsed * 0.32 + index * 0.6) * 0.012;
    });

    hazeGroup.children.forEach(function (haze, index) {
      haze.position.x = haze.userData.baseX + Math.sin(elapsed * 0.18 + haze.userData.seed) * 0.35;
      haze.material.opacity = haze.userData.baseOpacity + Math.sin(elapsed * 0.35 + index) * 0.02;
    });

    particles.forEach(function (particle) {
      particle.mesh.position.y -= particle.speed;
      particle.mesh.position.x =
        particle.baseX +
        Math.sin(elapsed * particle.swing + particle.phase + particle.mesh.position.y * 0.08) *
          particle.drift *
          18;
      particle.mesh.rotation.x += delta * 0.8;
      particle.mesh.rotation.y += delta * 0.6;

      if (particle.mesh.position.y < -28) {
        resetParticle(particle, false);
      }

      if (particle.mesh.position.z > camera.position.z + 50) {
        particle.mesh.position.z -= 180;
      }
    });

    renderer.render(scene, camera);
  }

  animate();
})();
