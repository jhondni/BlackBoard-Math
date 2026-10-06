import { UINode } from './UINode.js';

/* ============================================
   UI/UX DESIGNER - UIShape
   ============================================
   Forma geometrica: retangulo, elipse ou linha. As
   tres dividem a classe porque e o que o MVP
   precisa; os campos de tinta ficam iguais para as
   tres, e o que nao faz sentido para uma delas e
   simplesmente ignorado no desenho (o preenchimento
   de uma linha, por exemplo).

   Linha e o caso especial do piso: com `minHeight`
   e `minWidth` zerados ela pode ser horizontal,
   vertical ou diagonal de verdade, em vez de ter
   1px de espessura que so distorce o desenho.
   ============================================ */

export class UIShape extends UINode {
  constructor(props = {}) {
    const {
      shapeType = 'rect',
      fill = '#6C5CE7',
      stroke = 'none',
      strokeWidth = 1,
      radius = 0
    } = props;

    const type = UIShape.normalizeType(props.shapeType);
    super({
      type: 'shape',
      name: UIShape.labelFor(type),
      width: 120,
      height: 80,
      minWidth: type === 'line' ? 0 : 1,
      minHeight: type === 'line' ? 0 : 1,
      ...props
    });

    this.shapeType = type;
    this.fill = UINode.toText(fill, type === 'line' ? 'none' : '#6C5CE7');
    this.stroke = UINode.toText(stroke, 'none');
    this.strokeWidth = Math.max(0, UINode.toNumber(strokeWidth, 1));
    this.radius = Math.max(0, UINode.toNumber(radius, 0));
  }

  static get TYPES() {
    return ['rect', 'ellipse', 'line'];
  }

  static normalizeType(value) {
    return UIShape.TYPES.includes(value) ? value : 'rect';
  }

  static labelFor(shapeType) {
    if (shapeType === 'ellipse') return 'Elipse';
    if (shapeType === 'line') return 'Linha';
    return 'Retangulo';
  }

  static fromJSON(data) {
    return new UIShape(data);
  }

  get isLine() {
    return this.shapeType === 'line';
  }

  /** Trocar o tipo redesenha a mesma caixa com outra geometria. */
  setShapeType(shapeType) {
    const next = UIShape.normalizeType(shapeType);
    if (next === this.shapeType) return;
    this.shapeType = next;
    this.minWidth = next === 'line' ? 0 : 1;
    this.minHeight = next === 'line' ? 0 : 1;
    this.width = Math.max(this.minWidth, this.width);
    this.height = Math.max(this.minHeight, this.height);
    if (next === 'line' && this.fill !== 'none') this.fill = 'none';
  }

  toJSON() {
    return {
      ...super.toJSON(),
      shapeType: this.shapeType,
      fill: this.fill,
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      radius: this.radius
    };
  }
}