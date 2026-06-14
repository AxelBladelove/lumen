export const MODE_IDS = {
  gray: 0,
  raw: 1,
  rawCaps: 2
};

const VALUE_KEYS = [
  "overallOpacity",
  "textureContrast",
  "textureBrightness",
  "textureSaturation",
  "flowSpeed",
  "flowStrength",
  "centerDepth",
  "innerDarkness",
  "innerGlowStrength",
  "innerGlowRadius",
  "edgeBrightness",
  "rimIntensity",
  "rimSharpness",
  "cyanRimAmount",
  "highlightIntensity",
  "highlightWidth",
  "highlightSoftness",
  "highlightFrequency",
  "highlightLength",
  "highlightCurveBias",
  "highlightEdgeBias",
  "highlightRandomness",
  "smokeStrength",
  "smokeScale",
  "smokeSoftness",
  "smokeContrast",
  "smokeFlow",
  "wispStrength",
  "wispLength",
  "wispFrequency",
  "wispOutwardAmount",
  "wispSoftness",
  "edgeNoiseStrength",
  "edgeNoiseScale",
  "edgeNoiseSoftness",
  "outerGlowStrength",
  "outerGlowRadius",
  "bloomStrength",
  "bloomThreshold",
  "capHighlight",
  "capGlow",
  "capSpecularIntensity",
  "capSpecularSize"
];

export function packValues(values) {
  return VALUE_KEYS.map((key) => values[key] ?? 0);
}

function themedUniforms(THREE) {
  return {
    uCoreColor: { value: new THREE.Color("#00c991") },
    uEdgeColor: { value: new THREE.Color("#21f6d2") },
    uGlowColor: { value: new THREE.Color("#00ffe0") },
    uAccentColor: { value: new THREE.Color("#eafffb") },
    uTextureTintStrength: { value: 0 }
  };
}

