/* ============================================
   LOUSA VIRTUAL - BoardView
   ============================================
   View responsavel pela lousa: gerencia os
   elementos <div> da camada elements-layer, mantem
   a sincronizacao com os objetos do Board e aplica
   estado visual (selecao, blur, dimensionamento).
   ============================================ */

import { MathObject } from '../models/MathObject.js';
import { TextObject } from '../models/TextObject.js';
import { ImageObject } from '../models/ImageObject.js';

export class BoardView {
  /** 2cm em pixels de tela a 96dpi. */
  static MIN_MARGIN_PX = 75.6;
  /** Densidade maxima do canvas de desenho (px por px de lousa). */
  static MAX_DRAWING_SCALE = 5;
  /** Teto de pixels do backing store do canvas de desenho (~48MB RGBA). */
  static MAX_DRAWING_PIXELS = 12e6;
  /** Densidade com que o desenho e serializado no localStorage. */
  static SAVE_DRAWING_SCALE = 2;

  constructor(board, elements) {
    this.board = board;
    this.$ = elements; // { whiteboard, canvas, elementsLayer }

    // Dependencias injetadas (renderizacao e manipulacao)
    this.mathRenderer = null;
    this.selectionView = null;

    // Fator px do canvas / px da lousa (ver resizeDrawingCanvas).
    this.drawingScale = 1;

    this.subscribe();
  }

  /* ---- Quadro ---- */
  get canvas() { return this.$.canvas; }
  get elementsLayer() { return this.$.elementsLayer; }

  subscribe() {
    // O modelo notifica mudancas; a renderizacao integral fica
    // sob controle dos controllers (para nao perder foco/duplicar
    // elementos durante a adicao incremental de objetos).
    this.board.onChange = () => {};
  }

  /**
   * Cria o elemento DOM a partir de um objeto de modelo.
   * @param {import('../models/BoardObject.js').BoardObject} obj
   * @returns {HTMLElement}
   */
  buildElement(obj) {
    const el = document.createElement('div');
    el.dataset.id = obj.id;
    el.dataset.type = obj.type;

    if (obj instanceof MathObject) {
      el.className = 'board-element equation-element';
      el.dataset.content = obj.latex;
      this.mathRenderer.render(obj.latex, el, { displayMode: true, throwOnError: false });
    } else if (obj instanceof TextObject) {
      el.className = 'board-element text-element';
    } else if (obj instanceof ImageObject) {
      el.className = `board-element ${obj.isGraph ? 'graph-element' : 'image-element'}`;
      obj.toDOMContent(el);
    } else {
      el.className = 'board-element';
    }

    // Posiciona e dimensiona
    el.style.left = obj.x + 'px';
    el.style.top = obj.y + 'px';
    el.style.width = obj.width + 'px';
    el.style.height = obj.height + 'px';
    if (obj.rotation) el.style.transform = `rotate(${obj.rotation}deg)`;

    // Texto: altura predefinida (piso de 50px) com crescimento a partir do topo.
    if (obj instanceof TextObject) {
      el.style.height = Math.max(50, obj.height) + 'px';
      el.style.minHeight = '50px';
    }

    // Aplica controles e estado
    this.buildControls(el, obj);

    // Conteudo do texto: criado por ultimo para nao ser apagado pelos controles.
    if (obj instanceof TextObject) {
      const content = document.createElement('div');
      content.className = 'text-element-content';
      content.contentEditable = 'true';
      content.style.fontSize = obj.fontSize + 'px';
      content.style.color = obj.color;
      content.textContent = obj.text;
      el.appendChild(content);
      obj.contentEl = content;
    }

    if (obj.blurred) el.classList.add('blurred');
    if (obj.selected) el.classList.add('selected');

    obj.dom = el;
    return el;
  }

  /**
   * Insere os controles (acoes e handles de redimensionar)
   * e os eventos de manipulacao no elemento.
   * @param {HTMLElement} el
   * @param {object} obj
   */
  buildControls(el, obj) {
    el.innerHTML += `
      <div class="element-actions">
        <button class="edit-eq-btn" title="Editar">&#9998;</button>
        <button class="blur-btn" title="Borrar">&#128065;</button>
        <button class="delete-btn" title="Remover">&times;</button>
      </div>
      <div class="resize-handle se"></div>
      <div class="resize-handle sw"></div>
      <div class="resize-handle ne"></div>
      <div class="resize-handle nw"></div>
    `;

    // Delega manipulacao (drag/resize/selecao) para a SelectionView
    if (this.selectionView) {
      this.selectionView.attach(el, obj);
    }
  }

