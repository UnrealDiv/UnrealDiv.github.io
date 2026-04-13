(function () {
  if (!window.THREE) {
    return;
  }

  const THREE = window.THREE;
  const canvas = document.getElementById("webgl");
  const cursor = document.getElementById("cursor");
  const reveals = Array.from(document.querySelectorAll(".reveal"));
  const links = Array.from(document.querySelectorAll("a"));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9f0f8);
  scene.fog = new THREE.FogExp2(0xe9f0f8, 0.0021);

  const camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / window.innerHeight,
    0.1,
    1400
  );
  camera.position.set(0, 7.2, 34);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  if ("outputColorSpace" in renderer && THREE.SRGBColorSpace) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } else if ("outputEncoding" in renderer && THREE.sRGBEncoding) {
    renderer.outputEncoding = THREE.sRGBEncoding;
  }
  if ("toneMapping" in renderer && THREE.ACESFilmicToneMapping !== undefined) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
  }

  const clock = new THREE.Clock();
  const lookTarget = new THREE.Vector3(1.5, 1.2, -72);
  const mouse = { x: 0, y: 0 };
  const scrollState = { current: 0, target: 0 };

  const farGroup = new THREE.Group();
  const midGroup = new THREE.Group();
  const nearGroup = new THREE.Group();
  const overlayGroup = new THREE.Group();
  scene.add(farGroup, midGroup, nearGroup, overlayGroup);

  const GROUND_Y = -6.2;
  const SHORE_Y = -6.12;
  const WATER_Y = -6.06;

  scene.add(new THREE.HemisphereLight(0xf8fbff, 0xaeb7c4, 1.2));

  const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
  sunLight.position.set(18, 28, 14);
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0xffdce7, 0.55);
  fillLight.position.set(-14, 10, 12);
  scene.add(fillLight);

  const lightDirection = new THREE.Vector3(-0.65, 0.85, 0.8).normalize();

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
    "uniform float uOpacity;",
    "void main() {",
    "  float lightValue = dot(normalize(vNormal), normalize(uLightDir));",
    "  lightValue = lightValue * 0.5 + 0.5;",
    "  if (lightValue > 0.86) lightValue = 1.0;",
    "  else if (lightValue > 0.62) lightValue = 0.78;",
    "  else if (lightValue > 0.38) lightValue = 0.55;",
    "  else lightValue = 0.32;",
    "  float screentone = sin(gl_FragCoord.x * 0.22) * sin(gl_FragCoord.y * 0.22);",
    "  if (lightValue < 0.62 && screentone > 0.25) lightValue *= 0.88;",
    "  gl_FragColor = vec4(uColor * lightValue, uOpacity);",
    "}",
  ].join("\n");

  function inkMaterial(color, options) {
    const settings = options || {};
    const opacity = settings.opacity === undefined ? 1 : settings.opacity;
    return new THREE.ShaderMaterial({
      vertexShader: toonVertexShader,
      fragmentShader: toonFragmentShader,
      transparent: opacity < 1,
      side: settings.side || THREE.FrontSide,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uLightDir: { value: lightDirection.clone() },
        uOpacity: { value: opacity },
      },
    });
  }

  const outlineMaterial = new THREE.LineBasicMaterial({
    color: 0x111111,
    transparent: true,
    opacity: 0.72,
  });

  function addOutlinedMesh(parent, geometry, material, options) {
    const settings = options || {};
    const mesh = new THREE.Mesh(geometry, material);

    if (settings.position) {
      mesh.position.copy(settings.position);
    }

    if (settings.rotation) {
      mesh.rotation.copy(settings.rotation);
    }

    if (typeof settings.scale === "number") {
      mesh.scale.setScalar(settings.scale);
    } else if (settings.scale) {
      mesh.scale.copy(settings.scale);
    }

    parent.add(mesh);

    if (settings.outline !== false) {
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        outlineMaterial
      );
      outline.position.copy(mesh.position);
      outline.rotation.copy(mesh.rotation);
      outline.scale.copy(mesh.scale);
      parent.add(outline);
    }

    return mesh;
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function makeCanvas(width, height) {
    const element = document.createElement("canvas");
    element.width = width;
    element.height = height;
    return element;
  }

  const gltfLoader = THREE.GLTFLoader ? new THREE.GLTFLoader() : null;

  function tuneMaterial(material) {
    if (!material) {
      return;
    }

    material.metalness = 0;
    material.roughness = material.roughness !== undefined ? Math.max(material.roughness, 0.92) : material.roughness;
    if ("envMapIntensity" in material) {
      material.envMapIntensity = 0.45;
    }
    if (material.map && renderer.capabilities && renderer.capabilities.getMaxAnisotropy) {
      material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
    material.needsUpdate = true;
  }

  function normalizeModel(object, targetHeight) {
    const initialBox = new THREE.Box3().setFromObject(object);
    const initialSize = initialBox.getSize(new THREE.Vector3());
    if (initialSize.y > 0) {
      const scale = targetHeight / initialSize.y;
      object.scale.multiplyScalar(scale);
    }

    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const min = box.min.clone();
    object.position.x -= center.x;
    object.position.z -= center.z;
    object.position.y -= min.y;
  }

  function placeModel(path, options) {
    if (!gltfLoader) {
      return null;
    }

    const anchor = new THREE.Group();
    anchor.position.copy(options.position || new THREE.Vector3());
    if (options.rotation) {
      anchor.rotation.copy(options.rotation);
    }
    if (options.parent) {
      options.parent.add(anchor);
    } else {
      scene.add(anchor);
    }

    gltfLoader.load(
      path,
      (gltf) => {
        const root = gltf.scene || gltf.scenes[0];
        if (!root) {
          return;
        }

        root.traverse((node) => {
          if (!node.isMesh) {
            return;
          }

          if (Array.isArray(node.material)) {
            node.material.forEach(tuneMaterial);
          } else {
            tuneMaterial(node.material);
          }
        });

        normalizeModel(root, options.targetHeight || 10);
        if (options.scaleMultiplier) {
          root.scale.multiplyScalar(options.scaleMultiplier);
        }
        if (options.offset) {
          root.position.add(options.offset);
        }

        anchor.add(root);

        if (options.onLoad) {
          options.onLoad(anchor, root);
        }
      },
      undefined,
      () => {
        if (options.onError) {
          options.onError(anchor);
        }
      }
    );

    return anchor;
  }

  function createHazeTexture(size) {
    const textureCanvas = makeCanvas(size, size);
    const ctx = textureCanvas.getContext("2d");
    const center = size * 0.5;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, size * 0.48);
    gradient.addColorStop(0, "rgba(255,255,255,0.96)");
    gradient.addColorStop(0.4, "rgba(255,244,248,0.7)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const hazeTexture = new THREE.CanvasTexture(textureCanvas);
    hazeTexture.needsUpdate = true;
    return hazeTexture;
  }

  function createBlossomTexture(size) {
    const textureCanvas = makeCanvas(size, size);
    const ctx = textureCanvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);

    for (let i = 0; i < 9; i += 1) {
      const x = size * (0.26 + Math.random() * 0.48);
      const y = size * (0.26 + Math.random() * 0.48);
      const radius = size * (0.1 + Math.random() * 0.08);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "rgba(255,241,246,0.95)");
      gradient.addColorStop(0.58, "rgba(245,168,199,0.88)");
      gradient.addColorStop(1, "rgba(245,168,199,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(17, 17, 17, 0.14)";
    ctx.lineWidth = Math.max(1, size * 0.008);
    for (let i = 0; i < 12; i += 1) {
      ctx.beginPath();
      ctx.arc(
        size * (0.22 + Math.random() * 0.56),
        size * (0.22 + Math.random() * 0.56),
        size * (0.04 + Math.random() * 0.08),
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }

    const blossomTexture = new THREE.CanvasTexture(textureCanvas);
    blossomTexture.needsUpdate = true;
    return blossomTexture;
  }

  function createPetalTexture(width, height, color) {
    const textureCanvas = makeCanvas(width, height);
    const ctx = textureCanvas.getContext("2d");
    ctx.translate(width * 0.5, height * 0.5);
    ctx.rotate(-0.18);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -height * 0.34);
    ctx.bezierCurveTo(width * 0.28, -height * 0.18, width * 0.24, height * 0.12, 0, height * 0.34);
    ctx.bezierCurveTo(-width * 0.24, height * 0.12, -width * 0.28, -height * 0.18, 0, -height * 0.34);
    ctx.fill();
    ctx.strokeStyle = "rgba(17, 17, 17, 0.18)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    const petalTexture = new THREE.CanvasTexture(textureCanvas);
    petalTexture.needsUpdate = true;
    return petalTexture;
  }

  function createFireTexture(size) {
    const textureCanvas = makeCanvas(size, size);
    const ctx = textureCanvas.getContext("2d");
    const gradient = ctx.createRadialGradient(
      size * 0.5,
      size * 0.62,
      size * 0.05,
      size * 0.5,
      size * 0.45,
      size * 0.42
    );
    gradient.addColorStop(0, "rgba(255, 249, 214, 1)");
    gradient.addColorStop(0.22, "rgba(255, 219, 132, 0.96)");
    gradient.addColorStop(0.55, "rgba(255, 142, 72, 0.9)");
    gradient.addColorStop(0.82, "rgba(212, 71, 28, 0.46)");
    gradient.addColorStop(1, "rgba(212, 71, 28, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(size * 0.5, size * 0.08);
    ctx.bezierCurveTo(size * 0.82, size * 0.24, size * 0.86, size * 0.6, size * 0.5, size * 0.92);
    ctx.bezierCurveTo(size * 0.14, size * 0.6, size * 0.18, size * 0.24, size * 0.5, size * 0.08);
    ctx.fill();

    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.needsUpdate = true;
    return texture;
  }

  function createGlowTexture(size, color) {
    const textureCanvas = makeCanvas(size, size);
    const ctx = textureCanvas.getContext("2d");
    const gradient = ctx.createRadialGradient(size * 0.5, size * 0.5, 0, size * 0.5, size * 0.5, size * 0.48);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.55, color.replace("1)", "0.3)").replace(", 1)", ", 0.3)"));
    gradient.addColorStop(1, color.replace("1)", "0)").replace(", 1)", ", 0)"));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.needsUpdate = true;
    return texture;
  }

  function createSkyTexture(width, height, topColor, horizonColor, lowColor) {
    const textureCanvas = makeCanvas(width, height);
    const ctx = textureCanvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, topColor);
    gradient.addColorStop(0.52, horizonColor);
    gradient.addColorStop(1, lowColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(255,255,255,0.26)";
    ctx.beginPath();
    ctx.ellipse(width * 0.78, height * 0.28, width * 0.16, height * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();

    const skyTexture = new THREE.CanvasTexture(textureCanvas);
    skyTexture.needsUpdate = true;
    return skyTexture;
  }

  function createMountainTexture(profile, palette) {
    const textureCanvas = makeCanvas(1600, 720);
    const ctx = textureCanvas.getContext("2d");
    const width = textureCanvas.width;
    const height = textureCanvas.height;
    const points = profile.map((point) => ({
      x: point[0] * width,
      y: point[1] * height,
    }));

    ctx.clearRect(0, 0, width, height);
    const fill = ctx.createLinearGradient(0, height * 0.12, 0, height * 0.86);
    fill.addColorStop(0, palette.top);
    fill.addColorStop(1, palette.bottom);

    ctx.beginPath();
    ctx.moveTo(0, height);
    points.forEach((point) => {
      ctx.lineTo(point.x, point.y);
    });
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, height);
    points.forEach((point) => {
      ctx.lineTo(point.x, point.y);
    });
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.clip();

    ctx.strokeStyle = palette.hatch;
    ctx.lineWidth = 2;
    for (let x = -height; x < width + height; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, height);
      ctx.lineTo(x + height * 0.5, height * 0.26);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(17, 17, 17, 0.36)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();

    palette.caps.forEach((index) => {
      const peak = points[index];
      const left = points[Math.max(0, index - 1)];
      const right = points[Math.min(points.length - 1, index + 1)];
      ctx.fillStyle = "rgba(248, 251, 255, 0.95)";
      ctx.beginPath();
      ctx.moveTo(left.x + (peak.x - left.x) * 0.28, left.y + (peak.y - left.y) * 0.3);
      ctx.lineTo(peak.x, peak.y + 10);
      ctx.lineTo(right.x - (right.x - peak.x) * 0.28, right.y - (right.y - peak.y) * 0.26);
      ctx.lineTo(peak.x + 14, peak.y + 44);
      ctx.lineTo(peak.x - 16, peak.y + 50);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(17, 17, 17, 0.18)";
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    const mountainTexture = new THREE.CanvasTexture(textureCanvas);
    mountainTexture.needsUpdate = true;
    return mountainTexture;
  }

  function createForestTexture(width, height, tone, accent) {
    const textureCanvas = makeCanvas(width, height);
    const ctx = textureCanvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < 22; i += 1) {
      const x = (i / 21) * width;
      const treeHeight = height * (0.32 + Math.random() * 0.48);
      const baseY = height;
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.moveTo(x, baseY - treeHeight);
      ctx.lineTo(x - treeHeight * 0.2, baseY);
      ctx.lineTo(x + treeHeight * 0.2, baseY);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = accent;
      ctx.fillRect(x - 1.5, baseY - treeHeight * 0.2, 3, treeHeight * 0.2);
    }

    const forestTexture = new THREE.CanvasTexture(textureCanvas);
    forestTexture.needsUpdate = true;
    return forestTexture;
  }

  function createSakuraTreeTexture(width, height, blossomTint) {
    const textureCanvas = makeCanvas(width, height);
    const ctx = textureCanvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = "rgba(57, 42, 38, 0.95)";
    ctx.lineWidth = width * 0.04;
    ctx.beginPath();
    ctx.moveTo(width * 0.49, height * 0.98);
    ctx.quadraticCurveTo(width * 0.48, height * 0.74, width * 0.46, height * 0.56);
    ctx.stroke();

    const branches = [
      [0.46, 0.58, 0.28, 0.28, 0.018],
      [0.47, 0.55, 0.68, 0.22, 0.016],
      [0.46, 0.52, 0.18, 0.46, 0.013],
      [0.5, 0.49, 0.82, 0.42, 0.012],
      [0.48, 0.42, 0.38, 0.18, 0.011],
      [0.49, 0.4, 0.7, 0.13, 0.01],
      [0.45, 0.34, 0.2, 0.14, 0.008],
      [0.51, 0.32, 0.8, 0.18, 0.008],
    ];

    branches.forEach((branch) => {
      ctx.strokeStyle = "rgba(60, 44, 40, 0.94)";
      ctx.lineWidth = width * branch[4];
      ctx.beginPath();
      ctx.moveTo(width * branch[0], height * branch[1]);
      ctx.quadraticCurveTo(
        width * ((branch[0] + branch[2]) * 0.5 + randomBetween(-0.04, 0.04)),
        height * ((branch[1] + branch[3]) * 0.5 + randomBetween(-0.06, 0.06)),
        width * branch[2],
        height * branch[3]
      );
      ctx.stroke();
    });

    for (let i = 0; i < 92; i += 1) {
      const x = width * (0.12 + Math.random() * 0.74);
      const y = height * (0.04 + Math.random() * 0.46);
      const radius = width * (0.04 + Math.random() * 0.065);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "rgba(255,244,248,0.98)");
      gradient.addColorStop(0.58, blossomTint || "rgba(245,168,199,0.92)");
      gradient.addColorStop(1, "rgba(245,168,199,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(232, 114, 160, 0.42)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 34; i += 1) {
      ctx.beginPath();
      ctx.arc(
        width * (0.18 + Math.random() * 0.64),
        height * (0.12 + Math.random() * 0.48),
        width * (0.012 + Math.random() * 0.02),
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.needsUpdate = true;
    return texture;
  }

  function createMistBandTexture(width, height, tint) {
    const textureCanvas = makeCanvas(width, height);
    const ctx = textureCanvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.35, tint || "rgba(230,236,245,0.72)");
    gradient.addColorStop(0.7, tint || "rgba(230,236,245,0.72)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.needsUpdate = true;
    return texture;
  }

  function createStoneFloorTexture(width, height) {
    const textureCanvas = makeCanvas(width, height);
    const ctx = textureCanvas.getContext("2d");

    ctx.fillStyle = "rgba(190, 196, 204, 1)";
    ctx.fillRect(0, 0, width, height);

    const rows = 11;
    const cols = 9;
    const tileW = width / cols;
    const tileH = height / rows;

    for (let row = 0; row < rows; row += 1) {
      const offset = row % 2 === 0 ? 0 : tileW * 0.22;
      for (let col = -1; col < cols + 1; col += 1) {
        const x = col * tileW + offset;
        const y = row * tileH;
        const shade = 160 + Math.floor(Math.random() * 38);
        ctx.fillStyle = "rgba(" + shade + "," + (shade + 4) + "," + (shade + 10) + ",0.95)";
        ctx.fillRect(x + 4, y + 4, tileW - 8, tileH - 8);

        ctx.strokeStyle = "rgba(77, 85, 95, 0.42)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 4, y + 4, tileW - 8, tileH - 8);

        if (Math.random() > 0.45) {
          ctx.strokeStyle = "rgba(112, 120, 128, 0.26)";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(x + tileW * 0.18, y + tileH * 0.45);
          ctx.lineTo(x + tileW * 0.52, y + tileH * (0.36 + Math.random() * 0.2));
          ctx.lineTo(x + tileW * 0.78, y + tileH * 0.64);
          ctx.stroke();
        }
      }
    }

    const grime = ctx.createRadialGradient(width * 0.5, height * 0.45, width * 0.04, width * 0.5, height * 0.45, width * 0.62);
    grime.addColorStop(0, "rgba(255,255,255,0)");
    grime.addColorStop(1, "rgba(94, 103, 112, 0.18)");
    ctx.fillStyle = grime;
    ctx.fillRect(0, 0, width, height);

    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.needsUpdate = true;
    return texture;
  }

  function createMossTexture(width, height) {
    const textureCanvas = makeCanvas(width, height);
    const ctx = textureCanvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < 24; i += 1) {
      const x = randomBetween(width * 0.08, width * 0.92);
      const y = randomBetween(height * 0.08, height * 0.92);
      const radius = randomBetween(width * 0.05, width * 0.16);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "rgba(106, 129, 104, 0.36)");
      gradient.addColorStop(0.55, "rgba(121, 148, 116, 0.22)");
      gradient.addColorStop(1, "rgba(121, 148, 116, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.needsUpdate = true;
    return texture;
  }

  const stoneFloorTexture = createStoneFloorTexture(1024, 1024);
  stoneFloorTexture.wrapS = THREE.RepeatWrapping;
  stoneFloorTexture.wrapT = THREE.RepeatWrapping;
  stoneFloorTexture.repeat.set(8, 10);
  const stoneFloorMaterial = new THREE.MeshBasicMaterial({
    map: stoneFloorTexture,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const mossPatchMaterial = new THREE.MeshBasicMaterial({
    map: createMossTexture(1024, 1024),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    opacity: 0.6,
  });

  function addMountainLayer(options) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(options.width, options.height),
      new THREE.MeshBasicMaterial({
        map: createMountainTexture(options.profile, options.palette),
        transparent: true,
        opacity: options.opacity,
        depthWrite: false,
      })
    );
    plane.position.set(options.x, options.y, options.z);
    farGroup.add(plane);
    return plane;
  }

  const skyPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 720),
    new THREE.MeshBasicMaterial({
      map: createSkyTexture(
        1600,
        1000,
        "rgba(214,226,242,1)",
        "rgba(242,246,250,1)",
        "rgba(234,238,242,1)"
      ),
      depthWrite: false,
    })
  );
  skyPlane.position.set(0, 28, -340);
  farGroup.add(skyPlane);

  const horizonBand = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 24),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.46,
      color: 0xd9e0e8,
      depthWrite: false,
    })
  );
  horizonBand.position.set(0, 3, -210);
  farGroup.add(horizonBand);

  const mountainLayers = [
    addMountainLayer({
      x: -6,
      y: 18,
      z: -280,
      width: 170,
      height: 52,
      opacity: 1,
      profile: [
        [0.0, 0.72],
        [0.08, 0.52],
        [0.16, 0.64],
        [0.26, 0.38],
        [0.34, 0.58],
        [0.45, 0.24],
        [0.58, 0.55],
        [0.69, 0.34],
        [0.82, 0.58],
        [0.92, 0.42],
        [1.0, 0.7],
      ],
      palette: {
        top: "rgba(206, 217, 231, 1)",
        bottom: "rgba(123, 139, 161, 1)",
        hatch: "rgba(255,255,255,0.12)",
        caps: [3, 5, 7, 9],
      },
    }),
    addMountainLayer({
      x: 10,
      y: 14,
      z: -235,
      width: 150,
      height: 42,
      opacity: 0.88,
      profile: [
        [0.0, 0.78],
        [0.1, 0.6],
        [0.22, 0.5],
        [0.34, 0.28],
        [0.45, 0.44],
        [0.56, 0.36],
        [0.65, 0.52],
        [0.76, 0.34],
        [0.88, 0.48],
        [1.0, 0.7],
      ],
      palette: {
        top: "rgba(193, 205, 220, 0.98)",
        bottom: "rgba(101, 118, 143, 0.98)",
        hatch: "rgba(255,255,255,0.11)",
        caps: [3, 7],
      },
    }),
    addMountainLayer({
      x: -14,
      y: 11,
      z: -190,
      width: 138,
      height: 34,
      opacity: 0.78,
      profile: [
        [0.0, 0.82],
        [0.12, 0.56],
        [0.23, 0.68],
        [0.36, 0.44],
        [0.48, 0.54],
        [0.62, 0.34],
        [0.74, 0.58],
        [0.86, 0.46],
        [1.0, 0.76],
      ],
      palette: {
        top: "rgba(181, 193, 209, 0.96)",
        bottom: "rgba(84, 100, 124, 0.96)",
        hatch: "rgba(255,255,255,0.1)",
        caps: [5],
      },
    }),
  ];

  mountainLayers.push(
    addMountainLayer({
      x: 2,
      y: 19.5,
      z: -338,
      width: 138,
      height: 66,
      opacity: 1,
      profile: [
        [0.0, 0.9],
        [0.12, 0.78],
        [0.24, 0.66],
        [0.34, 0.56],
        [0.42, 0.4],
        [0.47, 0.24],
        [0.5, 0.1],
        [0.53, 0.24],
        [0.58, 0.4],
        [0.66, 0.56],
        [0.76, 0.68],
        [0.88, 0.78],
        [1.0, 0.9],
      ],
      palette: {
        top: "rgba(223, 231, 242, 0.98)",
        bottom: "rgba(95, 111, 136, 0.98)",
        hatch: "rgba(255,255,255,0.1)",
        caps: [5],
      },
    })
  );

  mountainLayers.push(
    addMountainLayer({
      x: -4,
      y: 4.5,
      z: -142,
      width: 196,
      height: 24,
      opacity: 0.62,
      profile: [
        [0.0, 0.9],
        [0.1, 0.72],
        [0.24, 0.66],
        [0.38, 0.52],
        [0.52, 0.58],
        [0.64, 0.48],
        [0.78, 0.56],
        [0.9, 0.62],
        [1.0, 0.84],
      ],
      palette: {
        top: "rgba(137, 151, 173, 0.8)",
        bottom: "rgba(74, 87, 107, 0.8)",
        hatch: "rgba(255,255,255,0.06)",
        caps: [],
      },
    })
  );

  const forestBack = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 18),
    new THREE.MeshBasicMaterial({
      map: createForestTexture(1600, 300, "rgba(40, 55, 48, 0.86)", "rgba(20, 28, 24, 0.86)"),
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    })
  );
  forestBack.position.set(-10, -0.8, -150);
  farGroup.add(forestBack);

  const forestMid = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 14),
    new THREE.MeshBasicMaterial({
      map: createForestTexture(1400, 280, "rgba(48, 66, 58, 0.92)", "rgba(18, 26, 23, 0.86)"),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
  );
  forestMid.position.set(8, -2.2, -108);
  midGroup.add(forestMid);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 230),
    stoneFloorMaterial.clone()
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, GROUND_Y, -64);
  midGroup.add(ground);

  [
    { x: -24, z: -26, w: 36, h: 34, r: 0.08, opacity: 0.34 },
    { x: -16, z: -86, w: 40, h: 58, r: -0.06, opacity: 0.28 },
    { x: 18, z: -40, w: 32, h: 48, r: 0.04, opacity: 0.22 },
    { x: 28, z: -106, w: 42, h: 56, r: -0.03, opacity: 0.18 },
  ].forEach((patch) => {
    const moss = new THREE.Mesh(
      new THREE.PlaneGeometry(patch.w, patch.h),
      mossPatchMaterial.clone()
    );
    moss.material.opacity = patch.opacity;
    moss.rotation.x = -Math.PI / 2;
    moss.rotation.z = patch.r;
    moss.position.set(patch.x, GROUND_Y + 0.02, patch.z);
    midGroup.add(moss);
  });

  const riverShapePoints = [
    new THREE.Vector2(-14, 10),
    new THREE.Vector2(-24, 0),
    new THREE.Vector2(-30, -20),
    new THREE.Vector2(-30, -44),
    new THREE.Vector2(-24, -66),
    new THREE.Vector2(-10, -84),
    new THREE.Vector2(4, -90),
    new THREE.Vector2(16, -86),
    new THREE.Vector2(24, -72),
    new THREE.Vector2(26, -48),
    new THREE.Vector2(25, -24),
    new THREE.Vector2(20, -6),
    new THREE.Vector2(10, 6),
    new THREE.Vector2(-2, 12),
  ];

  const riverShape = new THREE.Shape();
  riverShape.moveTo(riverShapePoints[0].x, riverShapePoints[0].y);
  riverShapePoints.slice(1).forEach((point) => {
    riverShape.lineTo(point.x, point.y);
  });
  riverShape.closePath();

  const riverGeometry = new THREE.ShapeGeometry(riverShape, 80);

  const waterMaterial = new THREE.ShaderMaterial({
    transparent: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x1d4d82) },
      uMid: { value: new THREE.Color(0x4d86bf) },
      uReflect: { value: new THREE.Color(0xb4d4f2) },
      uBank: { value: new THREE.Color(0x29557f) },
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
      "uniform float uTime;",
      "uniform vec3 uDeep;",
      "uniform vec3 uMid;",
      "uniform vec3 uReflect;",
      "uniform vec3 uBank;",
      "void main() {",
      "  vec2 centered = vUv - 0.5;",
      "  float radial = 1.0 - clamp(length(centered * vec2(1.18, 0.92)) * 1.52, 0.0, 1.0);",
      "  vec2 uv = vUv;",
      "  uv.x += sin(vUv.y * 7.0 + uTime * 1.45) * 0.045;",
      "  uv.y += cos(vUv.x * 6.2 - uTime * 1.2) * 0.038;",
      "  float sweepA = sin((uv.x * 1.5 + uv.y * 3.2) * 10.0 - uTime * 4.0) * 0.5 + 0.5;",
      "  float sweepB = cos((uv.x * 3.0 - uv.y * 2.1) * 8.0 + uTime * 3.1) * 0.5 + 0.5;",
      "  float rippleA = sin((uv.x + uv.y) * 20.0 - uTime * 5.1) * 0.5 + 0.5;",
      "  float rippleB = sin(length((uv - 0.5) * vec2(1.22, 0.88)) * 36.0 - uTime * 6.0) * 0.5 + 0.5;",
      "  float motion = sweepA * 0.34 + sweepB * 0.28 + rippleA * 0.2 + rippleB * 0.18;",
      "  float depthMix = smoothstep(0.04, 0.9, radial * 0.78 + motion * 0.22);",
      "  float reflection = smoothstep(0.56, 0.98, motion) * 0.22;",
      "  vec3 color = mix(uBank, uDeep, depthMix);",
      "  color = mix(color, uMid, radial * 0.16 + motion * 0.3);",
      "  color = mix(color, uReflect, reflection);",
      "  gl_FragColor = vec4(color, 1.0);",
      "}",
    ].join("\n"),
  });

  const waterShadow = new THREE.Mesh(
    riverGeometry,
    new THREE.MeshBasicMaterial({
      color: 0x102a45,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  waterShadow.rotation.x = -Math.PI / 2;
  waterShadow.position.set(0, GROUND_Y - 0.02, 0);
  waterShadow.scale.set(1.08, 1.08, 1.08);
  midGroup.add(waterShadow);

  const shoreline = new THREE.Mesh(
    riverGeometry,
    inkMaterial(0xdfe3e7, { side: THREE.DoubleSide })
  );
  shoreline.rotation.x = -Math.PI / 2;
  shoreline.position.set(0, SHORE_Y, 0);
  shoreline.scale.set(1.12, 1.12, 1.12);
  midGroup.add(shoreline);

  const river = new THREE.Mesh(riverGeometry, waterMaterial);
  river.rotation.x = -Math.PI / 2;
  river.position.set(0, WATER_Y, 0);
  midGroup.add(river);

  const waterGlow = new THREE.Mesh(
    riverGeometry,
    new THREE.MeshBasicMaterial({
      color: 0x82b6e8,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  waterGlow.rotation.x = -Math.PI / 2;
  waterGlow.position.set(0, WATER_Y + 0.01, 0);
  waterGlow.scale.set(0.88, 0.88, 0.88);
  midGroup.add(waterGlow);

  const riverOutlinePoints = riverShapePoints.map(
    (point) => new THREE.Vector3(point.x, WATER_Y + 0.02, point.y)
  );
  riverOutlinePoints.push(new THREE.Vector3(riverShapePoints[0].x, WATER_Y + 0.02, riverShapePoints[0].y));
  const riverOutline = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(riverOutlinePoints),
    new THREE.LineBasicMaterial({ color: 0x31465c, transparent: true, opacity: 0.03 })
  );
  midGroup.add(riverOutline);

  const riverStrokes = [];
  function addRiverStroke(points, opacity) {
    const stroke = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color: 0xf7fbff,
        transparent: true,
        opacity,
      })
    );
    stroke.position.y = -5.92;
    midGroup.add(stroke);
    riverStrokes.push(stroke);
  }

  const mistBands = [];
  function addMistBand(x, y, z, width, height, opacity) {
    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        map: createMistBandTexture(1024, 256),
        transparent: true,
        opacity,
        depthWrite: false,
      })
    );
    band.position.set(x, y, z);
    midGroup.add(band);
    mistBands.push(band);
  }

  function createRock(x, z, scale, color) {
    const rock = new THREE.Group();
    addOutlinedMesh(
      rock,
      new THREE.SphereGeometry(1, 10, 8),
      inkMaterial(color || 0xd4d1cb),
      {
        position: new THREE.Vector3(0, 0, 0),
        rotation: new THREE.Euler(randomBetween(-0.3, 0.3), randomBetween(0, Math.PI), 0),
        scale: new THREE.Vector3(scale * 1.4, scale, scale * 1.1),
        outline: false,
      }
    );
    rock.position.set(x, GROUND_Y + scale * 0.12, z);
    nearGroup.add(rock);
    return rock;
  }

  const bushClusters = [];
  function createBushCluster(x, z, scale, tint) {
    const bush = new THREE.Group();
    const tone = tint || 0x90a78f;
    const darkTone = tone - 0x111111;

    [
      { x: -0.9, y: 0.52, z: 0.2, s: 1.2 },
      { x: 0.0, y: 0.7, z: 0.0, s: 1.45 },
      { x: 1.0, y: 0.48, z: -0.18, s: 1.12 },
      { x: 0.18, y: 0.34, z: 0.52, s: 1.0 },
    ].forEach((blob, index) => {
      addOutlinedMesh(
        bush,
        new THREE.SphereGeometry(1, 10, 8),
        inkMaterial(index % 2 === 0 ? tone : darkTone),
        {
          position: new THREE.Vector3(blob.x, blob.y, blob.z),
          scale: blob.s,
          outline: false,
        }
      );
    });

    bush.position.set(x, GROUND_Y, z);
    bush.scale.setScalar(scale);
    midGroup.add(bush);
    bushClusters.push(bush);
    return bush;
  }

  function createStoneBridge(x, z, scale, rotationY) {
    const bridge = new THREE.Group();
    bridge.position.set(x, GROUND_Y, z);
    bridge.rotation.y = rotationY || 0;
    bridge.scale.setScalar(scale || 1);

    const stone = inkMaterial(0xc6ced6);
    const darkStone = inkMaterial(0x99a5b4);

    for (let i = -4; i <= 4; i += 1) {
      const t = Math.abs(i) / 4;
      const rise = (1.0 - t * t) * 1.8 + 0.18;
      addOutlinedMesh(
        bridge,
        new THREE.BoxGeometry(2.2, 0.34, 2.9),
        i === 0 ? darkStone : stone,
        {
          position: new THREE.Vector3(i * 2.14, rise, 0),
        }
      );

      if (i > -4 && i < 4) {
        addOutlinedMesh(
          bridge,
          new THREE.BoxGeometry(0.26, 1.5, 0.26),
          darkStone,
          {
            position: new THREE.Vector3(i * 2.14, rise + 0.84, 1.78),
          }
        );
        addOutlinedMesh(
          bridge,
          new THREE.BoxGeometry(0.26, 1.5, 0.26),
          darkStone,
          {
            position: new THREE.Vector3(i * 2.14, rise + 0.84, -1.78),
          }
        );
      }
    }

    addOutlinedMesh(
      bridge,
      new THREE.BoxGeometry(14.6, 0.18, 0.24),
      darkStone,
      { position: new THREE.Vector3(0, 2.58, 1.78) }
    );
    addOutlinedMesh(
      bridge,
      new THREE.BoxGeometry(14.6, 0.18, 0.24),
      darkStone,
      { position: new THREE.Vector3(0, 2.58, -1.78) }
    );

    midGroup.add(bridge);
    return bridge;
  }

  function createBankSteps(x, z, rotationY) {
    const steps = new THREE.Group();
    const stone = inkMaterial(0xc9d0d7);
    const darkStone = inkMaterial(0xa0a8b0);
    steps.position.set(x, GROUND_Y, z);
    steps.rotation.y = rotationY || 0;

    [
      { w: 6.8, h: 0.3, d: 2.8, y: 0.18, z: 0 },
      { w: 5.6, h: 0.26, d: 2.5, y: -0.06, z: 2.5 },
      { w: 4.2, h: 0.22, d: 2.2, y: -0.28, z: 4.8 },
    ].forEach((step, index) => {
      addOutlinedMesh(
        steps,
        new THREE.BoxGeometry(step.w, step.h, step.d),
        index === 0 ? darkStone : stone,
        {
          position: new THREE.Vector3(0, step.y, step.z),
        }
      );
    });

    midGroup.add(steps);
    return steps;
  }

  function createTempleApproach(x, z) {
    const approach = new THREE.Group();
    const stepStone = inkMaterial(0xc2c8d0);
    const darkStepStone = inkMaterial(0xa2aab4);
    approach.position.set(x, GROUND_Y, z);
    approach.rotation.y = -Math.PI * 0.16;

    const court = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 30),
      stoneFloorMaterial.clone()
    );
    court.rotation.x = -Math.PI / 2;
    court.position.set(-1.4, 0.04, 12.5);
    approach.add(court);

    const courtOutline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(18, 30)),
      new THREE.LineBasicMaterial({
        color: 0x111111,
        transparent: true,
        opacity: 0.36,
      })
    );
    courtOutline.rotation.x = -Math.PI / 2;
    courtOutline.position.copy(court.position);
    approach.add(courtOutline);

    [
      { width: 13.4, height: 0.34, depth: 4.4, y: 0.16, zOffset: 24.6 },
      { width: 12.1, height: 0.3, depth: 3.9, y: 0.26, zOffset: 21.0 },
      { width: 10.7, height: 0.26, depth: 3.4, y: 0.34, zOffset: 17.8 },
    ].forEach((step, index) => {
      addOutlinedMesh(
        approach,
        new THREE.BoxGeometry(step.width, step.height, step.depth),
        index === 0 ? darkStepStone : stepStone,
        {
          position: new THREE.Vector3(-1.5, step.y, step.zOffset),
        }
      );
    });

    [
      { lx: 3.8, z: 24.6, w: 3.8, d: 2.8, y: 0.2, r: 0.02 },
      { lx: 5.8, z: 29.8, w: 3.7, d: 2.7, y: 0.17, r: -0.04 },
      { lx: 7.9, z: 35.0, w: 3.6, d: 2.6, y: 0.14, r: 0.03 },
      { lx: 9.8, z: 40.2, w: 3.5, d: 2.5, y: 0.11, r: -0.03 },
      { lx: 11.4, z: 45.0, w: 3.4, d: 2.4, y: 0.08, r: 0.02 },
      { lx: 12.8, z: 49.6, w: 3.2, d: 2.3, y: 0.06, r: -0.02 },
    ].forEach((slab, index) => {
      addOutlinedMesh(
        approach,
        new THREE.BoxGeometry(slab.w, 0.18, slab.d),
        index % 2 === 0 ? stepStone : darkStepStone,
        {
          position: new THREE.Vector3(slab.lx, slab.y, slab.z),
          rotation: new THREE.Euler(0, slab.r, 0),
          outline: false,
        }
      );
    });

    midGroup.add(approach);
    return approach;
  }

  const lanterns = [];

  function createStoneLantern(x, z, scale) {
    const lantern = new THREE.Group();
    const stone = inkMaterial(0xcfd3da);

    addOutlinedMesh(
      lantern,
      new THREE.CylinderGeometry(0.18, 0.22, 2.2, 6),
      stone,
      { position: new THREE.Vector3(0, 1.1, 0) }
    );
    addOutlinedMesh(
      lantern,
      new THREE.BoxGeometry(0.7, 0.5, 0.7),
      stone,
      { position: new THREE.Vector3(0, 2.35, 0) }
    );
    addOutlinedMesh(
      lantern,
      new THREE.CylinderGeometry(0.65, 0.48, 0.18, 6),
      stone,
      { position: new THREE.Vector3(0, 2.76, 0) }
    );
    addOutlinedMesh(
      lantern,
      new THREE.CylinderGeometry(0.34, 0.4, 0.22, 6),
      stone,
      { position: new THREE.Vector3(0, 0.1, 0) }
    );

    const glowCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffcc8f,
        transparent: true,
        opacity: 0.88,
      })
    );
    glowCore.position.set(0, 2.28, 0);
    lantern.add(glowCore);

    const glowLight = new THREE.PointLight(0xffc98f, 0.9, 18, 2);
    glowLight.position.set(0, 2.3, 0);
    lantern.add(glowLight);

    lantern.position.set(x, GROUND_Y + 0.02, z);
    lantern.scale.setScalar(scale);
    midGroup.add(lantern);
    lanterns.push({ group: lantern, light: glowLight, core: glowCore });
    return lantern;
  }

  function createTemple(x, z, scale) {
    const temple = new THREE.Group();
    const stone = inkMaterial(0xc5ced9);
    const roofTone = inkMaterial(0x4f627a);
    const darkStone = inkMaterial(0x98a4b4);

    addOutlinedMesh(
      temple,
      new THREE.BoxGeometry(18, 1.5, 13),
      darkStone,
      { position: new THREE.Vector3(0, 0.75, 0) }
    );

    addOutlinedMesh(
      temple,
      new THREE.BoxGeometry(13, 1.2, 9.6),
      stone,
      { position: new THREE.Vector3(0, 1.95, 0.4) }
    );

    for (let i = 0; i < 4; i += 1) {
      addOutlinedMesh(
        temple,
        new THREE.BoxGeometry(6.6 - i * 1.15, 0.28, 1.2),
        stone,
        { position: new THREE.Vector3(0, 0.18 + i * 0.28, 6.4 + i * 0.7) }
      );
    }

    for (let i = 0; i < 5; i += 1) {
      addOutlinedMesh(
        temple,
        new THREE.BoxGeometry(7.2 - i * 0.9, 0.22, 1.35),
        darkStone,
        { position: new THREE.Vector3(0, 0.14 + i * 0.22, 7.9 + i * 0.9) }
      );
    }

    const pillarPositions = [
      [-4.1, 4.5, 2.5],
      [4.1, 4.5, 2.5],
      [-4.1, 4.5, -2.2],
      [4.1, 4.5, -2.2],
    ];

    pillarPositions.forEach((entry) => {
      addOutlinedMesh(
        temple,
        new THREE.BoxGeometry(0.72, 5.2, 0.72),
        stone,
        { position: new THREE.Vector3(entry[0], entry[1], entry[2]) }
      );
    });

    addOutlinedMesh(
      temple,
      new THREE.BoxGeometry(9.4, 4.8, 6.2),
      stone,
      { position: new THREE.Vector3(0, 4.4, 0.1) }
    );

    addOutlinedMesh(
      temple,
      new THREE.BoxGeometry(3.8, 5.8, 0.4),
      darkStone,
      { position: new THREE.Vector3(0, 3.9, 3.35) }
    );

    addOutlinedMesh(
      temple,
      new THREE.CylinderGeometry(7.5, 8.8, 0.78, 4),
      roofTone,
      {
        position: new THREE.Vector3(0, 7.0, 0.4),
        rotation: new THREE.Euler(0, Math.PI * 0.25, 0),
      }
    );

    addOutlinedMesh(
      temple,
      new THREE.BoxGeometry(4.8, 2.9, 3.8),
      stone,
      { position: new THREE.Vector3(0, 9.0, 0.2) }
    );

    addOutlinedMesh(
      temple,
      new THREE.CylinderGeometry(5.8, 6.8, 0.42, 4),
      roofTone,
      {
        position: new THREE.Vector3(0, 8.35, 0.2),
        rotation: new THREE.Euler(0, Math.PI * 0.25, 0),
      }
    );

    addOutlinedMesh(
      temple,
      new THREE.CylinderGeometry(4.6, 5.5, 0.58, 4),
      roofTone,
      {
        position: new THREE.Vector3(0, 10.8, 0.2),
        rotation: new THREE.Euler(0, Math.PI * 0.25, 0),
      }
    );

    addOutlinedMesh(
      temple,
      new THREE.CylinderGeometry(0.26, 0.34, 1.8, 6),
      darkStone,
      { position: new THREE.Vector3(0, 12.1, 0.2) }
    );

    temple.position.set(x, GROUND_Y, z);
    temple.scale.setScalar(scale);
    midGroup.add(temple);

    createStoneLantern(x - 7.5 * scale, z + 5.4 * scale, 1.05 * scale);
    createStoneLantern(x + 7.5 * scale, z + 5.4 * scale, 1.05 * scale);
    createStoneLantern(x - 11.2 * scale, z - 3.6 * scale, 0.84 * scale);
    createStoneLantern(x + 11.2 * scale, z - 3.6 * scale, 0.84 * scale);

    return temple;
  }

  const temple = createTemple(24, -56, 1.42);
  let templeModelAnchor = null;

  templeModelAnchor = placeModel("./models/the_temple_-_bar.glb", {
    parent: midGroup,
    position: new THREE.Vector3(24, -6.22, -56),
    rotation: new THREE.Euler(0, -Math.PI * 0.56, 0),
    targetHeight: 26,
    scaleMultiplier: 1.08,
    onLoad: () => {
      temple.visible = false;
    },
  });

  [
    [14.2, -32.0, 1.08, 0xc7ced5],
    [12.4, -76.0, 1.18, 0xd6d8d8],
    [42.0, -54.0, 1.06, 0xc1c9d0],
    [46.0, -30.0, 0.94, 0xd5d8dd],
    [30.0, -88.0, 0.82, 0xc8d0c9],
    [-36.0, -44.0, 0.98, 0xb4c1b2],
    [-20.0, 18.0, 0.84, 0xc4cac9],
    [-30.0, -24.0, 0.82, 0xd2d4cf],
    [-37.0, -10.0, 0.76, 0xc5cac6],
    [36.0, 0.0, 0.74, 0xd3d7d6],
  ].forEach((entry) => {
    createRock(entry[0], entry[1], entry[2], entry[3]);
  });

  createStoneBridge(-4, 8, 0.76, 0.12);
  createBankSteps(28, -18, -0.46);
  createBankSteps(26, -54, -0.72);
  [
    [-28, -12, 0.78, 0xcad1d4],
    [-24, -60, 0.92, 0xc4ccd2],
    [6, -94, 0.86, 0xbec8c9],
    [34, -4, 0.72, 0xd5d9dc],
    [40, -72, 0.84, 0xc6cfd4],
    [18, 18, 0.8, 0xc8d0d7],
  ].forEach((entry) => {
    createRock(entry[0], entry[1], entry[2], entry[3]);
  });
  [
    [-40, -8, 1.06, 0x95a88e],
    [-34, 18, 0.96, 0x8ca083],
    [32, 24, 0.92, 0x93aa8c],
    [42, 8, 0.88, 0x8fa28a],
    [38, -18, 0.94, 0x8b9e84],
  ].forEach((entry) => {
    createBushCluster(entry[0], entry[1], entry[2], entry[3]);
  });
  createTempleApproach(24, -56);

  function createPineTree(x, z, scale) {
    const tree = new THREE.Group();
    const trunk = inkMaterial(0x524740);
    const foliage = inkMaterial(0x5a7368);

    addOutlinedMesh(
      tree,
      new THREE.CylinderGeometry(0.26, 0.42, 4.6, 6),
      trunk,
      { position: new THREE.Vector3(0, 2.3, 0) }
    );

    addOutlinedMesh(
      tree,
      new THREE.ConeGeometry(2.4, 3.6, 6),
      foliage,
      { position: new THREE.Vector3(0, 4.5, 0) }
    );

    addOutlinedMesh(
      tree,
      new THREE.ConeGeometry(1.9, 3.1, 6),
      foliage,
      { position: new THREE.Vector3(0, 6.4, 0) }
    );

    addOutlinedMesh(
      tree,
      new THREE.ConeGeometry(1.4, 2.6, 6),
      foliage,
      { position: new THREE.Vector3(0, 8.0, 0) }
    );

    tree.position.set(x, GROUND_Y, z);
    tree.scale.setScalar(scale);
    midGroup.add(tree);
    return tree;
  }

  function createToriiGate(x, z, scale) {
    const gate = new THREE.Group();
    const lacquer = inkMaterial(0x9a4c4e);
    const dark = inkMaterial(0x40393d);

    addOutlinedMesh(
      gate,
      new THREE.BoxGeometry(1.1, 10.6, 1.1),
      lacquer,
      { position: new THREE.Vector3(-5.1, 5.3, 0) }
    );
    addOutlinedMesh(
      gate,
      new THREE.BoxGeometry(1.1, 10.6, 1.1),
      lacquer,
      { position: new THREE.Vector3(5.1, 5.3, 0) }
    );
    addOutlinedMesh(
      gate,
      new THREE.BoxGeometry(14.8, 1.05, 1.1),
      lacquer,
      { position: new THREE.Vector3(0, 10.4, 0) }
    );
    addOutlinedMesh(
      gate,
      new THREE.BoxGeometry(16.6, 0.48, 1.35),
      dark,
      { position: new THREE.Vector3(0, 11.1, 0) }
    );
    addOutlinedMesh(
      gate,
      new THREE.BoxGeometry(8.2, 0.5, 0.7),
      dark,
      { position: new THREE.Vector3(0, 9.2, 0) }
    );

    gate.position.set(x, GROUND_Y, z);
    gate.scale.setScalar(scale);
    midGroup.add(gate);
    return gate;
  }

  const pineTrees = [];
  [
    [-40, -74, 1.15],
    [-44, -96, 1.2],
    [47, -92, 1.28],
    [46, -72, 1.18],
    [42, -114, 1.08],
    [-28, -70, 1.1],
    [-38, -92, 1.22],
  ].forEach((entry) => {
    pineTrees.push(createPineTree(entry[0], entry[1], entry[2]));
  });

  createToriiGate(-6, -134, 1.12);

  const blossomTexture = createBlossomTexture(256);
  const blossomMaterialBase = new THREE.SpriteMaterial({
    map: blossomTexture,
    transparent: true,
    depthWrite: false,
  });

  function createBlossomSprite(scale) {
    const sprite = new THREE.Sprite(blossomMaterialBase.clone());
    sprite.scale.set(scale, scale * 0.82, 1);
    return sprite;
  }

  function createCherryTree(x, z, scale) {
    const tree = new THREE.Group();
    const bark = inkMaterial(0x4a3a35);
    const bloomMap = createSakuraTreeTexture(
      700,
      1000,
      Math.random() > 0.5 ? "rgba(247,176,208,0.92)" : "rgba(236,150,193,0.92)"
    );
    const treeMaterial = new THREE.MeshBasicMaterial({
      map: bloomMap,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    addOutlinedMesh(
      tree,
      new THREE.CylinderGeometry(0.38, 0.54, 7.8, 7),
      bark,
      { position: new THREE.Vector3(0, 3.9, 0) }
    );
    addOutlinedMesh(
      tree,
      new THREE.CylinderGeometry(0.14, 0.24, 3.4, 6),
      bark,
      {
        position: new THREE.Vector3(-1.3, 7.2, 0.2),
        rotation: new THREE.Euler(0.06, 0.08, 0.68),
      }
    );
    addOutlinedMesh(
      tree,
      new THREE.CylinderGeometry(0.12, 0.2, 3.1, 6),
      bark,
      {
        position: new THREE.Vector3(1.4, 7.4, -0.2),
        rotation: new THREE.Euler(-0.08, -0.1, -0.62),
      }
    );

    const planeA = new THREE.Mesh(new THREE.PlaneGeometry(12.2, 17.8), treeMaterial);
    planeA.position.set(0, 7.0, 0);
    planeA.rotation.y = randomBetween(-0.16, 0.16);
    tree.add(planeA);

    const planeB = new THREE.Mesh(
      new THREE.PlaneGeometry(11.2, 16.2),
      treeMaterial.clone()
    );
    planeB.position.set(0.2, 7.1, -0.2);
    planeB.rotation.y = Math.PI * 0.5 + randomBetween(-0.18, 0.18);
    tree.add(planeB);

    const planeC = new THREE.Mesh(
      new THREE.PlaneGeometry(10.4, 14.6),
      treeMaterial.clone()
    );
    planeC.position.set(-0.18, 7.4, 0.24);
    planeC.rotation.y = Math.PI * 0.25 + randomBetween(-0.12, 0.12);
    tree.add(planeC);

    for (let i = 0; i < 34; i += 1) {
      const sprite = createBlossomSprite(randomBetween(1.8, 3.9));
      sprite.position.set(
        randomBetween(-3.8, 3.8),
        randomBetween(7.2, 12.8),
        randomBetween(-2.4, 2.4)
      );
      tree.add(sprite);
    }

    tree.position.set(x, GROUND_Y, z);
    tree.scale.setScalar(scale);
    nearGroup.add(tree);
    return tree;
  }

  const cherryTrees = [];
  [
    [-36, -4, 1.48],
    [-34, -26, 1.28],
    [-30, -52, 1.08],
    [-28, -78, 0.9],
    [-32, -116, 0.86],
    [42, -58, 0.98],
    [46, -86, 0.86],
    [49, -108, 0.84],
    [44, -18, 1.18],
    [40, -42, 1.08],
    [48, -66, 0.98],
    [37, -70, 0.96],
    [42, -92, 0.84],
    [52, -108, 0.9],
  ].forEach((entry) => {
    cherryTrees.push(createCherryTree(entry[0], entry[1], entry[2]));
  });

  function createOverhangBranch(position, rotationZ) {
    const branch = new THREE.Group();
    const bark = inkMaterial(0x3f312d);

    addOutlinedMesh(
      branch,
      new THREE.CylinderGeometry(0.28, 0.48, 12, 6),
      bark,
      {
        position: new THREE.Vector3(0, 0, 0),
        rotation: new THREE.Euler(0.14, 0.2, rotationZ || 1.2),
      }
    );

    addOutlinedMesh(
      branch,
      new THREE.CylinderGeometry(0.14, 0.24, 5.4, 6),
      bark,
      {
        position: new THREE.Vector3(2.8, -1.0, -0.6),
        rotation: new THREE.Euler(-0.18, 0.22, 0.68),
      }
    );

    addOutlinedMesh(
      branch,
      new THREE.CylinderGeometry(0.12, 0.18, 4.2, 6),
      bark,
      {
        position: new THREE.Vector3(4.8, -0.1, 0.4),
        rotation: new THREE.Euler(0.12, -0.2, -0.14),
      }
    );

    for (let i = 0; i < 42; i += 1) {
      const sprite = createBlossomSprite(randomBetween(1.8, 2.9));
      sprite.position.set(
        randomBetween(0.8, 6.0),
        randomBetween(-3.8, 1.4),
        randomBetween(-0.8, 0.8)
      );
      branch.add(sprite);
    }

    branch.position.copy(position || new THREE.Vector3(-24, 18, -4));
    overlayGroup.add(branch);
    return branch;
  }

  const overhangBranches = [
    createOverhangBranch(new THREE.Vector3(-24, 18, -4), 1.2),
    createOverhangBranch(new THREE.Vector3(28, 14, -18), -1.06),
  ];

  const hazeMaterial = new THREE.SpriteMaterial({
    map: createHazeTexture(256),
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });

  const hazeSprites = [];
  function addHaze(x, y, z, scale, opacity) {
    const sprite = new THREE.Sprite(hazeMaterial.clone());
    sprite.position.set(x, y, z);
    sprite.scale.set(scale, scale * 0.68, 1);
    sprite.material.opacity = opacity;
    midGroup.add(sprite);
    hazeSprites.push(sprite);
  }

  addHaze(-18, -0.6, -56, 24, 0.28);
  addHaze(14, -0.1, -84, 30, 0.24);
  addHaze(0, 4.0, -166, 48, 0.22);
  addHaze(-24, 8.5, -214, 56, 0.14);
  addHaze(26, 6.6, -244, 52, 0.12);
  addHaze(2, -1.8, -24, 18, 0.18);
  addHaze(20, 1.4, -48, 22, 0.18);
  addHaze(-30, 2.0, -92, 30, 0.14);
  addHaze(8, 8.5, -126, 44, 0.16);

  const petalMaterial = new THREE.MeshBasicMaterial({
    map: createPetalTexture(64, 96, "rgba(242, 146, 191, 0.98)"),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const leafMaterial = new THREE.MeshBasicMaterial({
    map: createPetalTexture(52, 86, "rgba(173, 196, 176, 0.9)"),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const petalGeo = new THREE.PlaneGeometry(0.72, 1.02);
  const leafGeo = new THREE.PlaneGeometry(0.42, 0.7);
  const waterPetals = [];
  const particles = [];

  [
    [-10, 2, 0.76],
    [-6, -10, 0.84],
    [-2, -26, 0.92],
    [4, -44, 0.72],
    [9, -60, 0.82],
    [15, -72, 0.88],
    [22, -64, 0.78],
    [24, -46, 0.76],
    [23, -24, 0.7],
    [14, -8, 0.66],
  ].forEach((entry, index) => {
    const mesh = new THREE.Mesh(petalGeo, petalMaterial.clone());
    mesh.material.opacity = 0.74;
    mesh.position.set(entry[0], WATER_Y + 0.06, entry[1]);
    mesh.rotation.set(
      -Math.PI / 2 + randomBetween(-0.14, 0.14),
      randomBetween(0, Math.PI * 2),
      randomBetween(-0.22, 0.22)
    );
    mesh.scale.setScalar(entry[2]);
    midGroup.add(mesh);
    waterPetals.push({
      mesh,
      baseX: entry[0],
      baseZ: entry[1],
      floatX: 0.16 + (index % 3) * 0.04,
      floatZ: 0.2 + (index % 4) * 0.03,
      phase: randomBetween(0, Math.PI * 2),
    });
  });

  function resetParticle(particle, isLeaf) {
    particle.mesh.position.set(
      randomBetween(-48, 48),
      randomBetween(4, 26),
      randomBetween(-12, -176)
    );
    particle.mesh.rotation.set(
      randomBetween(-0.8, 0.8),
      randomBetween(-0.8, 0.8),
      randomBetween(0, Math.PI * 2)
    );
    const scalar = isLeaf ? randomBetween(0.7, 1.3) : randomBetween(0.95, 1.9);
    particle.mesh.scale.setScalar(scalar);
    particle.velocityY = isLeaf ? randomBetween(0.018, 0.034) : randomBetween(0.024, 0.048);
    particle.velocityX = randomBetween(-0.03, 0.03);
    particle.spin = randomBetween(-0.02, 0.02);
  }

  for (let i = 0; i < 300; i += 1) {
    const mesh = new THREE.Mesh(petalGeo, petalMaterial);
    nearGroup.add(mesh);
    const particle = { mesh, isLeaf: false, velocityY: 0.02, velocityX: 0, spin: 0 };
    resetParticle(particle, false);
    particles.push(particle);
  }

  for (let i = 0; i < 54; i += 1) {
    const mesh = new THREE.Mesh(leafGeo, leafMaterial);
    nearGroup.add(mesh);
    const particle = { mesh, isLeaf: true, velocityY: 0.02, velocityX: 0, spin: 0 };
    resetParticle(particle, true);
    particles.push(particle);
  }

  const reeds = new THREE.Group();
  nearGroup.add(reeds);
  [
    [-31, -6, 2.1, 0x7d947f],
    [-29, -18, 2.4, 0x92a58d],
    [-26, -30, 2.0, 0x7d947f],
    [-22, -52, 2.3, 0x92a58d],
    [-16, -68, 1.9, 0x7d947f],
    [30, -6, 2.0, 0x92a58d],
    [34, -20, 2.2, 0x7d947f],
    [38, -38, 2.5, 0x92a58d],
    [36, -58, 2.1, 0x7d947f],
    [24, -82, 1.8, 0x92a58d],
    [8, 12, 1.7, 0x7d947f],
    [12, -90, 1.8, 0x92a58d],
  ].forEach((entry) => {
    const reed = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, entry[2]),
      new THREE.MeshBasicMaterial({
        color: entry[3],
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      })
    );
    reed.position.set(
      entry[0],
      GROUND_Y + 1.05,
      entry[1]
    );
    reed.rotation.set(0, randomBetween(-0.6, 0.6), randomBetween(-0.16, 0.16));
    reeds.add(reed);
  });

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        }
      });
    },
    { threshold: 0.2 }
  );

  reveals.forEach((item) => {
    revealObserver.observe(item);
  });

  function updateScrollTarget() {
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scrollState.target = window.scrollY / maxScroll;
  }

  updateScrollTarget();

  window.addEventListener("scroll", updateScrollTarget, { passive: true });

  window.addEventListener("mousemove", (event) => {
    mouse.x = event.clientX / window.innerWidth - 0.5;
    mouse.y = event.clientY / window.innerHeight - 0.5;

    if (cursor) {
      cursor.style.left = event.clientX + "px";
      cursor.style.top = event.clientY + "px";
    }
  });

  links.forEach((link) => {
    link.addEventListener("mouseenter", () => {
      if (cursor) {
        cursor.style.width = "62px";
        cursor.style.height = "62px";
        cursor.style.backgroundColor = "rgba(245, 168, 199, 0.08)";
        cursor.style.borderColor = "rgba(15, 15, 16, 1)";
      }
    });

    link.addEventListener("mouseleave", () => {
      if (cursor) {
        cursor.style.width = "42px";
        cursor.style.height = "42px";
        cursor.style.backgroundColor = "transparent";
        cursor.style.borderColor = "rgba(15, 15, 16, 0.8)";
      }
    });
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });

  function animate() {
    requestAnimationFrame(animate);

    const elapsed = clock.getElapsedTime();
    scrollState.current += (scrollState.target - scrollState.current) * 0.06;
    waterMaterial.uniforms.uTime.value = elapsed;

    const worldLift = -scrollState.current * 1.35;
    const mouseLift = mouse.y * 0.16;

    farGroup.position.x += (mouse.x * 1.9 - farGroup.position.x) * 0.03;
    farGroup.position.y += ((worldLift * 0.32 + mouseLift * 0.35) - farGroup.position.y) * 0.03;

    midGroup.position.x += (mouse.x * 3.0 - midGroup.position.x) * 0.035;
    midGroup.position.y += ((worldLift + mouseLift) - midGroup.position.y) * 0.03;

    nearGroup.position.x += (mouse.x * 4.2 - nearGroup.position.x) * 0.04;
    nearGroup.position.y += ((worldLift + mouseLift) - nearGroup.position.y) * 0.04;

    overlayGroup.position.x += (mouse.x * 5.2 - overlayGroup.position.x) * 0.04;
    overlayGroup.position.y += (mouseLift * 0.7 - overlayGroup.position.y) * 0.035;

    camera.position.x += (mouse.x * 1.9 - camera.position.x) * 0.02;
    camera.position.y += (7.2 - scrollState.current * 1.35 + mouse.y * 0.22 - camera.position.y) * 0.03;
    lookTarget.x = 1.5 + mouse.x * 5.0;
    lookTarget.y = 1.2 - scrollState.current * 2.0 + mouse.y * 0.8;
    camera.lookAt(lookTarget);

    mountainLayers.forEach((layer, index) => {
      const baseY = [18, 14, 11, 19, 4.5][index] || 11;
      layer.position.y += (baseY + Math.sin(elapsed * 0.12 + index) * 0.08 - layer.position.y) * 0.02;
    });

    riverStrokes.forEach((stroke, index) => {
      stroke.material.opacity = (index === 0 ? 0.14 : 0.09) + Math.sin(elapsed * 0.42 + index) * 0.025;
    });

    lanterns.forEach((lantern, index) => {
      const glow =
        0.82 +
        Math.sin(elapsed * 2.2 + index * 0.9) * 0.07 +
        Math.sin(elapsed * 4.8 + index * 0.5) * 0.03;
      lantern.light.intensity = glow;
      lantern.core.material.opacity = 0.66 + glow * 0.18;
      lantern.core.scale.setScalar(0.94 + glow * 0.08);
    });

    bushClusters.forEach((bush, index) => {
      bush.rotation.z = Math.sin(elapsed * 0.28 + index * 0.6) * 0.018;
    });

    pineTrees.forEach((tree, index) => {
      tree.rotation.z = Math.sin(elapsed * 0.36 + index * 0.7) * 0.12;
    });

    cherryTrees.forEach((tree, index) => {
      tree.rotation.z = Math.sin(elapsed * 0.44 + index * 0.9) * 0.18;
    });

    overhangBranches.forEach((branch, index) => {
      branch.rotation.z = Math.sin(elapsed * 0.32 + index * 0.7) * 0.04;
    });
    temple.rotation.y = Math.sin(elapsed * 0.1) * 0.02;

    if (templeModelAnchor) {
      templeModelAnchor.rotation.y += ((-Math.PI * 0.56 + Math.sin(elapsed * 0.08) * 0.03) - templeModelAnchor.rotation.y) * 0.03;
    }

    hazeSprites.forEach((sprite, index) => {
      sprite.position.x += Math.sin(elapsed * 0.16 + index) * 0.01;
      sprite.material.opacity = 0.06 + Math.sin(elapsed * 0.22 + index) * 0.025 + (index < 2 ? 0.12 : 0.04);
    });

    waterPetals.forEach((petal, index) => {
      petal.mesh.position.x =
        petal.baseX + Math.sin(elapsed * 0.2 + petal.phase + index * 0.08) * petal.floatX;
      petal.mesh.position.z =
        petal.baseZ + Math.cos(elapsed * 0.16 + petal.phase) * petal.floatZ;
      petal.mesh.rotation.z = Math.sin(elapsed * 0.34 + petal.phase) * 0.18;
      petal.mesh.rotation.y += 0.0024;
    });

    mistBands.forEach((band, index) => {
      band.position.x += Math.sin(elapsed * 0.12 + index * 0.7) * 0.006;
      band.material.opacity = (index === 0 ? 0.18 : index === 1 ? 0.13 : 0.09) + Math.sin(elapsed * 0.18 + index) * 0.02;
    });

    particles.forEach((particle, index) => {
      particle.mesh.position.y -= particle.velocityY;
      particle.mesh.position.x += particle.velocityX + Math.sin(elapsed * 0.8 + index) * 0.008;
      particle.mesh.position.z += Math.cos(elapsed * 0.4 + index) * 0.01;
      particle.mesh.rotation.z += particle.spin;
      particle.mesh.rotation.y += particle.spin * 0.7;

      if (particle.mesh.position.y < -7.2 || particle.mesh.position.z > 42) {
        resetParticle(particle, particle.isLeaf);
      }
    });

    renderer.render(scene, camera);
  }

  animate();
})();

// Remove Boot Screen after 2.5 seconds
window.addEventListener("load", () => {
  setTimeout(() => {
    document.getElementById("boot-screen").classList.add("boot-hidden");
  }, 2500);
});

// Intersection Observer for Scroll Reveals
const observerOptions = {
  root: null,
  rootMargin: '0px',
  threshold: 0.15 // Triggers when 15% of the card is visible
};

const observer = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target); // Stops observing once revealed
    }
  });
}, observerOptions);

document.querySelectorAll('.reveal').forEach((element) => {
  observer.observe(element);
});

// Comic Spotlight Mouse Tracker
const heroTitle = document.querySelector('.hero h1');

document.addEventListener('mousemove', (e) => {
  if(heroTitle) {
    // Calculate percentage based on window size
    const x = (e.clientX / window.innerWidth) * 100;
    const y = (e.clientY / window.innerHeight) * 100;
    
    // Send coordinates to the CSS
    heroTitle.style.setProperty('--cursor-x', `${x}%`);
    heroTitle.style.setProperty('--cursor-y', `${y}%`);
  }
});
