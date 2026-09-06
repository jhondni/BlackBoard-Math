/* ============================================
   LOUSA VIRTUAL - MathObject
   ============================================
   Representa uma equacao/expressao matematica em
   LaTeX na lousa. Utiliza MathRenderer para
   renderizar via KaTeX ou MathJax.
   ============================================ */

import { BoardObject } from './BoardObject.js';
import { MathRenderer } from '../renderers/MathRenderer.js';

export class MathObject extends BoardObject {
  /**
   * @param {object} [init]
   * @param {string} [init.latex] - Expressao LaTeX
   * @param {number} [init.fontSize]
   */
  constructor(init = {}) {
    super(init);
    this.type = 'equation';
    this.latex = init.latex || init.content || '';
    super.content = this.latex;
    this.mathRenderer = new MathRenderer();
    this.width = init.width || 200;
    this.height = init.height || 80;
  }

  get latexContent() {
    return this.latex;
  }

  setLatex(latex) {
    this.latex = latex;
    this.content = latex;
    this.sync();
    this.reRender();
  }

  reRender() {
    if (!this.dom) return;
    this.mathRenderer.render(this.latex, this.dom, { displayMode: true, throwOnError: false });
  }

  render() {
    if (this.dom && this.dom.parentNode) {
      this.mathRenderer.render(this.latex, this.dom, { displayMode: true, throwOnError: false });
    }
    return this;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      latex: this.latex
    };
  }

  static fromJSON(data) {
    return new MathObject({
      id: data.id,
      x: data.x,
      y: data.y,
      width: data.width,
      height: data.height,
      rotation: data.rotation,
      blurred: data.blurred,
      fontSize: data.fontSize,
      color: data.color,
      latex: data.content || data.latex
    });
  }
}
