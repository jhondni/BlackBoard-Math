/* ============================================
   LOUSA VIRTUAL - SVGRenderer
   ============================================
   Representacao de formas e elementos vetoriais
   em SVG (utilizado por ShapeObject, exportacao e
   para suporte a graficos/vetores na lousa).
   ============================================ */

export class SVGRenderer {
  /**
   * Cria um elemento <svg> vazio com namespace correto.
   * @param {number} [width]
   * @param {number} [height]
   * @returns {SVGElement}
   */
  static svgContainer(width = 0, height = 0) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    return svg;
  }

  /**
   * Cria uma primitiva SVG (circle, rect, line, path...).
   * @param {string} tag - Nome do elemento (ex: 'circle')
   * @param {object} [attrs] - Atributos (ex: { cx: 50, cy: 50, r: 10 })
   * @returns {SVGElement}
   */
  static createShape(tag, attrs = {}) {
    const ns = 'http://www.w3.org/2000/svg';
    const el = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  /**
   * Desenha uma forma geometrica dentro de um container SVG.
   * @param {object} shape - { shapeType, x, y, width, height, fill, stroke }
   * @param {number} [containerWidth]
   * @param {number} [containerHeight]
   * @returns {SVGElement}
   */
  renderShape(shape, containerWidth = 200, containerHeight = 150) {
    const { shapeType = 'rect', width = containerWidth, height = containerHeight } = shape;
    const svg = SVGRenderer.svgContainer(containerWidth, containerHeight);
    const fill = shape.fill || 'transparent';
    const stroke = shape.stroke || '#1a1a1a';

    let node;
    switch (shapeType) {
      case 'circle':
        node = SVGRenderer.createShape('ellipse', {
          cx: containerWidth / 2,
          cy: containerHeight / 2,
          rx: width / 2,
          ry: height / 2,
          fill,
          stroke
        });
        break;
      case 'triangle':
        node = SVGRenderer.createShape('polygon', {
          points: `${containerWidth / 2},${0} ${0},${containerHeight} ${containerWidth},${containerHeight}`,
          fill,
          stroke
        });
        break;
      case 'line':
        node = SVGRenderer.createShape('line', {
          x1: 0, y1: containerHeight / 2,
          x2: containerWidth, y2: containerHeight / 2,
          stroke,
          'stroke-width': 2
        });
        break;
      case 'ellipse':
      case 'rect':
      default:
        node = SVGRenderer.createShape(shapeType === 'ellipse' ? 'ellipse' : 'rect', {
          x: shapeType === 'rect' ? 1 : 0,
          y: shapeType === 'rect' ? 1 : 0,
          width: shapeType === 'rect' ? width - 2 : width,
          height: shapeType === 'rect' ? height - 2 : height,
          rx: shapeType === 'rect' ? 6 : undefined,
          fill,
          stroke,
          'stroke-width': 2
        });
    }
    svg.appendChild(node);
    return svg;
  }

  /**
   * Serializa um elemento SVG para string (util para exportacao).
   * @param {SVGElement} svg
   * @returns {string}
   */
  static serialize(svg) {
    if (!svg) return '';
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return new XMLSerializer().serializeToString(clone);
  }
}
