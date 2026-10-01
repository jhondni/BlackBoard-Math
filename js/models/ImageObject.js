/* ============================================
   LOUSA VIRTUAL - ImageObject
   ============================================
   Representa uma imagem (ou grafico rasterizado)
   inserida na lousa. O src pode ser uma URL ou
   um data URL (base64).
   ============================================ */

import { BoardObject } from './BoardObject.js';

export class ImageObject extends BoardObject {
  /** Area maxima (largura x altura) para re-renderizar sem estourar memoria. */
  static DEFAULT_MAX_RENDER_AREA = 4096 * 4096;

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
    this.graphSpec = init.graphSpec || null;
    this.maxRenderArea = init.maxRenderArea || ImageObject.DEFAULT_MAX_RENDER_AREA;
  }

  /**
   * Troca o src preservando os controles de interacao do elemento.
   * @param {string} src
   * @returns {boolean} true se o src foi alterado
   */
  setSrc(src) {
    if (!src || src === this.src) return false;
    this.src = src;
    this.content = src;
    if (this.dom) {
      this.sync();
      this.toDOMContent(this.dom);
    }
    return true;
  }

  toDOMContent(el) {
    // Remove apenas a <img> anterior, preservando os controles de
    // redimensionamento e acoes que o BoardView anexa ao elemento.
    Array.from(el.querySelectorAll('img')).forEach(old => old.remove());
    const img = document.createElement('img');
    img.src = this.src;
    this._styleImage(img);
    el.insertBefore(img, el.firstChild);
  }

  /** Ajusta o estilo da imagem conforme o tipo (grafico ou imagem). */
  _styleImage(img) {
    if (this.isGraph) {
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      img.style.display = 'block';
    }
  }

  render() {
    if (this.dom) this.toDOMContent(this.dom);
    return this;
  }

  /**
   * Re-renderiza o objeto em uma resolucao mais alta quando possivel.
   * Usado ao soltar o resize para evitar interpolacao da imagem.
   * @param {import('../controllers/ObjectController.js').ObjectController} objectController
   * @returns {boolean} true se o src foi atualizado
   */
  rerender(objectController) {
    if (!objectController) return false;

    // Gráfico com formula salva: redesenha na resolucao final.
    if (this.isGraph && this.graphSpec) {
      const w = Math.max(1, Math.round(this.width));
      const h = Math.max(1, Math.round(this.height));
      const area = w * h;
      if (area <= this.maxRenderArea) {
        const dataUrl = objectController.drawGraphPreview(this.graphSpec, { width: w, height: h });
        if (dataUrl) {
          this.setSrc(dataUrl);
          return true;
        }
      }
      return false;
    }

    // Imagem upada: o src original ja e a resolucao mais alta disponivel,
    // entao so ha o que ganhar ajustando o bitmap quando o alvo cabe dentro
    // da resolucao nativa. Nunca amplia alem do original, pois isso nao
    // cria detalhe nenhum e ainda infla o data URL.
    if (!this.isGraph && this.src) {
      const img = this.dom && this.dom.querySelector('img');
      if (!img || !img.complete || !img.naturalWidth) return false;

      const w = Math.max(1, Math.round(this.width));
      const h = Math.max(1, Math.round(this.height));
      const area = w * h;
      if (area > this.maxRenderArea) return false;

      // Acima da resolucao nativa o navegador ja faz o melhor possivel.
      if (w > img.naturalWidth || h > img.naturalHeight) return false;

      try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        return this.setSrc(canvas.toDataURL('image/png'));
      } catch (_) {
        // Tintao cross-origin bloqueia toDataURL; mantem o src atual.
        return false;
      }
    }

    return false;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      src: this.src,
      isGraph: this.isGraph,
      graphSpec: this.graphSpec
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
      isGraph: data.type === 'graph' || data.isGraph,
      graphSpec: data.graphSpec || null
    });
  }
}
