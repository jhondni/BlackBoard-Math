/* ============================================
   LOUSA VIRTUAL - ImageObject
   ============================================
   Representa uma imagem (ou grafico rasterizado)
   inserida na lousa. O src pode ser uma URL ou
   um data URL (base64).
   ============================================ */

import { BoardObject } from './BoardObject.js';

export class ImageObject extends BoardObject {
  /**
   * @param {object} [init]
   * @param {string} [init.src] - URL ou data URL da imagem
   * @param {boolean} [init.isGraph] - Se e um grafico gerado
   */
  constructor(init = {}) {
    super(init);
    this.type = init.isGraph ? 'graph' : 'image';
    this.src = init.src || init.content || '';
    super.content = this.src;
    this.isGraph = Boolean(init.isGraph);
    this.width = init.width || 200;
    this.height = init.height || 150;
  }

  setSrc(src) {
    this.src = src;
    this.content = src;
    this.sync();
    if (this.dom) this.toDOMContent(this.dom);
  }

  toDOMContent(el) {
    el.innerHTML = '';
    const img = document.createElement('img');
    img.src = this.src;
    if (this.isGraph) img.style.maxWidth = '500px';
    el.appendChild(img);
  }

  render() {
    if (this.dom) this.toDOMContent(this.dom);
    return this;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      src: this.src,
      isGraph: this.isGraph
    };
  }

  static fromJSON(data) {
    return new ImageObject({
      id: data.id,
      x: data.x,
      y: data.y,
      width: data.width,
      height: data.height,
      rotation: data.rotation,
      blurred: data.blurred,
      src: data.content || data.src,
      isGraph: data.type === 'graph' || data.isGraph
    });
  }
}
