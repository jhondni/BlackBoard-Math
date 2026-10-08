import { UINode } from './UINode.js';
import { UIFrame } from './UIFrame.js';
import { UIImage } from './UIImage.js';
import { UIShape } from './UIShape.js';
import { UIText } from './UIText.js';

/* ============================================
   UI/UX DESIGNER - UIDesign
   ============================================
   Estado do documento de design: os nos, a
   selecao, o viewport (zoom/pan) e as guias.

   `nodes` e a fonte unica: a ordem do array e o z
   (o primeiro e o de tras) e os frames sao apenas
   nos com `type === 'frame'`. Antes esta classe
   mantinha `frames` como um segundo array, o que
   deixava o mesmo node em dois lugares e duplicava
   o frame no `toJSON`. Agora `frames` e `layers`
   sao leituras derivadas, que nao podem sair de
   sincronia com `nodes`.

   A selecao e unica no MVP: `selectedId` guarda o
   id e `selected` devolve o no (ou null). O painel de
   propriedades do MVP edita um elemento por vez.
   ============================================ */

/** Distancia maxima, em px de design, para um valor grudar na guia. */
export const SNAP_THRESHOLD = 6;

export class UIDesign {
  constructor(props = {}) {
    this.nodes = [];
    this.selectedId = null;

    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.minZoom = 0.1;
    this.maxZoom = 8;

    this.showGrid = props.showGrid === true;
    this.showGuides = props.showGuides === true;
    this.snap = props.snap !== false;
    this.gridSize = Math.max(2, UINode.toNumber(props.gridSize, 8));
    this.guides = [];
  }

  static get FILE_VERSION() {
    return 1;
  }

  /* ---- Leituras derivadas ---- */

  get selected() {
    return this.selectedId ? this.getNode(this.selectedId) : null;
  }

  get frames() {
    return this.nodes.filter((node) => node.type === 'frame');
  }

