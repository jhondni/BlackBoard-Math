import { UINode } from './UINode.js';

/* ============================================
   UI/UX DESIGNER - UIShape
   ============================================
   Forma geometrica: retangulo, elipse, linha ou
   poligono. As quatro dividem a classe porque e o
   que o MVP precisa; os campos de tinta ficam
   iguais para todas, e o que nao faz sentido para
   uma delas e simplesmente ignorado no desenho (o
   preenchimento de uma linha, por exemplo).

   O poligono guarda `points` RELATIVOS a caixa do
   no: a caixa nasce da bbox dos pontos no momento
   em que sao gravados (`setPoints` recebe absolutos
   e normaliza). Com pontos relativos, mover e
   rotacionar continuam de graca na base, e o
   redimensionar vira um re-mapeamento em escala de
   cada ponto.

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

    // Poligono nao tem canto arredondado: a geometria sao os pontos. Sem
    // 3+ pontos validos (arquivo antigo, forma convertida), o pentagono
    // padrao da caixa garante que a forma sempre tenha o que desenhar.
    if (this.shapeType === 'polygon') {
      this.points = [];
      if (!this.setPoints(props.points)) {
        this.points = UIShape.defaultPoints(this.width, this.height);
      }
    }
  }

  static get TYPES() {
    return ['rect', 'ellipse', 'line', 'polygon'];
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
    if (shapeType === 'polygon') return 'Poligono';
    return 'Retangulo';
  }

  static fromJSON(data) {
    if (data.shapeType === 'polygon' && Array.isArray(data.points)) {
      // No arquivo, `points` e relativo a caixa (o que o `toJSON` grava);
      // o constructor espera absolutos, para recalcular a bbox.
      const abs = data.points.map((p) => ({
        x: p.x + UINode.toNumber(data.x, 0),
        y: p.y + UINode.toNumber(data.y, 0)
      }));
      return new UIShape({ ...data, points: abs });
    }
    return new UIShape(data);
  }

  get isLine() {
    return this.shapeType === 'line';
  }

  get isPolygon() {
    return this.shapeType === 'polygon';
  }

  /* ---- Poligono ----
     A caixa e a bbox dos pontos; os pontos guardados sao relativos a
     caixa. `setPoints` e a unica porta de entrada de geometria nova --
     a ferramenta de desenho manda os cliques, e ela recalcula a bbox. */

  /**
   * Grava o poligono a partir de pontos em coordenadas de design
   * (absolutos). A caixa do no passa a ser a bbox desses pontos e
   * `points` guarda os mesmos pontos relativos a essa bbox.
   * Precisa de 3+ pontos; se nao tiver, nada muda.
   */
  setPoints(points) {
    if (!Array.isArray(points) || points.length < 3) return false;
    const pts = points.map((p) => ({
      x: UINode.toNumber(p && p.x, 0),
      y: UINode.toNumber(p && p.y, 0)
    }));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min.apply(null, xs);
    const minY = Math.min.apply(null, ys);
    const maxX = Math.max.apply(null, xs);
    const maxY = Math.max.apply(null, ys);

    this.x = minX;
    this.y = minY;
    this.width = Math.max(this.minWidth, maxX - minX);
    this.height = Math.max(this.minHeight, maxY - minY);
    // Guardado relativo e arredondado: o arquivo fica limpo e a rotacao
    // (que gira em torno do centro da caixa) segue valendo.
    this.points = pts.map((p) => ({
      x: Math.round((p.x - minX) * 100) / 100,
      y: Math.round((p.y - minY) * 100) / 100
    }));
    return true;
  }

  /** Os pontos voltando para coordenadas de design. */
  polygonPoints() {
    return (this.points || []).map((p) => ({ x: this.x + p.x, y: this.y + p.y }));
  }

  /** Pentagono padrao proporcional a caixa (para conversoes sem vertices). */
  static defaultPoints(width, height) {
    const w = Math.max(1, UINode.toNumber(width, 120));
    const h = Math.max(1, UINode.toNumber(height, 80));
    const r2 = (v) => Math.round(v * 100) / 100;
    return [
      { x: r2(w * 0.5), y: 0 },
      { x: w, y: r2(h * 0.36) },
      { x: r2(w * 0.8), y: h },
      { x: r2(w * 0.2), y: h },
      { x: 0, y: r2(h * 0.36) }
    ];
  }

  /**
   * Angulo no vertice `b` entre os lados `a-b` e `b-c`, em graus com uma
   * casa. Usa o menor angulo entre os dois segmentos (0-180): a leitura
   * intuitiva de "quanto abre o canto" enquanto a forma e construida.
   */
  static angleBetween(a, b, c) {
    if (!a || !b || !c) return 0;
    const v1x = a.x - b.x;
    const v1y = a.y - b.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (!l1 || !l2) return 0;
    const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)));
    return Math.round(Math.acos(cos) * 180 / Math.PI * 10) / 10;
  }

  /** Angulo interno no indice `i`, com indices circulares. */
  angleAt(index) {
    const pts = this.polygonPoints();
    const total = pts.length;
    if (total < 3) return 0;
    const i = ((index % total) + total) % total;
    return UIShape.angleBetween(pts[(i - 1 + total) % total], pts[i], pts[(i + 1) % total]);
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
    if (this.shapeType !== 'polygon') {
      const changed = super.setSize(width, height);
      this.setRadii(this.radii.slice());
      return changed;
    }
    // Poligono: redimensionar re-mapeia os pontos na nova caixa.
    const prev = { x: this.x, y: this.y, width: this.width, height: this.height };
    const changed = super.setSize(width, height);
    this._scalePoints(prev);
    return changed;
  }

  setBounds(bounds) {
    if (this.shapeType !== 'polygon') {
      const changed = super.setBounds(bounds);
      this.setRadii(this.radii.slice());
      return changed;
    }
    const prev = { x: this.x, y: this.y, width: this.width, height: this.height };
    const changed = super.setBounds(bounds);
    this._scalePoints(prev);
    return changed;
  }

  /** Re-mapeia os pontos relativos para a nova caixa, mantendo a origem
      (o canto superior esquerdo) fixa. */
  _scalePoints(prev) {
    if (!Array.isArray(this.points)) return;
    const kx = prev.width > 0 ? this.width / prev.width : 1;
    const ky = prev.height > 0 ? this.height / prev.height : 1;
    this.points = this.points.map((p) => ({
      x: Math.round(p.x * kx * 100) / 100,
      y: Math.round(p.y * ky * 100) / 100
    }));
  }

  /** Trocar o tipo redesenha a mesma caixa com outra geometria. */
  setShapeType(shapeType) {
    const next = UIShape.normalizeType(shapeType);
    if (next === this.shapeType) return;
    const wasPolygon = this.shapeType === 'polygon';
    this.shapeType = next;
    this.minWidth = next === 'line' ? 0 : 1;
    this.minHeight = next === 'line' ? 0 : 1;
    this.width = Math.max(this.minWidth, this.width);
    this.height = Math.max(this.minHeight, this.height);
    if (next === 'line' && this.fill !== 'none') this.fill = 'none';
    this.setRadii(this.radii.slice());
    if (next === 'polygon') {
      // Forma existente vira um pentagono na mesma caixa, para o painel
      // ter o que mostrar; os vertices se ajustam dali em diante.
      this.points = UIShape.defaultPoints(this.width, this.height);
    } else if (wasPolygon) {
      this.points = [];
    }
  }

  toJSON() {
    const out = {
      ...super.toJSON(),
      shapeType: this.shapeType,
      fill: this.fill,
      stroke: this.stroke,
      strokeWidth: this.strokeWidth
    };

    if (this.shapeType === 'polygon') {
      // `points` relativo a caixa: o `fromJSON` soma `x`/`y` na volta.
      out.points = (this.points || []).map((p) => ({ x: p.x, y: p.y }));
      return out;
    }

    out.radii = this.radii.slice();
    // `radius` continua sendo gravado quando os quatro coincidem: e o
    // atalho que os arquivos antigos trazem, e o que faz o arquivo
    // continuar abrindo em qualquer ferramenta.
    if (this.uniformRadii) out.radius = this.radii[0];
    return out;
  }
}
