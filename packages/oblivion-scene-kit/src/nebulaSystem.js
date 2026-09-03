import * as THREE from 'three';

function createNebulaMaterial(seed, settings, seeded) {
  const primary = new THREE.Color(seed % 3 === 0 ? settings.nebulaColorC : settings.nebulaColorB);
  const colorA = new THREE.Color(settings.nebulaColorA).lerp(primary, 0.24 + seeded(seed, 22) * 0.18);
  const colorB = primary.clone().lerp(new THREE.Color(settings.backgroundColor), seeded(seed, 23) * 0.18);

  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: settings.nebulaIntensity },
      uBrushScale: { value: settings.brushScale },
      uColorA: { value: colorA },
      uColorB: { value: colorB },
      uSeed: { value: seed * 17.17 }
    },
    vertexShader: `
      varying vec2 vUv;
      varying float vWave;
      uniform float uTime;
      uniform float uSeed;
      void main() {
        vUv = uv;
        vec3 p = position;
        vWave = sin((p.x * 0.045 + p.y * 0.06) + uTime * 0.22 + uSeed);
        p.z += vWave * 5.5 + sin(p.x * 0.12 + uSeed) * 2.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying float vWave;
      uniform float uTime;
      uniform float uIntensity;
      uniform float uBrushScale;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uSeed;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(41.7, 289.3))) * 24857.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i + uSeed);
        float b = hash(i + vec2(1.0, 0.0) + uSeed);
        float c = hash(i + vec2(0.0, 1.0) + uSeed);
        float d = hash(i + vec2(1.0, 1.0) + uSeed);
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.52;
        mat2 rotate = mat2(0.78, -0.62, 0.62, 0.78);
        for (int i = 0; i < 5; i++) {
          value += noise(p) * amplitude;
          p = rotate * p * 2.08 + 3.4;
          amplitude *= 0.48;
        }
        return value;
      }

      void main() {
        vec2 uv = vUv - 0.5;
        float radial = smoothstep(0.72, 0.02, length(uv * vec2(0.82, 1.28)));
        vec2 flow = vec2(
          fbm(uv * 3.0 + uTime * 0.018),
          fbm(uv.yx * 3.5 - uTime * 0.015)
        );
        float cloud = fbm((uv + flow * 0.42) * (4.8 * uBrushScale));
        float strokes = sin((uv.x * 42.0 + cloud * 8.0 + uTime * 0.1) * uBrushScale);
        float edge = smoothstep(0.38, 0.92, cloud + strokes * 0.045 + vWave * 0.05);
        vec3 color = mix(uColorA, uColorB, cloud);
        float alpha = radial * edge * uIntensity * 0.18;
        gl_FragColor = vec4(color * (0.72 + edge * 1.4), alpha);
      }
    `
  });
}

function setNebulaColors(material, seed, settings, seeded) {
  const primary = new THREE.Color(seed % 3 === 0 ? settings.nebulaColorC : settings.nebulaColorB);
  material.uniforms.uColorA.value
    .set(settings.nebulaColorA)
    .lerp(primary, 0.24 + seeded(seed, 22) * 0.18);
  material.uniforms.uColorB.value
    .copy(primary)
    .lerp(new THREE.Color(settings.backgroundColor), seeded(seed, 23) * 0.18);
}

export function createNebulaSystem({ scene, settings, seeded, planeCount = 11 }) {
  const planes = [];
  const materials = [];

  for (let i = 0; i < planeCount; i += 1) {
    const material = createNebulaMaterial(i, settings, seeded);
    const geometry = new THREE.PlaneGeometry(80 + seeded(i, 1) * 80, 42 + seeded(i, 2) * 46, 90, 60);
    const plane = new THREE.Mesh(geometry, material);
    const ring = i / planeCount;
    plane.position.set(
      Math.cos(ring * Math.PI * 2) * (42 + seeded(i, 4) * 64),
      (seeded(i, 5) - 0.5) * 72,
      Math.sin(ring * Math.PI * 2) * (42 + seeded(i, 7) * 64)
    );
    plane.rotation.set(seeded(i, 10) * Math.PI, seeded(i, 11) * Math.PI, seeded(i, 12) * Math.PI);
    plane.userData.spin = new THREE.Vector3(
      (seeded(i, 13) - 0.5) * 0.018,
      (seeded(i, 14) - 0.5) * 0.018,
      (seeded(i, 15) - 0.5) * 0.018
    );
    scene.add(plane);
    planes.push(plane);
    materials.push(material);
  }

  return {
    planes,
    materials,
    refreshColors() {
      for (let i = 0; i < materials.length; i += 1) {
        setNebulaColors(materials[i], i, settings, seeded);
      }
    },
    update(elapsed, dt) {
      for (let i = 0; i < materials.length; i += 1) {
        materials[i].uniforms.uTime.value = elapsed * settings.nebulaMotion;
        materials[i].uniforms.uIntensity.value = settings.nebulaIntensity;
        materials[i].uniforms.uBrushScale.value = settings.brushScale;
        setNebulaColors(materials[i], i, settings, seeded);
      }

      for (const plane of planes) {
        plane.rotation.x += plane.userData.spin.x * dt * settings.nebulaMotion;
        plane.rotation.y += plane.userData.spin.y * dt * settings.nebulaMotion;
        plane.rotation.z += plane.userData.spin.z * dt * settings.nebulaMotion;
      }
    }
  };
}
