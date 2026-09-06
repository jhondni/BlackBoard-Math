/* ============================================
   LOUSA VIRTUAL - ShapeObject
   ============================================
   Representa uma forma geometrica vetorial na
   lousa. Renderizada via SVG (SVGRenderer).
   ============================================ */

import { BoardObject } from './BoardObject.js';
import { SVGRenderer } from '../renderers/SVGRenderer.js';

export class ShapeObject extends BoardObject {
  /**
   * @param {object} [init]
   * @param {string} [init.shapeType] - rect | ellipse | circle | triangle | line
   * @param {string} [init.fill]
   * @param {string} [init.stroke]
   */
  constructor(init = {}) {
    super(init);
    this.type = 'shape';
    this.shapeType = init.shapeType || 'rect';
    this.fill = init.fill || 'transparent';
    this.stroke = init.stroke || this.color;
    this.svgRenderer = new SVGRenderer();
  }

  toDOMContent(el) {
    el.innerHTML = '';
    const svg = this.svgRenderer.renderShape({
      shapeType: this.shapeType,
      width: this.width,
      height: this.height,
      fill: this.fill,
      stroke: this.stroke
    }, this.width, this.height);
    el.appendChild(svg);
  }

  render() {
    if (this.dom) this.toDOMContent(this.dom);
    return this;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      shapeType: this.shapeType,
      fill: this.fill,
      stroke: this.stroke
    };
  }

  static fromJSON(data) {
    return new ShapeObject({
      id: data.id,
      x: data.x,
      y: data.y,
      width: data.width,
      height: data.height,
      rotation: data.rotation,
      blurred: data.blurred,
      shapeType: data.shapeType,
      fill: data.fill,
      stroke: data.stroke,
      color: data.color
    });
  }
}