  /** Espelho para o painel de camadas, do topo da pilha para o fundo. */
  get layers() {
    return this.nodes
      .slice()
      .reverse()
      .map((node) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        shapeType: node.shapeType || null,
        visible: node.visible,
        locked: node.locked,
        selected: node.selected
      }));
  }

  getNode(id) {
    return this.nodes.find((node) => node.id === id) || null;
  }

  /** Caixa que envolve todo o conteudo visivel, ou null se nao ha nada. */
  contentBounds() {
    const visible = this.nodes.filter((node) => node.visible);
    if (!visible.length) return null;
    return visible.reduce((acc, node) => {
      const b = node.getBounds();
      return {
        left: Math.min(acc.left, b.left),
        top: Math.min(acc.top, b.top),
        right: Math.max(acc.right, b.right),
        bottom: Math.max(acc.bottom, b.bottom)
      };
    }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
  }

  /* ---- Criacao ---- */

  static buildNode(type, props = {}) {
    if (type === 'frame') return new UIFrame(props);
    if (type === 'image') return new UIImage(props);
    if (type === 'text') return new UIText(props);
    if (type === 'rect' || type === 'ellipse' || type === 'line' || type === 'polygon') {
      return new UIShape({ ...props, shapeType: type });
    }
    if (type === 'shape') return new UIShape(props);
    return new UINode({ ...props, type });
  }

  /** Prefixo do nome automatico, conforme a ferramenta. */
  static labelFor(type, props = {}) {
    if (type === 'frame') return 'Frame';
    if (type === 'image') return 'Imagem';
    if (type === 'text') return 'Texto';
    if (type === 'shape') return UIShape.labelFor(props.shapeType);
    return UIShape.labelFor(type);
  }

  /** Nome padrao, contando o que ja existe: "Frame 1", "Frame 2"... */
  _nextName(base) {
    const taken = new Set(this.nodes.map((node) => node.name));
    let i = 1;
    while (taken.has(base + ' ' + i)) i += 1;
    return base + ' ' + i;
  }

  createNode(type, props = {}) {
    const base = UIDesign.labelFor(type, props);
    const node = UIDesign.buildNode(type, { name: this._nextName(base), ...props });
    this.nodes.push(node);
    return node;
  }

  addNode(node) {
    this.nodes.push(node);
    return node;
  }

  removeNode(id) {
    const index = this.nodes.findIndex((node) => node.id === id);
    if (index < 0) return null;
    const [removed] = this.nodes.splice(index, 1);
    if (this.selectedId === removed.id) this.selectedId = null;
    return removed;
  }

  removeSelected() {
    const node = this.selected;
    return node ? this.removeNode(node.id) : null;
  }

  /* ---- Selecao ---- */

  selectNode(target) {
    const node = typeof target === 'string' ? this.getNode(target) : target || null;
    this.nodes.forEach((item) => {
      if (item !== node) item.deselect();
    });
    if (node) node.select();
    this.selectedId = node ? node.id : null;
    return node;
  }

  selectById(id) {
    return this.selectNode(this.getNode(id));
  }

  deselectAll() {
    return this.selectNode(null);
  }

  toggleNodeVisibility(id) {
    const node = this.getNode(id);
    if (!node) return false;
    node.visible = !node.visible;
    return node.visible;
  }

  toggleNodeLock(id) {
    const node = this.getNode(id);
    if (!node) return false;
    node.locked = !node.locked;
    if (node.locked && this.selectedId === node.id) this.deselectAll();
    return node.locked;
  }

  renameNode(id, name) {
    const node = this.getNode(id);
    const next = typeof name === 'string' ? name.trim() : '';
    if (!node || !next || next === node.name) return false;
    node.name = next;
    return true;
  }

  /**
   * Coloca o node na posicao `panelIndex` da lista de camadas,
   * que e o array ao contrario: 0 e o topo da lista, a frente da
   * pilha.
   *
   * A conversao para o indice do array acontece depois de tirar
   * o node de la. Fazer antes desloca em um todos os indices do
   * que sobrou, e o node cai na posicao vizinha da pedida.
   */
  moveNodeTo(id, panelIndex) {
    const from = this.nodes.findIndex((node) => node.id === id);
    if (from < 0) return false;

    const wanted = UINode.toNumber(panelIndex, 0);
    const [node] = this.nodes.splice(from, 1);
    const clamped = Math.max(0, Math.min(this.nodes.length, wanted));
    this.nodes.splice(this.nodes.length - clamped, 0, node);
    return true;
  }

  /* ---- Viewport ---- */

  setZoom(value) {
    const zoom = UINode.toNumber(value, this.zoom);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, zoom));
    return this.zoom;
  }

  setPan(x, y) {
    this.panX = UINode.toNumber(x, this.panX);
    this.panY = UINode.toNumber(y, this.panY);
  }

  panBy(dx, dy) {
    this.setPan(this.panX + UINode.toNumber(dx, 0), this.panY + UINode.toNumber(dy, 0));
  }

  resetView() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  /* ---- Grid ---- */

  setGridSize(size) {
    this.gridSize = Math.min(200, Math.max(2, UINode.toNumber(size, this.gridSize)));
    return this.gridSize;
  }

  /* ---- Guias ---- */

  addGuide(type, pos) {
    const axis = type === 'h' ? 'h' : 'v';
    const value = UINode.toNumber(pos, 0);
    this.guides.push({ type: axis, pos: value });
    return this.guides[this.guides.length - 1];
  }

  removeGuideAt(index) {
    if (index < 0 || index >= this.guides.length) return null;
    return this.guides.splice(index, 1)[0];
  }

  clearGuides() {
    this.guides = [];
  }

  /* ---- Snapping ----
     A grade entra sempre que o snap esta ligado, e nao so quando a grade
     esta visivel: num design a grade invisivel ainda arruma, e assim
     ligar/desligar a visualizacao nao muda o resultado do arrasto. A guia
     e a borda dos outros nos completam a lista de attractions. */

  /** Attractions absolutas no eixo: guias e bordas dos outros nos. */
  snapTargets(axis, excludeId = null) {
    const targets = [];
    this.guides
      .filter((guide) => guide.type === (axis === 'x' ? 'v' : 'h'))
      .forEach((guide) => targets.push(guide.pos));

    this.nodes.forEach((node) => {
      if (node.id === excludeId || !node.visible || node.locked) return;
      const b = node.getBounds();
      targets.push(axis === 'x' ? b.left : b.top);
      targets.push(axis === 'x' ? b.right : b.bottom);
    });

    return targets;
  }

  /**
   * Menor correcao, dentro do limiar, que gruda `value` numa attraction --
   * um multiplo da grade, uma guia ou a borda de outro no.
   *
   * A grade e calculada a partir do proprio valor (e nao enumerando
   * multiplos), porque o no pode estar a mil unidades da origem e um range
   * fixo de multiplos deixaria a grade fora de alcance.
   *
   * @returns {{delta:number, line:number}|null}
   */
  bestSnap(value, axis = 'x', threshold = SNAP_THRESHOLD, excludeId = null) {
    if (!this.snap || threshold <= 0) return null;

    let best = null;
    const consider = (line) => {
      const delta = line - value;
      if (Math.abs(delta) > threshold) return;
      if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, line };
    };

    if (this.gridSize > 0) consider(Math.round(value / this.gridSize) * this.gridSize);
    this.snapTargets(axis, excludeId).forEach(consider);

    return best;
  }

  snapValue(value, axis = 'x', threshold = SNAP_THRESHOLD, excludeId = null) {
    const snap = this.bestSnap(value, axis, threshold, excludeId);
    return snap ? value + snap.delta : value;
  }

  /**
   * Correcao de um arrasto: as tres bordas de cada eixo competem, e vale a
   * menor. Devolve tambem as linhas que encaixaram, para a view desenhar a
   * guia visual do encaixe.
   */
  snapBounds(bounds, options = {}) {
    const result = { bounds: { ...bounds }, lines: [] };
    if (!this.snap) return result;

    const threshold = options.threshold === undefined ? SNAP_THRESHOLD : options.threshold;
    const excludeId = options.excludeId || null;

    ['x', 'y'].forEach((axis) => {
      const edges = axis === 'x'
        ? [bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width]
        : [bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height];

      let best = null;
      edges.forEach((edge) => {
        const snap = this.bestSnap(edge, axis, threshold, excludeId);
        if (snap && (!best || Math.abs(snap.delta) < Math.abs(best.delta))) best = snap;
      });

      if (!best) return;
      if (axis === 'x') result.bounds.x += best.delta;
      else result.bounds.y += best.delta;
      result.lines.push({ axis, pos: best.line });
    });

    return result;
  }

  /* ---- Serializacao ---- */

  toJSON() {
    return {
      version: UIDesign.FILE_VERSION,
      nodes: this.nodes.map((node) => node.toJSON()),
      selectedId: this.selectedId,
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
      showGrid: this.showGrid,
      showGuides: this.showGuides,
      snap: this.snap,
      gridSize: this.gridSize,
      guides: this.guides.map((guide) => ({ type: guide.type, pos: guide.pos }))
    };
  }

  /**
   * Substitui o documento inteiro pelo conteudo do arquivo.
   *
   * O `accept` do input de arquivo e filtro de conveniencia, nao garantia --
   * o que entra aqui pode ser qualquer JSON. Por isso a conferencia antes:
   * `nodes` precisa ser uma lista, e um no de tipo desconhecido e descartado
   * em vez de entrar no array cru, que a view nao saberia desenhar.
   *
   * @returns {{ok:boolean, error?:string, skipped?:number}}
   */
  fromJSON(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, error: 'Arquivo invalido: o conteudo nao e um objeto JSON.' };
    }
    if (!Array.isArray(data.nodes)) {
      return { ok: false, error: 'Arquivo invalido: a lista "nodes" esta ausente ou nao e uma lista.' };
    }

    this.nodes = [];
    let skipped = 0;

    data.nodes.forEach((item) => {
      if (!item || typeof item !== 'object') {
        skipped += 1;
        return;
      }
      if (item.type === 'frame') this.nodes.push(UIFrame.fromJSON(item));
      else if (item.type === 'image') this.nodes.push(UIImage.fromJSON(item));
      else if (item.type === 'shape') this.nodes.push(UIShape.fromJSON(item));
      else if (item.type === 'text') this.nodes.push(UIText.fromJSON(item));
      else skipped += 1;
    });

    this.selectedId = null;
    this.zoom = this.setZoom(data.zoom === undefined ? 1 : data.zoom);
    this.setPan(data.panX, data.panY);
    this.showGrid = data.showGrid === true;
    this.showGuides = data.showGuides === true;
    this.snap = data.snap !== false;
    this.gridSize = this.setGridSize(data.gridSize === undefined ? 8 : data.gridSize);
    this.guides = Array.isArray(data.guides)
      ? data.guides
          .filter((guide) => guide && (guide.type === 'v' || guide.type === 'h'))
          .map((guide) => ({ type: guide.type, pos: UINode.toNumber(guide.pos, 0) }))
      : [];

    if (data.selectedId) this.selectById(data.selectedId);

    return { ok: true, skipped };
  }
}