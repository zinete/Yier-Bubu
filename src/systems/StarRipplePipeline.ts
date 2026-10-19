import Phaser from 'phaser';

/** One short-lived, bounded camera pass; never used for hit detection. */
export class StarRipplePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  progress = 0;
  centerX = 0.5;
  centerY = 0.5;
  constructor(game: Phaser.Game) {
    super({ game, renderTarget: true, fragShader: `
      precision mediump float;
      uniform sampler2D uMainSampler;
      uniform vec2 uResolution;
      uniform vec2 uCenter;
      uniform float uProgress;
      varying vec2 outTexCoord;
      void main() {
        float aspect = uResolution.x / max(uResolution.y, 1.0);
        vec2 d = (outTexCoord - uCenter) * vec2(aspect, 1.0);
        float distance = length(d);
        float ring = distance - (0.015 + uProgress * 0.24);
        float envelope = exp(-abs(ring) * 100.0) * (1.0 - uProgress);
        vec2 direction = d / max(distance, 0.001) / vec2(aspect, 1.0);
        vec2 uv = clamp(outTexCoord + direction * sin(ring * 100.0) * envelope * 0.006, 0.0, 1.0);
        gl_FragColor = texture2D(uMainSampler, uv);
      }
    ` });
  }
  onPreRender(): void {
    this.set2f('uResolution', this.renderer.width, this.renderer.height);
    this.set2f('uCenter', this.centerX, this.centerY);
    this.set1f('uProgress', this.progress);
  }
}
