/* ============================================
   UI/UX DESIGNER - UINode
   ============================================
   Classe base de todo no do modo Design: guarda
   geometria, rotacao e flags, e nada mais. Nao
   conhece a lousa nem o DOM.

   A ideia e a mesma da `BoardObject`, mas o
   modulo nao herda dela: os dois documentos sao
   independentes e nenhum guarda referencia do
   outro (ver .memory/UI-UX-Designer-Module.md).

   Todo no nasce com `minWidth`/`minHeight` porque
   o piso muda por tipo -- um texto e uma linha nao
   tem o mesmo tamanho minimo que um frame.
   ============================================ */

const DEFAULT_MIN = 1;

let idSeq = 0;

export class UINode {
  constructor(props = {}) {
    const {
      id,
      type = 'node',
      name,
      x = 0,
      y = 0,
      width = 100,
      height = 40,
      rotation = 0,
      visible = true,
      locked = false,
      selected = false,
      parentId = null,
      minWidth = DEFAULT_MIN,
      minHeight = DEFAULT_MIN
    } = props;

    this.id = id || UINode.generateId();
    this.type = type;
    this.name = name || type;

    this.minWidth = Math.max(0, UINode.toNumber(minWidth, DEFAULT_MIN));
    this.minHeight = Math.max(0, UINode.toNumber(minHeight, DEFAULT_MIN));

    this.x = UINode.toNumber(x, 0);
    this.y = UINode.toNumber(y, 0);
    this.width = Math.max(this.minWidth, UINode.toNumber(width, 100));
    this.height = Math.max(this.minHeight, UINode.toNumber(height, 40));
    this.rotation = UINode.toAngle(rotation);

    this.visible = visible !== false;
    this.locked = locked === true;
    this.selected = selected === true;
    // Pasta do painel de camadas a que o no pertence, ou `null` na raiz.
    // Nao muda geometria, z nem desenho: e organizacao do painel, e o
    // grupo pode ser desfeito sem mexer em nada no canvas.
    this.parentId = typeof parentId === 'string' && parentId ? parentId : null;
  }

  /* ---- Utilitarios estaticos ---- */

  static generateId() {
    idSeq += 1;
    return 'n' + Date.now().toString(36) + idSeq.toString(36);
  }

  static toNumber(value, fallback) {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }

  static toText(value, fallback) {
    return typeof value === 'string' && value.length ? value : fallback;
  }

  /** Angulo normalizado em [0, 360). */
  static toAngle(value) {
    const deg = UINode.toNumber(value, 0) % 360;
    return deg < 0 ? deg + 360 : deg;
  }

  static fromJSON(data) {
    return new UINode(data);
  }

  /* ---- Geometria ---- */

  get centerX() { return this.x + this.width / 2; }
  get centerY() { return this.y + this.height / 2; }

  centerPoint() {
    return { x: this.centerX, y: this.centerY };
  }

  /**
   * Caixa alinhada aos eixos que envolve o no. Com rotacao, e o retangulo
   * dos quatro cantos girados -- e nao a caixa local, que ficaria torta.
   * E o que o union de conteudo e o snapping usam.
   */
  getBounds() {
    if (!this.rotation) {
      return { left: this.x, top: this.y, right: this.x + this.width, bottom: this.y + this.height };
    }
    const rad = this.rotation * Math.PI / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const extX = halfW * cos + halfH * sin;
    const extY = halfW * sin + halfH * cos;
    return {
      left: this.centerX - extX,
      top: this.centerY - extY,
      right: this.centerX + extX,
      bottom: this.centerY + extY
    };
  }

  /**
   * Teste de ponto em coordenadas de design, ja descontada a rotacao: o
   * clique precisa acertar o no girado, nao a caixa que o contem.
   * @returns {boolean}
   */
  hitTest(px, py) {
    const rad = this.rotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = px - this.centerX;
    const dy = py - this.centerY;
    const localX = dx * cos + dy * sin + this.width / 2;
    const localY = -dx * sin + dy * cos + this.height / 2;
    return localX >= 0 && localX <= this.width && localY >= 0 && localY <= this.height;
  }

  /* ---- Mutacoes ----
     Todo mutador respeita `locked`: um no travado nao se move, nao
     muda de tamanho e nao gira. E a regra que o painel de camadas
     espelha. */

  move(dx, dy) {
    if (this.locked) return false;
    this.x += UINode.toNumber(dx, 0);
    this.y += UINode.toNumber(dy, 0);
    return true;
  }

  setPosition(x, y) {
    if (this.locked) return false;
    this.x = UINode.toNumber(x, this.x);
    this.y = UINode.toNumber(y, this.y);
    return true;
  }

  setSize(width, height) {
    if (this.locked) return false;
    this.width = Math.max(this.minWidth, UINode.toNumber(width, this.width));
    this.height = Math.max(this.minHeight, UINode.toNumber(height, this.height));
    return true;
  }

  /** Aplica caixa e tamanho de uma vez, mantendo o piso de cada eixo. */
  setBounds({ x, y, width, height } = {}) {
    if (this.locked) return false;
    if (x !== undefined) this.x = UINode.toNumber(x, this.x);
    if (y !== undefined) this.y = UINode.toNumber(y, this.y);
    if (width !== undefined) this.width = Math.max(this.minWidth, UINode.toNumber(width, this.width));
    if (height !== undefined) this.height = Math.max(this.minHeight, UINode.toNumber(height, this.height));
    return true;
  }

  rotate(delta) {
    if (this.locked) return false;
    this.rotation = UINode.toAngle(this.rotation + UINode.toNumber(delta, 0));
    return true;
  }

  setRotation(deg) {
    if (this.locked) return false;
    this.rotation = UINode.toAngle(deg);
    return true;
  }

  select() {
    this.selected = true;
  }

  deselect() {
    this.selected = false;
  }

  /* ---- Serializacao ---- */

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      rotation: this.rotation,
      visible: this.visible,
      locked: this.locked,
      selected: this.selected,
      parentId: this.parentId
    };
  }
}