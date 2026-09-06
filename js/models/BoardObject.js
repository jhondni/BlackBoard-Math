/* ============================================
   LOUSA VIRTUAL - BoardObject (abstract)
   ============================================
   Classe base para todos os elementos da lousa.
   Contem posicao, dimensoes, rotacao, estado de
   selecao e os metodos de manipulacao geometrica.
   ============================================ */

export class BoardObject {
  /**
   * @param {object} [init]
   * @param {string} [init.id]
   * @param {number} [init.x]
   * @param {number} [init.y]
   * @param {number} [init.width]
   * @param {number} [init.height]
   * @param {number} [init.rotation]
   */
  constructor(init = {}) {
    this.id = init.id !== undefined ? init.id : this._generateId();
    this._x = init.x || 0;
    this._y = init.y || 0;
    this._width = init.width || 50;
    this._height = init.height || 30;
    this._rotation = init.rotation || 0;
    this.selected = Boolean(init.selected);

    // Campos de apresentacao/comuns a todos os objetos
    this.type = 'object';
    this.blurred = Boolean(init.blurred);
    this.color = init.color || '#000000';
    this.fontSize = init.fontSize || 18;
    this.content = init.content || '';

    // Referencia opcional ao elemento DOM correspondente
    this.dom = null;
  }

  _generateId() {
    return 'obj_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  /* ---- Getters / Setters ---- */
  get x() { return this._x; }
  set x(v) { this._x = v; this.sync(); }

  get y() { return this._y; }
  set y(v) { this._y = v; this.sync(); }

  get width() { return this._width; }
  set width(v) { this._width = v; this.sync(); }

  get height() { return this._height; }
  set height(v) { this._height = v; this.sync(); }

  get rotation() { return this._rotation; }
  set rotation(v) { this._rotation = v; this.sync(); }

  /* ---- Manipulacao geometrica ---- */
  move(x, y) {
    this._x = x;
    this._y = y;
    this.sync();
  }

  resize(w, h) {
    this._width = Math.max(20, w);
    this._height = Math.max(20, h);
    this.sync();
  }

  rotate(angle) {
    this._rotation = (this._rotation + angle) % 360;
    this.sync();
  }

  /* ---- Selecao ---- */
  select() {
    this.selected = true;
    if (this.dom) this.dom.classList.add('selected');
  }

  deselect() {
    this.selected = false;
    if (this.dom) this.dom.classList.remove('selected');
  }

  /* ---- Blur ---- */
  applyBlur(on = true) {
    this.blurred = on;
    if (this.dom) this.dom.classList.toggle('blurred', on);
  }

  /* ---- Sincronizacao com o DOM (sobrescrita pelas views) ---- */
  sync() {
    if (!this.dom) return;
    this.dom.dataset.content = this.content;
    this.dom.dataset.fontSize = this.fontSize;
    this.dom.dataset.color = this.color;
    if (this._x !== undefined) this.dom.style.left = this._x + 'px';
    if (this._y !== undefined) this.dom.style.top = this._y + 'px';
    if (this._width !== undefined) this.dom.style.width = this._width + 'px';
    if (this._height !== undefined) this.dom.style.height = this._height + 'px';
    if (this._rotation) this.dom.style.transform = `rotate(${this._rotation}deg)`;
  }

  /**
   * Metodo que deve renderizar o conteudo do objeto no DOM.
   * Implementado pelas subclasses.
   * @returns {BoardObject} this
   */
  render() {
    throw new Error('BoardObject.render() deve ser implementado pela subclasse');
  }

  /**
   * Serializa o objeto para persistencia (JSON).
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      x: this._x,
      y: this._y,
      width: this._width,
      height: this._height,
      rotation: this._rotation,
      blurred: this.blurred,
      color: this.color,
      fontSize: this.fontSize,
      content: this.content
    };
  }
}