export function createSnakeMaterial(THREE, bodyTexture) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uBody: { value: bodyTexture },
      uMode: { value: 0 },
      uTime: { value: 0 },
      uRangeStart: { value: 0 },
      uRangeEnd: { value: 1 },
      uValues: { value: new Float32Array(43) },
      ...themedUniforms(THREE)
    },
    vertexShader: `
      attribute float sideCoord;
      varying vec2 vUv;
      varying float vSide;

      void main() {
        vUv = uv;
        vSide = sideCoord;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;

      uniform sampler2D uBody;
      uniform int uMode;
      uniform float uTime;
      uniform float uRangeStart;
      uniform float uRangeEnd;
      uniform float uValues[43];
      uniform vec3 uCoreColor;
      uniform vec3 uEdgeColor;
      uniform vec3 uGlowColor;
      uniform vec3 uAccentColor;
      uniform float uTextureTintStrength;
      varying vec2 vUv;
      varying float vSide;

      float V(int index) { return uValues[index]; }

      vec4 sampleRawTexturePlusCaps(vec2 uv) {
        return texture2D(uBody, clamp(uv, vec2(0.0), vec2(1.0)));
      }

      vec3 adjustTexture(vec3 color) {
        float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color = mix(vec3(luma), color, V(3));
        color = (color - 0.5) * V(1) + 0.5;
        return max(vec3(0.0), color * V(2));
      }

      vec4 composeFlowingRaw(vec2 uv, float side) {
        float absSide = abs(side);
        float interior = 1.0 - smoothstep(0.72, 0.98, absSide);
        float speed = V(4);
        float strength = V(5);
        float t = uTime * speed;
        vec4 raw = sampleRawTexturePlusCaps(uv);
        vec2 flowUv = uv;
        float waveA = sin(uv.x * 42.0 - t * 4.6 + uv.y * 11.0);
        float waveB = sin(uv.x * 19.0 + t * 2.8 - uv.y * 17.0);
        float waveC = sin(uv.x * 9.0 - t * 1.7 + uv.y * 23.0);
        flowUv.x += t * 0.18 + (waveA * 0.014 + waveB * 0.01 + waveC * 0.012) * strength * interior;
        flowUv.y += (sin(uv.x * 27.0 + t * 3.1) * 0.04 + waveB * 0.014) * strength * interior;
        flowUv.x = fract(flowUv.x);
        vec4 moving = sampleRawTexturePlusCaps(flowUv);
        vec3 color = adjustTexture(mix(raw.rgb, moving.rgb, strength * interior * 0.68));
        float tintStrength = clamp(uTextureTintStrength, 0.0, 1.0);
        float tintLuma = dot(color, vec3(0.2126, 0.7152, 0.0722));
        vec3 tintRamp = mix(uCoreColor, uEdgeColor, smoothstep(0.45, 0.98, absSide));
        vec3 tintedTexture = tintRamp * (0.38 + tintLuma * 1.22);
        color = mix(color, tintedTexture, tintStrength);

        float laneA = exp(-pow((side - (0.34 + 0.12 * sin(uv.x * 8.0 + t * 1.4))) / 0.22, 2.0));
        float laneB = exp(-pow((side + (0.38 + 0.1 * sin(uv.x * 7.0 - t * 1.2))) / 0.24, 2.0));
        float lanes = clamp(laneA + laneB, 0.0, 1.0) * interior;
        float current = sin(uv.x * 48.0 - t * 7.8 + uv.y * 13.0 + waveC * 1.8);
        float currentSoft = smoothstep(0.42, 0.96, current * 0.5 + 0.5);
        float crossBreak = 0.55 + 0.45 * sin(uv.y * 31.0 + uv.x * 17.0 - t * 2.4);
        float movingSheen = currentSoft * crossBreak * lanes * strength;

        float pulsePositionA = abs(fract(uv.x * 7.0 - t * 1.15) - 0.5);
        float pulsePositionB = abs(fract(uv.x * 5.0 - t * 0.82 + 0.33) - 0.5);
        float flowPulse = (
          smoothstep(0.18, 0.0, pulsePositionA) * laneA +
          smoothstep(0.22, 0.0, pulsePositionB) * laneB
        ) * interior * strength;

        color = mix(color, adjustTexture(moving.rgb), clamp(flowPulse * 0.5, 0.0, 0.75));
        color += uCoreColor * movingSheen * 0.26;
        color += uEdgeColor * (pow(movingSheen, 2.0) * 0.34 + flowPulse * 0.42);
        float softRim = smoothstep(0.56, 0.96, absSide);
        float hotRim = smoothstep(0.76, 0.98, absSide);
        color += uGlowColor * softRim * V(35) * 0.42;
        color += uAccentColor * hotRim * V(35) * 0.32;
        return vec4(color, raw.a * V(0));
      }

      void main() {
        float rangeFeather = 0.0015;
        float rangeMask =
          smoothstep(uRangeStart - rangeFeather, uRangeStart + rangeFeather, vUv.x) *
          (1.0 - smoothstep(uRangeEnd - rangeFeather, uRangeEnd + rangeFeather, vUv.x));
        if (rangeMask <= 0.001) discard;

        float side = abs(vSide);

        if (uMode == 0) {
          float edge = 1.0 - smoothstep(0.925, 1.0, side);
          float rim = pow(side, 5.0);
          vec3 gray = mix(vec3(0.48), vec3(0.66), rim * 0.35);
          gl_FragColor = vec4(gray, edge * rangeMask);
          return;
        }

        vec2 uv = clamp(vUv, vec2(0.0), vec2(1.0));
        vec4 rawTex = sampleRawTexturePlusCaps(uv);

        if (uMode == 1) {
          gl_FragColor = vec4(rawTex.rgb, rawTex.a * rangeMask);
          return;
        }

        vec4 composed = composeFlowingRaw(uv, vSide);
        gl_FragColor = vec4(composed.rgb, composed.a * rangeMask);
      }
    `
  });
}

export function createOuterGlowMaterial(THREE) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uMode: { value: 0 },
      uValues: { value: new Float32Array(43) },
      ...themedUniforms(THREE)
    },
    vertexShader: `
      attribute float sideCoord;
      varying float vSide;

      void main() {
        vSide = sideCoord;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;

      uniform int uMode;
      uniform float uValues[43];
      uniform vec3 uGlowColor;
      varying float vSide;

      float V(int index) { return uValues[index]; }

      void main() {
        if (uMode != 2) discard;
        float side = abs(vSide);
        float radius = clamp(V(36), 0.0, 1.0);
        float inner = 0.22 + radius * 0.12;
        float outer = 0.82 + radius * 0.16;
        float halo = smoothstep(inner, 0.62, side) * (1.0 - smoothstep(outer, 1.0, side));
        float alpha = halo * V(35) * (0.52 + radius * 0.72);
        gl_FragColor = vec4(uGlowColor * (0.85 + radius * 0.7), alpha);
      }
    `
  });
}