  /**
   * Adiciona um objeto como elemento DOM na lousa.
   * @param {object} obj
   * @returns {HTMLElement}
   */
  addObjectElement(obj) {
    const el = this.buildElement(obj);
    this.elementsLayer.appendChild(el);
    return el;
  }

  /**
   * Remove o elemento DOM de um objeto.
   * @param {object} obj
   */
  removeObjectElement(obj) {
    if (obj.dom && obj.dom.parentNode) obj.dom.parentNode.removeChild(obj.dom);
    obj.dom = null;
  }

  /**
   * Renderiza a lousa a partir dos objetos do Board.
   */
  render(board) {
    // Remove todos os elementos DOM atuais
    Array.from(this.elementsLayer.children).forEach(ch => ch.remove());

    // Reconstrói a partir dos objetos do modelo
    board.objects.forEach(obj => this.addObjectElement(obj));
  }

  /**
   * Remove todos os elementos DOM sem alterar o modelo.
   */
  clearLayer() {
    this.elementsLayer.innerHTML = '';
  }

  /**
   * Aplica/escala o zoom no elemento whiteboard.
   * @param {number} zoom
   */
  applyZoom(zoom) {
    const wb = this.$.whiteboard;
    wb.style.transform = `scale(${zoom})`;
    wb.style.transformOrigin = 'center center';
    this.applyWorkspaceMargin(zoom);
    if (this.$.zoomLevel) this.$.zoomLevel.textContent = Math.round(zoom * 100) + '%';
  }

  /**
   * Dimensiona o backing store de `#drawing-canvas` para que cada pixel
   * de tinta corresponda a um pixel de TELA, e nao a um pixel de
   * documento escalado.
   *
   * O canvas ocupa `offsetWidth` px de CSS dentro de um whiteboard com
   * `transform: scale(zoom)`, logo a area de tela e `offsetWidth * zoom`.
   * Multiplicar tambem pelo `devicePixelRatio` evita perda de detalhe em
   * telas retina.
   *
   * O buffer e sempre reservado na densidade MAXIMA, e nao na do zoom
   * atual. Se crescesse junto com o zoom, cada ampliacao apagaria a
   * tinta anterior (o canvas e limpo ao trocar `width`) e so sobraria
   * um raster ampliado, que e exatamente a perda que se quer evitar.
   * O preco e memoria fixa, limitada por `MAX_DRAWING_PIXELS`; acima do
   * limite de nitidez o navegador apenas interpola, como antes.
   *
   * O `offsetWidth` e usado de proposito: `getBoundingClientRect()`
   * ja devolveria o valor multiplicado pelo zoom e a pagina acabaria
   * quadrada no zoom.
   *
   * @returns {{scale:number, resized:boolean}} fator px do canvas por px
   *   da lousa, e se o backing store foi realmente redimensionado
   *   (redimensionar limpa o canvas).
   */
  resizeDrawingCanvas() {
    const canvas = this.canvas;
    const wb = this.$.whiteboard;
    if (!canvas || !wb) return { scale: 1, resized: false };

    const boardW = Math.max(1, Math.round(wb.offsetWidth));
    const boardH = Math.max(1, Math.round(wb.offsetHeight));

    const budget = Math.sqrt(BoardView.MAX_DRAWING_PIXELS / (boardW * boardH));
    const scale = Math.max(0.25, Math.min(BoardView.MAX_DRAWING_SCALE, budget));

    const targetW = Math.max(1, Math.round(boardW * scale));
    const targetH = Math.max(1, Math.round(boardH * scale));

    // Atribuir `width`/`height` limpa o canvas, entao so acontece na
    // inicializacao ou quando a pagina muda de tamanho.
    const resized = canvas.width !== targetW || canvas.height !== targetH;
    if (resized) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    this.drawingScale = targetW / boardW;
    return { scale: this.drawingScale, resized };
  }

  /** Tamanho do canvas de desenho em pixels de tela (alias do fator). */
  get drawingCanvasScale() {
    return this.drawingScale;
  }

