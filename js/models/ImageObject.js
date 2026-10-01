/* ============================================
   LOUSA VIRTUAL - ImageObject
   ============================================
   Representa uma imagem (ou grafico rasterizado)
   inserida na lousa.

   Dois src coexistem:
   - `originalSrc`: a resolucao mais alta disponivel, nunca
     destruida (upload original ou primeira pintura do grafico).
   - `src`: cache do bitmap atual, sempre gerado a partir do
     original na densidade de pixels que o zoom atual exige.

   O zoom da lousa e um `transform: scale()` e, portanto, nao
   altera pixels. Sem regenerar o cache, o navegador so
   interpola o bitmap existente e a imagem fica borrada. Por
   isso `rerender()` AMPLIA o cache ate a resolucao nativa,
   nunca reduce.
   ============================================ */

import { BoardObject } from './BoardObject.js';

export class ImageObject extends BoardObject {
  /** Teto de lado (px de tela) para a caixa do objeto na lousa. */
  static DEFAULT_MAX_BOX_SIZE = 1600;
  /** Area maxima (px^2) de um bitmap em cache, para nao estourar memoria. */
  static DEFAULT_MAX_RENDER_AREA = 4096 * 4096;

  /**
   * @param {object} [init]
   * @param {string} [init.src] - URL ou data URL da imagem
   * @param {boolean} [init.isGraph] - Se e um grafico gerado
   * @param {number} [init.naturalWidth] - Largura do bitmap original
   * @param {number} [init.naturalHeight] - Altura do bitmap original
   */
  constructor(init = {}) {
    super(init);
    this.type = init.isGraph ? 'graph' : 'image';
    this.src = init.src || init.content || '';
    super.content = this.src;
    this.isGraph = Boolean(init.isGraph);

    // O original nunca e sobrescrito pelo cache de `src`.
    this.originalSrc = init.originalSrc || this.src;

    this.graphSpec = init.graphSpec || null;
    this.maxRenderArea = init.maxRenderArea || ImageObject.DEFAULT_MAX_RENDER_AREA;
    this.maxBoxSize = init.maxBoxSize || ImageObject.DEFAULT_MAX_BOX_SIZE;

    this.naturalWidth = init.naturalWidth || 0;
    this.naturalHeight = init.naturalHeight || 0;
    if (!this.naturalWidth || !this.naturalHeight) {
      const box = this._fitSize(init.width, init.height);
      this.naturalWidth = this.naturalWidth || box.width;
      this.naturalHeight = this.naturalHeight || box.height;
    }

    // `maxBoxSize` precisa estar definido antes: a caixa inicial ja
    // nasce limitada pelo teto.
    this.width = init.width || this._fitSize(this.naturalWidth, this.naturalHeight).width;
    this.height = init.height || this._fitSize(this.naturalWidth, this.naturalHeight).height;

    // Densidade (px do cache / px de tela) com que `src` foi gerado.
    this.renderedScale = Number(init.renderedScale) || 0;

    // <img> do original, carregado sob demanda para re-renderizar.
    this._sourceImage = null;
    this._sourcePromise = null;
  }

  /**
   * Reduz proporcionalmente um par de dimensoes ate caber no teto,
   * preservando a proporcao.
   * @param {number} naturalWidth
   * @param {number} naturalHeight
   * @param {number} [maxSize]
   * @returns {{width:number,height:number}}
   */
  static fitSize(naturalWidth, naturalHeight, maxSize = ImageObject.DEFAULT_MAX_BOX_SIZE) {
    const w = Math.max(1, naturalWidth || 200);
    const h = Math.max(1, naturalHeight || 150);
    const longest = Math.max(w, h);
    if (longest <= maxSize) return { width: Math.round(w), height: Math.round(h) };
    const k = maxSize / longest;
    return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
  }

  _fitSize(naturalWidth, naturalHeight) {
    return ImageObject.fitSize(naturalWidth, naturalHeight, this.maxBoxSize);
  }

