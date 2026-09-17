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
  constructor(board, elements) {
    this.board = board;
    this.$ = elements; // { whiteboard, canvas, elementsLayer }

    // Dependencias injetadas (renderizacao e manipulacao)
    this.mathRenderer = null;
    this.selectionView = null;

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
      const img = document.createElement('img');
      img.src = obj.src;
      if (obj.isGraph) img.style.maxWidth = '500px';
      el.appendChild(img);
    } else {
      el.className = 'board-element';
    }

    // Posiciona e dimensiona
    el.style.left = obj.x + 'px';
    el.style.top = obj.y + 'px';
    el.style.width = obj.width + 'px';
    el.style.height = obj.height + 'px';
    if (obj.rotation) el.style.transform = `rotate(${obj.rotation}deg)`;

    // Texto: altura predefinida (50px minimo) com crescimento a partir do topo.
    if (obj instanceof TextObject) {
      el.style.height = Math.max(50, obj.height) + 'px';
      el.style.minHeight = Math.max(50, obj.height) + 'px';
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
    if (this.$.zoomLevel) this.$.zoomLevel.textContent = Math.round(zoom * 100) + '%';
  }

  /**
   * Alterna a orientacao (retrato/paisagem).
   * @param {boolean} landscape
   */
  setOrientation(landscape) {
    this.$.whiteboard.classList.toggle('landscape', landscape);
  }

  /**
   * Limpa o canvas de desenho.
   */
  clearCanvas() {
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Desenha uma imagem de dados no canvas de desenho.
   * @param {string} dataURL
   */
  drawBackground(dataURL) {
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!dataURL) return;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
    img.src = dataURL;
  }
}
