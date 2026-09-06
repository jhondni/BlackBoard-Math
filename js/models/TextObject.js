/* ============================================
   LOUSA VIRTUAL - TextObject
   ============================================
   Representa um texto livre na lousa, editavel
   via contenteditable. Utiliza TextRenderer.
   ============================================ */

import { BoardObject } from './BoardObject.js';
import { TextRenderer } from '../renderers/TextRenderer.js';

export class TextObject extends BoardObject {
  /**
   * @param {object} [init]
   * @param {string} [init.text]
   * @param {number} [init.fontSize]
   * @param {string} [init.color]
   */
  constructor(init = {}) {
    super(init);
    this.type = 'text';
    this.text = init.text || init.content || '';
    super.content = this.text;
    this.textRenderer = new TextRenderer();
    this.width = init.width || 120;
    this.height = init.height || 32;
  }

  setText(text) {
    this.text = text;
    this.content = text;
    this.sync();
    if (this.dom) this.toDOMContent(this.dom);
  }

  /** Conteudo textual do elemento DOM (widget). */
  toDOMContent(el) {
    this.textRenderer.applyText(el, this.text, {
      fontSize: this.fontSize,
      color: this.color,
      editable: true
    });
  }

  render() {
    if (this.dom) this.toDOMContent(this.dom);
    return this;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      text: this.text
    };
  }

  static fromJSON(data) {
    return new TextObject({
      id: data.id,
      x: data.x,
      y: data.y,
      width: data.width,
      height: data.height,
      rotation: data.rotation,
      blurred: data.blurred,
      fontSize: data.fontSize,
      color: data.color,
      text: data.content || data.text
    });
  }
}