  /**
   * Carrega uma imagem so para descobrir a resolucao nativa.
   * @param {string} src
   * @returns {Promise<HTMLImageElement>}
   */
  static loadNaturalSize(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Falha ao carregar a imagem'));
      img.src = src;
    });
  }

  /**
   * Troca o src preservando os controles de interacao do elemento.
   * O bitmap original permanece intacto em `originalSrc`.
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
    // 1 bitmap <-> 1 caixa: sem `max-width/max-height`, o
    // `object-fit` mapeia cada pixel do cache em area conhecida.
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.display = 'block';
    el.insertBefore(img, el.firstChild);
  }

  render() {
    if (this.dom) this.toDOMContent(this.dom);
    return this;
  }

  /**
   * Redimensiona a caixa mantendo a densidade do cache coerente.
   *
   * `renderedScale` mede pixels de bitmap por pixel de tela, entao ela
   * depende do tamanho da caixa: se a caixa encolhe, a MESMA bitmap passa
   * a ter densidade MAIOR. Sem reajustar, `needsRerender` compararia a
   * densidade antiga com a exigida e decidiria errado se o cache ainda
   * serve. O cache em si nunca e regerado aqui: `rerender()` faz isso.
   * @param {number} w
   * @param {number} h
   */
  resize(w, h) {
    const oldW = this.width;
    const oldH = this.height;
    super.resize(w, h);
    if (this.renderedScale <= 0) return;
    // Maior razao entre os eixos: e o que mantem a bitmap cobrindo a
    // caixa nos dois sentidos quando o resize nao e proporcional.
    this.renderedScale = Math.max(
      (this.renderedScale * oldW) / Math.max(1, this.width),
      (this.renderedScale * oldH) / Math.max(1, this.height)
    );
  }

  /**
   * Densidade de pixels que o objeto exige no zoom atual.
   * @param {number} zoom
   * @returns {number}
   */
  requiredScale(zoom = 1) {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    return Math.max(0.25, zoom) * Math.min(dpr, 2);
  }

  /**
   * Indica se o cache atual e insuficiente para o zoom informado.
   * So cresce: ampliar o cache e sempre seguro, reduzir wastes trabalho.
   * @param {number} zoom
   * @returns {boolean}
   */
  needsRerender(zoom = 1) {
    if (this.isGraph) {
      // Graficos sao vetoriais ate virar raster: sempre pode melhorar.
      return this.renderedScale < this.requiredScale(zoom) - 0.01;
    }
    if (this.naturalWidth && this.renderedScale >= this.naturalWidth / Math.max(1, this.width)) {
      // Ja no maximo do original: ampliar mais so interpola.
      return false;
    }
    return this.renderedScale < this.requiredScale(zoom) - 0.01;
  }

  /**
   * Carrega (e memoiza) o <img> do bitmap original.
   * @returns {Promise<HTMLImageElement|null>}
   */
  _loadSource() {
    if (this._sourceImage) return Promise.resolve(this._sourceImage);
    if (!this.originalSrc) return Promise.resolve(null);
    if (this._sourcePromise) return this._sourcePromise;

    this._sourcePromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this._sourceImage = img;
        // O bitmap decodificado e a verdade sobre a resolucao
        // disponivel: um `naturalWidth` vindo do JSON pode estar
        // defasado, e `needsRerender`/`rerender` precisam concordar
        // sobre o teto nativo.
        if (img.naturalWidth) {
          this.naturalWidth = img.naturalWidth;
          this.naturalHeight = img.naturalHeight;
        }
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = this.originalSrc;
    });
    return this._sourcePromise;
  }

  /**
   * Regenera o bitmap do objeto na densidade de pixels exigida pelo
   * zoom, sempre a partir do original e sempre AMPLIANDO (nunca
   * reduzindo) o cache atual.
   *
   * @param {import('../controllers/ObjectController.js').ObjectController} objectController
   * @param {number} [zoom] - Zoom da lousa (1 = 100%).
   * @returns {Promise<boolean>} true se o src foi atualizado
   */
  async rerender(objectController, zoom = 1) {
    if (!objectController) return false;

    const scale = this.requiredScale(zoom);
    const boxW = Math.max(1, Math.round(this.width));
    const boxH = Math.max(1, Math.round(this.height));

    // Densidade REAL do cache atual: px de bitmap por unidade de tela.
    const cacheW = Math.round((this.renderedScale || 0) * boxW);
    const cacheH = Math.round((this.renderedScale || 0) * boxH);

    if (this.isGraph && this.graphSpec) {
      // Grafico: repinta do zero a partir da spec, entao a unica
      //ristricao e o teto de area. Nunca reduzir um cache ja gerado
      // (os pixels de maior resolucao ainda servem se a caixa encolher).
      let targetW = Math.max(Math.round(boxW * scale), cacheW);
      let targetH = Math.max(Math.round(boxH * scale), cacheH);
      if (targetW <= cacheW && targetH <= cacheH) return false;

      if (targetW * targetH > this.maxRenderArea) {
        const k = Math.sqrt(this.maxRenderArea / (targetW * targetH));
        targetW = Math.max(1, Math.round(targetW * k));
        targetH = Math.max(1, Math.round(targetH * k));
        if (targetW <= cacheW && targetH <= cacheH) return false;
      }

      const dataUrl = objectController.drawGraphOffscreen(this.graphSpec, {
        width: targetW,
        height: targetH
      });
      if (!dataUrl) return false;
      const changed = this.setSrc(dataUrl);
      this.renderedScale = targetW / boxW;
      return changed;
    }

    // Imagem upada: o original e o teto do que existe. Acima dele so
    // haveria interpolacao, mas ABAIXO dele ainda pode faltar detalhe --
    // um cache antigo (estado legado) numa caixa pequena tem o que
    // recuperar. Por isso o teto limita o alvo em vez de pular o
    // trabalho: `renderedScale` so e atualizado com o que foi gerado,
    // nunca "declarado" como nativo sem ter gerado nada.
    const src = await this._loadSource();
    if (!src || !src.naturalWidth) return false;

    const nativeScale = Math.min(src.naturalWidth / boxW, src.naturalHeight / boxH);
    const targetW = Math.min(
      Math.round(boxW * scale),
      Math.max(1, Math.round(boxW * nativeScale))
    );
    const targetH = Math.min(
      Math.round(boxH * scale),
      Math.max(1, Math.round(boxH * nativeScale))
    );

    if (targetW <= cacheW && targetH <= cacheH) return false;
    if (targetW * targetH > this.maxRenderArea) return false;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, targetW, targetH);
      const dataUrl = canvas.toDataURL('image/png');
      const changed = this.setSrc(dataUrl);
      this.renderedScale = targetW / boxW;
      return changed;
    } catch (_) {
      // Tintao cross-origin bloqueia toDataURL; mantem o src atual.
      return false;
    }
  }

  toJSON() {
    return {
      ...super.toJSON(),
      src: this.src,
      originalSrc: this.originalSrc,
      isGraph: this.isGraph,
      graphSpec: this.graphSpec,
      naturalWidth: this.naturalWidth,
      naturalHeight: this.naturalHeight,
      renderedScale: this.renderedScale
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
      originalSrc: data.originalSrc || data.content || data.src,
      isGraph: data.type === 'graph' || data.isGraph,
      graphSpec: data.graphSpec || null,
      naturalWidth: data.naturalWidth || 0,
      naturalHeight: data.naturalHeight || 0,
      renderedScale: data.renderedScale || 0
    });
  }
}