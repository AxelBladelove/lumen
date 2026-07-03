export class BloomPipeline {
  constructor(THREE, renderer, options = {}) {
    this.THREE = THREE;
    this.renderer = renderer;
    this.samples = options.samples ?? 4;
    this.blurPasses = options.blurPasses ?? 7;
    this.bloomScale = options.bloomScale ?? 2;
    this.targetType = options.targetType ?? THREE.HalfFloatType;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.scene.add(this.quad);

    this.copyMaterial = this.createMaterial(`
      uniform sampler2D uTexture;
      varying vec2 vUv;
      void main() { gl_FragColor = texture2D(uTexture, vUv); }
    `);

    this.brightMaterial = this.createMaterial(`
      uniform sampler2D uTexture;
      varying vec2 vUv;
      void main() {
        vec4 color = texture2D(uTexture, vUv);
        float brightness = max(max(color.r, color.g), color.b);
        float amount = smoothstep(0.46, 1.22, brightness);
        gl_FragColor = vec4(color.rgb * amount, color.a);
      }
    `);

    this.blurMaterial = this.createMaterial(
      `
      uniform sampler2D uTexture;
      uniform vec2 uDirection;
      varying vec2 vUv;
      void main() {
        vec4 sum = texture2D(uTexture, vUv) * 0.1633;
        sum += texture2D(uTexture, vUv + uDirection * 1.3846) * 0.2868;
        sum += texture2D(uTexture, vUv - uDirection * 1.3846) * 0.2868;
        sum += texture2D(uTexture, vUv + uDirection * 3.2307) * 0.1315;
        sum += texture2D(uTexture, vUv - uDirection * 3.2307) * 0.1315;
        gl_FragColor = sum;
      }
    `,
      { uDirection: { value: new THREE.Vector2(1, 0) } }
    );

    this.compositeMaterial = this.createMaterial(
      `
      uniform sampler2D uBase;
      uniform sampler2D uBloom;
      uniform float uStrength;
      varying vec2 vUv;
      void main() {
        vec4 base = texture2D(uBase, vUv);
        vec3 bloom = texture2D(uBloom, vUv).rgb;
        gl_FragColor = vec4(base.rgb + bloom * uStrength, base.a);
      }
    `,
      {
        uBase: { value: null },
        uBloom: { value: null },
        uStrength: { value: 1.4 }
      }
    );

    this.setSize(1, 1);
  }

  createMaterial(fragmentShader, uniforms = {}) {
    return new this.THREE.ShaderMaterial({
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uTexture: { value: null },
        ...uniforms
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        ${fragmentShader}
      `
    });
  }

  makeTarget(width, height) {
    return new this.THREE.WebGLRenderTarget(width, height, {
      depthBuffer: false,
      stencilBuffer: false,
      samples: this.samples,
      type: this.targetType
    });
  }

  setSize(width, height) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const bloomW = Math.max(1, Math.floor(w / this.bloomScale));
    const bloomH = Math.max(1, Math.floor(h / this.bloomScale));

    if (this.width === w && this.height === h) return;
    this.width = w;
    this.height = h;

    this.disposeTargets();
    this.sceneTarget = this.makeTarget(w, h);
    this.bloomA = this.makeTarget(bloomW, bloomH);
    this.bloomB = this.makeTarget(bloomW, bloomH);
  }

  disposeTargets() {
    this.sceneTarget?.dispose();
    this.bloomA?.dispose();
    this.bloomB?.dispose();
  }

  drawTo(target, material) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  render(scene, camera, bloomEnabled, bloomStrength, bloomRadius = 0.5) {
    const renderer = this.renderer;

    if (!bloomEnabled || bloomStrength <= 0.001) {
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(scene, camera);
      return;
    }

    renderer.setRenderTarget(this.sceneTarget);
    renderer.clear();
    renderer.render(scene, camera);

    this.brightMaterial.uniforms.uTexture.value = this.sceneTarget.texture;
    this.drawTo(this.bloomA, this.brightMaterial);

    const radiusScale = 1 + bloomRadius * 5.5;
    for (let i = 0; i < this.blurPasses; i += 1) {
      const radius = ((1.2 + i * 0.85) * radiusScale) / Math.max(1, this.bloomA.width);
      this.blurMaterial.uniforms.uTexture.value = this.bloomA.texture;
      this.blurMaterial.uniforms.uDirection.value.set(radius, 0);
      this.drawTo(this.bloomB, this.blurMaterial);

      this.blurMaterial.uniforms.uTexture.value = this.bloomB.texture;
      this.blurMaterial.uniforms.uDirection.value.set(0, radius * (this.bloomA.width / this.bloomA.height));
      this.drawTo(this.bloomA, this.blurMaterial);
    }

    this.compositeMaterial.uniforms.uBase.value = this.sceneTarget.texture;
    this.compositeMaterial.uniforms.uBloom.value = this.bloomA.texture;
    this.compositeMaterial.uniforms.uStrength.value = bloomStrength;
    this.drawTo(null, this.compositeMaterial);
  }

  dispose() {
    this.disposeTargets();
    this.quad.geometry.dispose();
    this.copyMaterial.dispose();
    this.brightMaterial.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
  }
}
