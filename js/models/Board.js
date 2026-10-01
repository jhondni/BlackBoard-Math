/* ============================================
   LOUSA VIRTUAL - Board (Model)
   ============================================
   Modelo central: mantem a lista de objetos, o
   objeto selecionado, zoom, offsets de pan e as
   estruturas de paginas/biblioteca/historico.
   ============================================ */

import { MathObject } from './MathObject.js';
import { TextObject } from './TextObject.js';
import { ImageObject } from './ImageObject.js';
import { ShapeObject } from './ShapeObject.js';

export class Board {
  constructor(init = {}) {
    this._objects = [];
    this._selectedObject = null;
    this.zoom = init.zoom ?? 0.8;
    this.offsetX = init.offsetX || 0;
    this.offsetY = init.offsetY || 0;

    // Paginas
    this.pages = init.pages || [];
    this.currentPageIndex = init.currentPageIndex || 0;

    // Biblioteca de equacoes salvas
    this.library = init.library || [];

    // Historico (undo/redo)
    this.history = [];
    this.historyIndex = -1;

    // Tema / orientacao / config de desenho
    this.isDarkMode = init.isDarkMode || false;
    this.isLandscape = init.isLandscape || false;
    this.penColor = init.penColor || '#000000';
    this.penSize = init.penSize || 3;

    this.elementIdCounter = 0;
    this.onChange = null; // callback notificando mudancas
  }

  /* ---- Logica de listeners ---- */
  _notify() {
    if (typeof this.onChange === 'function') this.onChange(this);
  }

  /* ---- Objetos ---- */
  get objects() {
    return this._objects;
  }

  get selectedObject() {
    return this._selectedObject;
  }

  addObject(obj) {
    this._objects.push(obj);
    this._notify();
    return obj;
  }

  removeObject(obj) {
    const idx = this._objects.indexOf(obj);
    if (idx !== -1) {
      obj.deselect();
      this._objects.splice(idx, 1);
      if (this._selectedObject === obj) this._selectedObject = null;
      this._notify();
      return true;
    }
    return false;
  }

  getObject(id) {
    return this._objects.find(o => o.id === id) || null;
  }

  selectObject(obj) {
    this.deselectObject();
    if (obj) {
      obj.select();
      this._selectedObject = obj;
    }
    this._notify();
    return obj;
  }

  deselectObject() {
    if (this._selectedObject) {
      this._selectedObject = this._selectedObject.deselect();
      this._selectedObject = null;
    }
    this._notify();
  }

  clear() {
    this._objects.forEach(o => o.deselect());
    this._objects = [];
    this._selectedObject = null;
    this._notify();
  }

  /* ---- Filtro por tipo ---- */
  getObjectsByType(type) {
    return this._objects.filter(o => o.type === type);
  }

  /* ---- Criacao de objetos (factory) ---- */
  createMath(latex, x, y) {
    const obj = new MathObject({ latex, x, y, color: this.penColor, fontSize: this.penSize * 6 || 20 });
    return this.addObject(obj);
  }

  createText(x, y, width, height) {
    const obj = new TextObject({ x, y, color: this.penColor, fontSize: 18, text: '', width, height });
    return this.addObject(obj);
  }

  /**
   * Cria um objeto de imagem.
   * @param {string} src
   * @param {number} x
   * @param {number} y
   * @param {boolean} [isGraph]
   * @param {object} [opts] - width, height, naturalWidth, naturalHeight,
   *   graphSpec e renderedScale (ver ImageObject).
   */
  createImage(src, x, y, isGraph = false, opts = {}) {
    const obj = new ImageObject({ src, x, y, isGraph, ...opts });
    return this.addObject(obj);
  }

  createShape(shapeType, x, y, opts = {}) {
    const obj = new ShapeObject({
      shapeType,
      x,
      y,
      fill: opts.fill,
      stroke: opts.stroke || this.penColor,
      color: this.penColor
    });
    return this.addObject(obj);
  }

  /* ---- Preguntas de estado ---- */
  get currentPage() {
    return this.pages[this.currentPageIndex] || null;
  }

  uniqueId() {
    return ++this.elementIdCounter;
  }

  /* ---- Historico ---- */
  pushHistory() {
    const snapshot = {
      objects: this._objects.map(o => o.toJSON()),
      currentPageIndex: this.currentPageIndex
    };
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snapshot);
    this.historyIndex = this.history.length - 1;
    if (this.history.length > 50) {
      this.history.shift();
      this.historyIndex--;
    }
    this._notify();
  }
}
