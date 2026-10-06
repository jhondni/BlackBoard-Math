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

   Os cantos sao independentes, como no Figma: cada
   um tem raio proprio e o que nao e arredondado
   fica em 90 graus. `radii` e a verdade, com quatro
   valores; `radius` deixou de ser campo e virou
   apenas a forma compacta de escrever "os quatro
   iguais", que e o que ainda vai no arquivo.
   ============================================ */

export class UIShape extends UINode {
  constructor(props = {}) {
    const {
      shapeType = 'rect',
      fill = '#6C5CE7',
      stroke = 'none',
      strokeWidth = 1
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

    // `radii` e a verdade; `radius` e o atalho de "os quatro iguais"
    // que os arquivos antigos gravavam. Se nenhum dos dois vier,
    // os cantos saem retos.
    this.radii = [0, 0, 0, 0];
    this.setRadii(props.radii !== undefined ? props.radii : props.radius);
  }

  static get TYPES() {
    return ['rect', 'ellipse', 'line'];
  }

  /** Os quatro cantos, na ordem em que se leem: tl, tr, br, bl. */
  static get CORNERS() {
    return ['radiusTl', 'radiusTr', 'radiusBr', 'radiusBl'];
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

  /* ---- Cantos ----
     Invariante: `radii` nunca passa de `maxRadius`, e nunca e
     negativo. Toda escrita passa por `setRadius`/`setRadii` -- e o
     painel so escreve por ali, e nao por atribuicao direta. */

  /**
   * Teto do arredondamento: metade do lado menor. E o limite do SVG
   * -- e o maior valor que o desenho honra sem corrigir por conta
   * propria.
   *
   * Chegar ate ai e o que produz a forma redonda: com o quadrado no
   * raio maximo sai um circulo, e com o retangulo mais largo que
   * alto, na metade da altura, sai uma pilula. Os quatro cantos
   * aceitam esse valor, e nao so quando sao iguais entre si.
   *
   * O teto mora aqui, e nao no desenho nem no campo do painel, porque
   * o SVG corta `rx` na metade do lado sozinho -- se o modelo
   * aceitasse o numero cru, o painel mostraria um raio que a figura
   * nao tem e o arquivo exportado levaria o mesmo numero errado.
   */
  get maxRadius() {
    return Math.min(this.width, this.height) / 2;
  }

  get radiusTl() { return this.radii[0]; }
  get radiusTr() { return this.radii[1]; }
  get radiusBr() { return this.radii[2]; }
  get radiusBl() { return this.radii[3]; }

  /** Verdadeiro quando os quatro cantos tem o mesmo raio. */
  get uniformRadii() {
    return this.radii.every((value) => value === this.radii[0]);
  }

  /**
   * Grava um canto pelo nome da prop (`radiusTl`...) e devolve o
   * valor efetivo, ja cortado pelo teto.
   */
  setRadius(prop, value) {
    const index = UIShape.CORNERS.indexOf(prop);
    if (index < 0) return 0;
    this.radii[index] = Math.min(Math.max(0, UINode.toNumber(value, 0)), this.maxRadius);
    return this.radii[index];
  }

  /**
   * Grava os quatro de uma vez. Aceita a lista na ordem de `CORNERS`
   * ou um numero unico, que e a forma de dizer "todos iguais".
   */
  setRadii(list) {
    UIShape.CORNERS.forEach((prop, index) => {
      this.setRadius(prop, Array.isArray(list) ? list[index] : list);
    });
    return this.radii;
  }

  /* O raio e proporcional a figura, entao encolher a figura tambem
     encolhe o raio. Os dois caminhos de tamanho da base sao
     reaproveitados: `setSize` vem do painel, `setBounds` do gesto de
     redimensionar no canvas. */

  setSize(width, height) {
    const changed = super.setSize(width, height);
    this.setRadii(this.radii.slice());
    return changed;
  }

  setBounds(bounds) {
    const changed = super.setBounds(bounds);
    this.setRadii(this.radii.slice());
    return changed;
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
    this.setRadii(this.radii.slice());
  }

  toJSON() {
    const out = {
      ...super.toJSON(),
      shapeType: this.shapeType,
      fill: this.fill,
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      radii: this.radii.slice()
    };

    // `radius` continua sendo gravado quando os quatro coincidem: e o
    // atalho que os arquivos antigos trazem, e o que faz o arquivo
    // continuar abrindo em qualquer ferramenta.
    if (this.uniformRadii) out.radius = this.radii[0];
    return out;
  }
}