  /**
   * Garante 2cm (75.6px a 96dpi) de margem real em volta da pagina.
   *
   * Dois ajustes sao necessarios porque `transform: scale()` e apenas
   * visual: ele nao altera o tamanho de layout do elemento.
   *
   * 1. O padding do workspace define a margem de 2cm em pixels de tela,
   *    ja que o workspace nao sofre o `scale()` da pagina.
   * 2. O container recebe a dimensao ja escalada, senao acima de 100% o
   *    workspace ainda reservaria apenas o tamanho base da pagina e a
   *    margem ficaria sem espaco de rolagem.
   *
   * @param {number} zoom
   */
  applyWorkspaceMargin(zoom) {
    const workspace = this.$.workspace;
    if (!workspace) return;
    // O padding fica no workspace, que NAO e escalado por `transform`,
    // entao a margem de 2cm vale em pixels de tela diretos e independe do
    // zoom. Dividir por `zoom` encolheria justamente nos zooms maiores.
    workspace.style.setProperty('--zoom-margin', `${BoardView.MIN_MARGIN_PX}px`);

    const wb = this.$.whiteboard;
    const container = this.$.canvasContainer || wb.parentElement;
    if (container) {
      // Transform nao altera o layout: sem isso o workspace continuaria
      // reservando o tamanho base da pagina e a margem sumiria acima de 100%.
      container.style.width = `${wb.offsetWidth * zoom}px`;
      container.style.height = `${wb.offsetHeight * zoom}px`;
    }
  }

  /**
   * Centraliza a pagina na area visivel do workspace.
   *
   * O `margin: auto` do container so centraliza quando a pagina cabe
   * inteira. Acima disso ele vira 0 e a pagina encosta no topo. Aqui a
   * rolagem e ajustada para que o centro da pagina coincida com o centro
   * da area util, distribuindo o excedente de forma igual.
   */
  centerOnPage() {
    const workspace = this.$.workspace;
    const wb = this.$.whiteboard;
    if (!workspace || !wb) return;

    const br = wb.getBoundingClientRect();
    const cs = getComputedStyle(workspace);
    const padL = parseFloat(cs.paddingLeft);
    const padR = parseFloat(cs.paddingRight);
    const padT = parseFloat(cs.paddingTop);
    const padB = parseFloat(cs.paddingBottom);

    const innerW = workspace.clientWidth - padL - padR;
    const innerH = workspace.clientHeight - padT - padB;
    if (innerW <= 0 || innerH <= 0) return;

    // Centro da pagina em coordenadas de conteudo (scroll + posicao atual).
    const cx = (br.left - workspace.getBoundingClientRect().left) + workspace.scrollLeft + br.width / 2;
    const cy = (br.top - workspace.getBoundingClientRect().top) + workspace.scrollTop + br.height / 2;

    workspace.scrollLeft = Math.max(0, cx - (padL + innerW / 2));
    workspace.scrollTop = Math.max(0, cy - (padT + innerH / 2));
  }

  /**
   * Alterna a orientacao (retrato/paisagem).
   * @param {boolean} landscape
   */
  setOrientation(landscape) {
    const wb = this.$.whiteboard;
    wb.classList.toggle('landscape', landscape);
    // A largura/altura tem transicao de 0.4s, entao o container so pode ser
    // redimensionado com a dimensao final, depois do termino da animacao.
    const sync = () => {
      this.applyWorkspaceMargin(this.board.zoom);
      this.centerOnPage();
    };
    wb.addEventListener('transitionend', sync, { once: true });
    setTimeout(sync, 450);
  }

  /**
   * Limpa o canvas de desenho.
   */
  clearCanvas() {
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Desenha uma imagem de dados no canvas de desenho, preenchendo
   * todo o backing store (qualquer que seja a sua densidade).
   * @param {string} dataURL
   */
  drawBackground(dataURL) {
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!dataURL) return;
    const img = new Image();
    img.onload = () => {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
    };
    img.src = dataURL;
  }

  /**
   * Serializa o desenho para persistencia numa densidade limitada.
   *
   * O buffer em alta resolucao daria um PNG de dezenas de MB dentro de
   * um localStorage de ~5 MB. Reduzir para `SAVE_DRAWING_SCALE` mantem a
   * pagina utilizavel apos recarregar sem estourar a cota; o que se
   * perde e detalhe de tinta, nao o conteudo.
   *
   * @returns {string} data URL
   */
  exportDrawing() {
    const canvas = this.canvas;
    const scale = Math.min(this.drawingScale || 1, BoardView.SAVE_DRAWING_SCALE);
    if (scale >= (this.drawingScale || 1) - 0.01) return canvas.toDataURL('image/png');
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(canvas.width / this.drawingScale * scale));
    out.height = Math.max(1, Math.round(canvas.height / this.drawingScale * scale));
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }
}
