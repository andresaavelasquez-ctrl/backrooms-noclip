// Extrusión automática de sprites 2D → 2.5D (estilo "generated item model" de
// Minecraft): a partir de CUALQUIER canvas pixel-art (rasterizado, override
// PNG, o icono vectorial de render.js) construye una malla con capa frontal,
// capa trasera (reflejada) y paredes laterales de color sólido en el contorno
// — sin geometría autorada a mano, así que cualquier sprite nuevo sale
// extruido gratis. render3d.js es quien cachea texturas/geometría (mismas
// claves que ya usa su texCache); este archivo solo sabe construir, no cachea
// nada por canvas (ver plan: los canvases de objetos del suelo no son
// estables entre llamadas, cachear aquí por identidad de canvas filtraría).
(function () {
  if (!window.THREE) { window.SpriteExtrude = null; return; }

  // plano unidad compartido por TODAS las instancias (frente y dorso de todo
  // actor/objeto) — nunca se dispone individualmente, ver el guard en
  // disposeGrupo (render3d.js)
  const sharedPlane = new THREE.PlaneGeometry(1, 1);
  sharedPlane.userData.compartida = true;

  const ALPHA_TEST_DEFAULT = 0.06; // los canvases procedurales son alpha 0/255 duros

  const mirrorCache = new WeakMap();
  function mirrorCanvas(c) {
    let m = mirrorCache.get(c);
    if (m) return m;
    m = document.createElement('canvas');
    m.width = c.width; m.height = c.height;
    const ctx = m.getContext('2d');
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(c, 0, 0);
    mirrorCache.set(c, m);
    return m;
  }

  // fusiona una tira de índices [0,n) donde testFn(i) es cierto y colorFn(i)
  // no cambia, en tramos — así el contorno no dispara un quad por píxel
  function mergeRun(n, testFn, colorFn, emitFn) {
    let i = 0;
    while (i < n) {
      if (!testFn(i)) { i++; continue; }
      const c0 = colorFn(i);
      let j = i + 1;
      while (j < n && testFn(j)) {
        const cj = colorFn(j);
        if (cj[0] !== c0[0] || cj[1] !== c0[1] || cj[2] !== c0[2]) break;
        j++;
      }
      emitFn(i, j, c0);
      i = j;
    }
  }

  // paredes laterales del contorno del canvas, extruidas ±depth/2 en Z, con
  // color por vértice muestreado del propio píxel de borde. side:DoubleSide
  // en el material evita tener que derivar a mano el winding correcto de las
  // 4 orientaciones de pared (no hay iluminación real sobre los actores —
  // igual que el SpriteMaterial fullbright de hoy — así que no cuesta nada).
  function buildSideGeometry(canvas, depth) {
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, W, H).data;
    const opaque = (x, y) => x >= 0 && y >= 0 && x < W && y < H && data[(y * W + x) * 4 + 3] > 127;
    const colorAt = (x, y) => {
      const i = (y * W + x) * 4;
      return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
    };
    const halfD = depth / 2;
    const positions = [], colors = [], indices = [];

    function emitWall(ax, ay, bx, by, rgb) {
      const base = positions.length / 3;
      positions.push(ax, ay, -halfD, bx, by, -halfD, bx, by, halfD, ax, ay, halfD);
      for (let k = 0; k < 4; k++) colors.push(rgb[0], rgb[1], rgb[2]);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    // bordes horizontales (arriba/abajo de cada píxel), fusionados a lo largo de X
    for (let y = 0; y < H; y++) {
      mergeRun(W, (x) => opaque(x, y) && !opaque(x, y - 1), (x) => colorAt(x, y), (i, j, rgb) => {
        const ly = 0.5 - y / H;
        emitWall(i / W - 0.5, ly, j / W - 0.5, ly, rgb);
      });
      mergeRun(W, (x) => opaque(x, y) && !opaque(x, y + 1), (x) => colorAt(x, y), (i, j, rgb) => {
        const ly = 0.5 - (y + 1) / H;
        emitWall(i / W - 0.5, ly, j / W - 0.5, ly, rgb);
      });
    }
    // bordes verticales (izquierda/derecha de cada píxel), fusionados a lo largo de Y
    // (localY = 0.5 - fila/H: la fila 0 del canvas es arriba del todo)
    for (let x = 0; x < W; x++) {
      mergeRun(H, (y) => opaque(x, y) && !opaque(x - 1, y), (y) => colorAt(x, y), (i, j, rgb) => {
        const lx = x / W - 0.5;
        emitWall(lx, 0.5 - i / H, lx, 0.5 - j / H, rgb);
      });
      mergeRun(H, (y) => opaque(x, y) && !opaque(x + 1, y), (y) => colorAt(x, y), (i, j, rgb) => {
        const lx = (x + 1) / W - 0.5;
        emitWall(lx, 0.5 - i / H, lx, 0.5 - j / H, rgb);
      });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.userData.compartida = true;
    return geo;
  }

  // instancia por actor/objeto: grupo con frente+dorso+laterales. El llamador
  // (render3d.js) resuelve texturas/geometría cacheadas y las inyecta vía
  // setVisual; el resto de setters replican 1:1 lo que antes se mutaba
  // directamente sobre THREE.Sprite/SpriteMaterial.
  function createActor(depth) {
    const group = new THREE.Group();
    const frontMat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: ALPHA_TEST_DEFAULT, depthWrite: true, side: THREE.FrontSide });
    const backMat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: ALPHA_TEST_DEFAULT, depthWrite: true, side: THREE.FrontSide });
    const sideMat = new THREE.MeshBasicMaterial({ transparent: true, vertexColors: true, depthWrite: true, side: THREE.DoubleSide });

    const front = new THREE.Mesh(sharedPlane, frontMat);
    front.position.z = depth / 2;
    const back = new THREE.Mesh(sharedPlane, backMat);
    back.position.z = -depth / 2;
    back.rotation.y = Math.PI;
    const side = new THREE.Mesh(new THREE.BufferGeometry(), sideMat);
    side.geometry.userData.compartida = true; // vacía hasta el primer setVisual; no pasa por el caché

    group.add(front, back, side);

    return {
      group,
      get position() { return group.position; },
      get scale() { return group.scale; },
      get visible() { return group.visible; },
      set visible(v) { group.visible = v; },
      setVisual(frontTex, backTex, sideGeometry) {
        frontMat.map = frontTex; frontMat.needsUpdate = true;
        backMat.map = backTex; backMat.needsUpdate = true;
        side.geometry = sideGeometry;
      },
      setTint(hex) {
        frontMat.color.setHex(hex);
        backMat.color.setHex(hex);
        sideMat.color.setHex(hex);
      },
      setOpacity(a) {
        frontMat.opacity = a;
        backMat.opacity = a;
        sideMat.opacity = a;
      },
      setFog(v) {
        frontMat.fog = v;
        backMat.fog = v;
        sideMat.fog = v;
      },
      // el fundido de muerte anima opacity 1→0: con alphaTest fijo se vería a
      // brillo completo hasta cruzar el umbral y desaparecer de golpe en vez
      // de desvanecerse. Se llama una vez al iniciar la disolución (esa
      // instancia no vuelve a usarse, no hace falta restaurar el recorte).
      setDeathFade() {
        for (const m of [frontMat, backMat, sideMat]) { m.alphaTest = 0; m.depthWrite = false; }
      },
      // billboard SOLO en eje Y: la profundidad se hace visible al orbitar la
      // cámara (como los objetos tirados en Minecraft) en vez de encarar
      // siempre plano. actorGroup no tiene rotación propia, así que world
      // space basta sin corrección de transform padre.
      faceCamera(camera) {
        group.rotation.y = Math.atan2(camera.position.x - group.position.x, camera.position.z - group.position.z);
      },
      dispose() {
        frontMat.dispose();
        backMat.dispose();
        sideMat.dispose();
      },
    };
  }

  window.SpriteExtrude = { sharedPlane, mirrorCanvas, buildSideGeometry, createActor };
})();