export function createContourGlowMaterial(THREE) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uMode: { value: 0 },
      uValues: { value: new Float32Array(43) },
      ...themedUniforms(THREE)
    },
    vertexShader: `
      attribute float sideCoord;
      varying float vSide;

      void main() {
        vSide = sideCoord;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;

      uniform int uMode;
      uniform float uValues[43];
      uniform vec3 uCoreColor;
      uniform vec3 uAccentColor;
      varying float vSide;

      float V(int index) { return uValues[index]; }

      void main() {
        if (uMode != 2) discard;
        float side = abs(vSide);
        float line = smoothstep(0.78, 0.91, side) * (1.0 - smoothstep(0.965, 1.0, side));
        float hotCore = smoothstep(0.88, 0.945, side) * (1.0 - smoothstep(0.972, 1.0, side));
        float alpha = (line * 0.46 + hotCore * 0.82) * V(35);
        vec3 color = mix(uCoreColor, uAccentColor, hotCore);
        gl_FragColor = vec4(color * 1.55, alpha);
      }
    `
  });
}

export function createCapMaterial(THREE, texture) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTexture: { value: texture },
      uMode: { value: 0 },
      uValues: { value: new Float32Array(43) },
      uCapSpecs: { value: new Float32Array(32) },
      ...themedUniforms(THREE)
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;

      uniform sampler2D uTexture;
      uniform int uMode;
      uniform float uValues[43];
      uniform float uCapSpecs[32];
      uniform vec3 uGlowColor;
      uniform vec3 uAccentColor;
      varying vec2 vUv;

      float V(int index) { return uValues[index]; }

      vec3 applyCapSpecular(vec2 uv) {
        vec3 spec = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          int base = i * 4;
          vec2 center = vec2(uCapSpecs[base + 0], uCapSpecs[base + 1]);
          float intensity = uCapSpecs[base + 2] * V(39);
          float size = max(0.01, uCapSpecs[base + 3]);
          float d = distance(uv, center);
          float spot = exp(-pow(d / size, 2.0)) * intensity;
          spec += uAccentColor * spot;
        }
        return spec;
      }

      void main() {
        vec4 tex = texture2D(uTexture, clamp(vUv, vec2(0.0), vec2(1.0)));
        if (uMode == 1) {
          gl_FragColor = tex;
          return;
        }
        if (uMode == 2) {
          float a = tex.a;
          float stepSize = 0.012;
          float nearAlpha = min(
            min(texture2D(uTexture, clamp(vUv + vec2(stepSize, 0.0), vec2(0.0), vec2(1.0))).a,
                texture2D(uTexture, clamp(vUv - vec2(stepSize, 0.0), vec2(0.0), vec2(1.0))).a),
            min(texture2D(uTexture, clamp(vUv + vec2(0.0, stepSize), vec2(0.0), vec2(1.0))).a,
                texture2D(uTexture, clamp(vUv - vec2(0.0, stepSize), vec2(0.0), vec2(1.0))).a)
          );
          float edge = smoothstep(0.08, 0.55, a) * (1.0 - smoothstep(0.46, 0.98, nearAlpha));
          vec3 capRim = uGlowColor * edge * V(35) * 0.5;
          gl_FragColor = vec4(tex.rgb + capRim, tex.a);
          return;
        }
        vec3 effects = applyCapSpecular(vUv);
        vec3 glow = uGlowColor * V(38) * tex.a * 0.25;
        vec3 highlight = uAccentColor * V(37) * smoothstep(0.65, 1.0, tex.r) * 0.18;
        gl_FragColor = vec4(tex.rgb + effects + glow + highlight, tex.a);
      }
    `
  });
}

export function createGrayCapMaterial(THREE) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    uniforms: {},
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;

      void main() {
        float dist = length(vUv - 0.5) * 2.0;
        float alpha = 1.0 - smoothstep(0.90, 1.0, dist);
        gl_FragColor = vec4(vec3(0.56), alpha);
      }
    `
  });
}
