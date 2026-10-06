/* ============================================
   UI/UX DESIGNER - UIDesignView
   ============================================
   Desenha o documento no SVG e traduz os gestos em
   geometria.

   Divisao de responsabilidade: a view nao cria nem
   apaga no. A criacao passa por `onCreateNode` (o
   controller decide, como o `ObjectController` faz
   com os objetos da lousa) e a geometria e mexida
   direto no no durante o arrasto, que e estado
   efemero e so vira definitivo no `onCommit` -- a
   mesma divisao que a `SelectionView` tem com os
   objetos da lousa.

   O zoom e o pan ficam no `transform` de um `<g>`
   interno, e nao em atributo de coordenada: e o
   mesmo truque do `scale()` do whiteboard, e mantem
   os nos em coordenadas de design, sem conversao
   espalhada no desenho.

   Todos os eventos sao delegados no proprio `<svg>`
   (nada de listener por no), para o desenho poder ser
   refeito a cada gesto sem rebind e sem vazar
   listener.
   ============================================ */

const SVG_NS = 'http://www.w3.org/2000/svg';
const GRID_PATTERN_ID = 'design-grid-pattern';

/** Handle e offset de rotacao em px de TELA (divididos pelo zoom no desenho). */
const HANDLE_PX = 9;
const ROTATE_OFFSET_PX = 26;

/** Abaixo disso o gesto e um clique: o no nasce com o tamanho padrao. */
const MIN_DRAG_PX = 4;

/** Shift durante a rotacao prende nos multiplos deste passo. */
const ROTATION_STEP = 15;

/** Sensibilidade do zoom por roda com ctrl/cmd. */
const WHEEL_ZOOM_FACTOR = 0.0015;

/** `deltaMode` em pixels: linha e 16px, pagina e a altura da tela. */
const WHEEL_LINE_PX = 16;
const WHEEL_PAGE_PX = 400;

const RESIZE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const DEFAULT_SIZE = {
  frame: { width: 480, height: 320 },
  rect: { width: 120, height: 80 },
  ellipse: { width: 120, height: 80 },
  line: { width: 120, height: 0 },
  text: { width: 160, height: 0 },
  // So o clique solto usa isso. A imagem nasce da caixa arrastada; se o
  // arquivo for menor que 240x160, esse tamanho distorceria a proporcao
  // de um jeito que o usuario nao pediu, entao o clique solto respeita a
  // medida natural -- trocada pelo controller em `setImageNaturalSize`.
  image: { width: 240, height: 160 }
};

/** Lado maximo da imagem que nasce de um clique solto. */
const MAX_NATURAL_SIZE = 480;

/** Cria um elemento SVG ja com os atributos. */
function el(tag, attrs = {}, className = '') {
  const node = document.createElementNS(SVG_NS, tag);
  if (className) node.setAttribute('class', className);
  Object.keys(attrs).forEach((key) => {
    if (attrs[key] === undefined || attrs[key] === null) return;
    node.setAttribute(key, attrs[key]);
  });
  return node;
}

/** Dois decimais: atributo com 12 casas polui o SVG exportado. */
function n(value) {
  return Math.round(value * 100) / 100;
}

export class UIDesignView {
  constructor(design, $) {
    this.design = design;
    this.$ = $;

    this.svg = null;
    this.scene = null;
    this.gridRect = null;
    this.gridLine = null;
    this.nodeLayer = null;
    this.guideLayer = null;
    this.overlay = null;

    this.currentTool = 'select';
    this.gesture = null;
    this.spaceDown = false;
    this.imageNaturalSize = null;   // medida do arquivo, para o clique solto

    // Callbacks injetados pelo UIDesignController.
    this.onCreateNode = null;      // (tool, props) => void
    this.onSelect = null;          // (node|null) => void
    this.onCommit = null;          // (node) => void
    this.onRequestEditText = null; // (node) => void
    this.onViewportChange = null;  // () => void
  }

  /**
   * @returns {boolean} false quando o container do modo Design ainda nao
   *   existe no HTML (a view fica inerte em vez de quebrar).
   */
  init() {
    this.svg = this.$.designSvg;
    if (!this.svg) return false;

    this.svg.setAttribute('tabindex', '0');
    this.svg.setAttribute('data-tool', this.currentTool);
    this._build();
    this._bind();
    this.render();
    return true;
  }

  /* ---- Montagem do SVG ---- */

  _build() {
    this.svg.textContent = '';

    const defs = el('defs');
    this.gridPattern = el('pattern', {
      id: GRID_PATTERN_ID,
      width: this.design.gridSize,
      height: this.design.gridSize,
      patternUnits: 'userSpaceOnUse'
    });
    this.gridLine = el('path', { d: '', fill: 'none' }, 'design-grid-line');
    this.gridPattern.appendChild(this.gridLine);
    defs.appendChild(this.gridPattern);

    this.gridRect = el('rect', {
      x: 0, y: 0, width: 0, height: 0, fill: 'url(#' + GRID_PATTERN_ID + ')'
    }, 'design-grid');
    this.guideLayer = el('g', {}, 'design-guides-layer');
    this.nodeLayer = el('g', {}, 'design-nodes');
    this.overlay = el('g', {}, 'design-overlay');

    this.scene = el('g', {}, 'design-scene');
    this.scene.appendChild(this.gridRect);
    this.scene.appendChild(this.guideLayer);
    this.scene.appendChild(this.nodeLayer);
    this.scene.appendChild(this.overlay);

    this.svg.appendChild(defs);
    this.svg.appendChild(this.scene);
  }

  _bind() {
    this.svg.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    this.svg.addEventListener('pointermove', (e) => this._onPointerMove(e));
    this.svg.addEventListener('pointerup', (e) => this._onPointerUp(e));
    this.svg.addEventListener('pointercancel', (e) => this._onPointerUp(e));
    this.svg.addEventListener('dblclick', (e) => this._onDblClick(e));
    this.svg.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    this.svg.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* ---- Ferramenta e viewport ---- */

  setTool(tool) {
    this.currentTool = tool;
    if (this.svg) this.svg.setAttribute('data-tool', tool);
  }

  /**
   * Medida natural do arquivo escolhido, para o clique solto criar a
   * imagem no tamanho dela. Sem isso, um icone de 32x32 nasceria dentro
   * de uma caixa de 240x160 -- esticado ou com borda vazia, nenhum dos
   * dois pedido pelo usuario.
   */
  setImageNaturalSize(width, height) {
    const w = Number(width) > 0 ? Number(width) : 0;
    const h = Number(height) > 0 ? Number(height) : 0;
    if (!w || !h) {
      this.imageNaturalSize = null;
      return;
    }
    // A medida natural entra inteira, cabendo em MAX_NATURAL_SIZE e sem
    // esticar nenhum dos lados.
    const k = Math.min(1, MAX_NATURAL_SIZE / Math.max(w, h));
    this.imageNaturalSize = {
      width: Math.max(1, Math.round(w * k)),
      height: Math.max(1, Math.round(h * k))
    };
  }

  /** Segurar espaco e o gesto de "mao": arrastar o conteudo. */
  setSpace(down) {
    this.spaceDown = down === true;
    if (this.svg) this.svg.classList.toggle('is-panning', this.spaceDown);
  }

  focus() {
    if (this.svg && this.svg.focus) this.svg.focus();
  }

  _clientToDesign(e) {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - this.design.panX) / this.design.zoom,
      y: (e.clientY - rect.top - this.design.panY) / this.design.zoom
    };
  }

  _viewport() {
    const rect = this.svg.getBoundingClientRect();
    const zoom = this.design.zoom;
    return {
      left: -this.design.panX / zoom,
      top: -this.design.panY / zoom,
      width: (rect.width || 800) / zoom,
      height: (rect.height || 600) / zoom
    };
  }

  /** Zoom ancorado num ponto de tela: o ponto de design sob o cursor fica. */
  zoomAt(zoom, clientX, clientY) {
    const rect = this.svg.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const anchor = {
      x: (cx - this.design.panX) / this.design.zoom,
      y: (cy - this.design.panY) / this.design.zoom
    };
    this.design.setZoom(zoom);
    this.design.setPan(cx - anchor.x * this.design.zoom, cy - anchor.y * this.design.zoom);
    this.render();
    if (this.onViewportChange) this.onViewportChange();
  }

  zoomBy(delta) {
    const rect = this.svg.getBoundingClientRect();
    this.zoomAt(this.design.zoom + delta, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  /* ---- Desenho ---- */

  render() {
    if (!this.svg) return;
    this._syncViewport();
    this._renderNodes();
    this._renderGuides();
    this._renderOverlay();
  }

  _syncViewport() {
    const view = this._viewport();
    const step = this.design.gridSize;

    this.scene.setAttribute(
      'transform',
      'translate(' + n(this.design.panX) + ' ' + n(this.design.panY) + ') scale(' + n(this.design.zoom) + ')'
    );

    this.svg.classList.toggle('show-grid', this.design.showGrid);
    this.gridPattern.setAttribute('width', step);
    this.gridPattern.setAttribute('height', step);
    this.gridLine.setAttribute('d', 'M ' + step + ' 0 L 0 0 0 ' + step);
    // A grade e um hairline: 1px de TELA, qualquer que seja o zoom.
    this.gridLine.setAttribute('stroke-width', n(1 / this.design.zoom));

    this.gridRect.setAttribute('x', n(view.left));
    this.gridRect.setAttribute('y', n(view.top));
    this.gridRect.setAttribute('width', n(view.width));
    this.gridRect.setAttribute('height', n(view.height));
  }

  _renderNodes() {
    this.nodeLayer.textContent = '';
    this.design.nodes.forEach((node) => {
      if (!node.visible) return;
      this.nodeLayer.appendChild(this._buildNode(node));
    });
  }

  _updateNode(node) {
    const fresh = this._buildNode(node);
    const current = this.nodeLayer.querySelector('[data-node-id="' + node.id + '"]');
    if (current) this.nodeLayer.replaceChild(fresh, current);
    else this.nodeLayer.appendChild(fresh);
  }

  /**
   * Monta o no. `chrome = false` monta so o conteudo exportavel, sem a
   * caixa de acerto nem o rotulo do frame -- e o que vai para o SVG.
   */
  _buildNode(node, chrome = true) {
    const className = 'design-node type-' + node.type
      + (node.shapeType ? ' shape-' + node.shapeType : '')
      + (node.locked ? ' is-locked' : '');

    const g = el('g', { class: className, 'data-node-id': node.id });
    if (node.rotation) {
      g.setAttribute('transform', 'rotate(' + n(node.rotation) + ' ' + n(node.centerX) + ' ' + n(node.centerY) + ')');
    }

    // Caixa de acerto invisivel: garante que o clique acerte o no inteiro,
    // e nao so a parte pintada (uma forma sem preenchimento, uma linha, o
    // vazio dentro de um texto).
    if (chrome) {
      g.appendChild(el('rect', {
        x: n(node.x), y: n(node.y), width: n(node.width), height: n(node.height)
      }, 'design-hit'));
    }

    if (node.type === 'frame') {
      g.appendChild(el('rect', {
        x: n(node.x), y: n(node.y), width: n(node.width), height: n(node.height),
        fill: node.background
      }, 'design-frame'));
      if (chrome) {
        const label = el('text', { x: n(node.x), y: n(node.y - 6) }, 'design-frame-label');
        label.textContent = node.name;
        g.appendChild(label);
      }
    }

    if (node.type === 'shape') this._buildShape(g, node);

    if (node.type === 'image') this._buildImage(g, node);

    if (node.type === 'text') this._buildText(g, node);

    return g;
  }

  _buildImage(g, node) {
    // O no e a caixa; quem decide como o bitmap cabe nela e o
    // `preserveAspectRatio`. Por isso nao ha conta de proporcao aqui: o
    // navegador ja faz, e e o unico que sabe a medida real do arquivo.
    if (!node.isEmpty) {
      g.appendChild(el('image', {
        x: n(node.x), y: n(node.y), width: n(node.width), height: n(node.height),
        preserveAspectRatio: node.preserveAspectRatio,
        href: node.src
      }, 'design-image'));
      return;
    }

    // Imagem sem `src` -- um arquivo aberto sem a imagem, ou um node
    // apagado no editor. Fica a caixa tracejada, para nao parecer que o
    // desenho sumiu.
    const box = el('rect', {
      x: n(node.x), y: n(node.y), width: n(node.width), height: n(node.height),
      fill: 'none', stroke: '#b9b9c6', 'stroke-width': 1, 'stroke-dasharray': '6 4'
    }, 'design-image-missing');
    g.appendChild(box);
  }

  _buildShape(g, node) {
    const paint = {
      fill: node.fill,
      stroke: node.stroke,
      'stroke-width': n(node.strokeWidth)
    };

    if (node.shapeType === 'ellipse') {
      g.appendChild(el('ellipse', {
        ...paint,
        cx: n(node.centerX), cy: n(node.centerY),
        rx: n(node.width / 2), ry: n(node.height / 2)
      }, 'design-shape'));
      return;
    }

    if (node.shapeType === 'line') {
      // A guarda de preenchimento e o que impede `fill` de pintar a linha
      // como se fosse uma area fechada.
      g.appendChild(el('line', {
        x1: n(node.x), y1: n(node.y),
        x2: n(node.x + node.width), y2: n(node.y + node.height),
        stroke: node.stroke === 'none' ? node.fill : node.stroke,
        'stroke-width': n(node.strokeWidth),
        'stroke-linecap': 'round'
      }, 'design-shape'));
      return;
    }

    // Com os quatro cantos iguais, `rx`/`ry` resolvem tudo num
    // `<rect>`. Quando algum canto destoa, o SVG nao tem atributo que
    // faça isso: o retangulo vira um caminho com um arco por canto.
    if (node.uniformRadii) {
      g.appendChild(el('rect', {
        ...paint,
        x: n(node.x), y: n(node.y), width: n(node.width), height: n(node.height),
        rx: n(node.radii[0]), ry: n(node.radii[0])
      }, 'design-shape'));
      return;
    }

    g.appendChild(el('path', {
      ...paint,
      d: UIDesignView.roundedRectPath(node)
    }, 'design-shape'));
  }

  /**
   * Caminho do retangulo com um arco por canto, no sentido horario a
   * partir do canto superior esquerdo. Fica no espaco local da forma:
   * a rotacao ja e um `transform` do grupo, e por isso nao entra aqui.
   *
   * @param {import('../models/UIShape.js').UIShape} node
   * @returns {string} atributo `d`
   */
  static roundedRectPath(node) {
    const [tl, tr, br, bl] = node.radii;
    const x = n(node.x);
    const y = n(node.y);
    const right = n(node.x + node.width);
    const bottom = n(node.y + node.height);

    return [
      'M', n(node.x + tl), y,
      'H', n(node.x + node.width - tr),
      'A', n(tr), n(tr), 0, 0, 1, right, n(node.y + tr),
      'V', n(node.y + node.height - br),
      'A', n(br), n(br), 0, 0, 1, n(node.x + node.width - br), bottom,
      'H', n(node.x + bl),
      'A', n(bl), n(bl), 0, 0, 1, x, n(node.y + node.height - bl),
      'V', n(node.y + tl),
      'A', n(tl), n(tl), 0, 0, 1, n(node.x + tl), y,
      'Z'
    ].join(' ');
  }

  _buildText(g, node) {
    const anchor = node.align === 'center' ? 'middle' : node.align === 'right' ? 'end' : 'start';
    const x = node.align === 'center' ? node.centerX : node.align === 'right' ? node.x + node.width : node.x;

    const text = el('text', {
      x: n(x),
      y: n(node.y + node.fontSize),
      'font-size': n(node.fontSize),
      'font-family': node.fontFamily,
      'font-weight': node.fontWeight,
      fill: node.color,
      'text-anchor': anchor
    }, 'design-text');

    node.lines.forEach((line, index) => {
      const span = el('tspan', {
        x: n(x),
        dy: index === 0 ? 0 : n(node.fontSize * node.lineHeight)
      });
      span.textContent = line;
      text.appendChild(span);
    });

    g.appendChild(text);
  }

  _renderGuides() {
    this.guideLayer.textContent = '';
    if (!this.design.showGuides) return;

    const view = this._viewport();
    this.design.guides.forEach((guide) => {
      if (guide.type === 'v') {
        this.guideLayer.appendChild(el('line', {
          x1: n(guide.pos), y1: n(view.top),
          x2: n(guide.pos), y2: n(view.top + view.height)
        }, 'design-guide'));
      } else {
        this.guideLayer.appendChild(el('line', {
          x1: n(view.left), y1: n(guide.pos),
          x2: n(view.left + view.width), y2: n(guide.pos)
        }, 'design-guide'));
      }
    });
  }

  _renderOverlay() {
    this.overlay.textContent = '';
    const gesture = this.gesture;

    if (gesture && gesture.type === 'create') this._drawCreatePreview(gesture);

    const selected = this.design.selected;
    if (selected && selected.visible) this._drawSelection(selected);

    if (gesture && gesture.lines && gesture.lines.length) this._drawSnapLines(gesture.lines);
  }

  /** Contorno, 8 handles e o punho de rotacao do no selecionado. */
  _drawSelection(node) {
    const zoom = this.design.zoom;
    const size = HANDLE_PX / zoom;

    const g = el('g', { class: 'design-chrome' });
    if (node.rotation) {
      g.setAttribute('transform', 'rotate(' + n(node.rotation) + ' ' + n(node.centerX) + ' ' + n(node.centerY) + ')');
    }

    g.appendChild(el('rect', {
      x: n(node.x), y: n(node.y), width: n(node.width), height: n(node.height)
    }, 'design-outline'));

    RESIZE_DIRS.forEach((dir) => {
      const point = UIDesignView.handlePoint(node, dir);
      g.appendChild(el('rect', {
        'data-handle': dir,
        x: n(point.x - size / 2),
        y: n(point.y - size / 2),
        width: n(size),
        height: n(size)
      }, 'design-handle dir-' + dir));
    });

    const stemTop = { x: node.centerX, y: node.y - ROTATE_OFFSET_PX / zoom };
    g.appendChild(el('line', {
      x1: n(node.centerX), y1: n(node.y),
      x2: n(stemTop.x), y2: n(stemTop.y)
    }, 'design-rotate-stem'));
    g.appendChild(el('circle', {
      'data-handle': 'rotate',
      cx: n(stemTop.x),
      cy: n(stemTop.y),
      r: n(size * 0.62)
    }, 'design-handle design-handle-rotate'));

    this.overlay.appendChild(g);
  }

  static handlePoint(node, dir) {
    const map = {
      nw: { x: node.x, y: node.y },
      n: { x: node.centerX, y: node.y },
      ne: { x: node.x + node.width, y: node.y },
      e: { x: node.x + node.width, y: node.centerY },
      se: { x: node.x + node.width, y: node.y + node.height },
      s: { x: node.centerX, y: node.y + node.height },
      sw: { x: node.x, y: node.y + node.height },
      w: { x: node.x, y: node.centerY }
    };
    return map[dir] || map.se;
  }

  _drawCreatePreview(gesture) {
    const bounds = this._createBounds(gesture, false);
    const g = el('g', { class: 'design-preview' });

    if (gesture.tool === 'line') {
      g.appendChild(el('line', {
        x1: n(gesture.start.x), y1: n(gesture.start.y),
        x2: n(gesture.start.x + bounds.width), y2: n(gesture.start.y + bounds.height)
      }, 'design-preview-shape'));
    } else {
      g.appendChild(el('rect', {
        x: n(bounds.x), y: n(bounds.y),
        width: n(bounds.width), height: n(bounds.height)
      }, 'design-preview-shape'));
    }

    const label = el('text', {
      x: n(gesture.start.x + 8),
      y: n(gesture.start.y - 8)
    }, 'design-measure');
    label.textContent = Math.round(bounds.width) + ' x ' + Math.round(bounds.height);
    g.appendChild(label);

    this.overlay.appendChild(g);
  }

  _drawSnapLines(lines) {
    const view = this._viewport();
    const g = el('g', { class: 'design-snap' });

    lines.forEach((line) => {
      if (line.axis === 'x') {
        g.appendChild(el('line', {
          x1: n(line.pos), y1: n(view.top),
          x2: n(line.pos), y2: n(view.top + view.height)
        }, 'design-snap-line'));
      } else {
        g.appendChild(el('line', {
          x1: n(view.left), y1: n(line.pos),
          x2: n(view.left + view.width), y2: n(line.pos)
        }, 'design-snap-line'));
      }
    });

    this.overlay.appendChild(g);
  }

  /* ---- Gestos ---- */

  _capture(e) {
    if (this.svg.setPointerCapture) {
      try {
        this.svg.setPointerCapture(e.pointerId);
      } catch {
        // navegador sem captura (ou ponteiro ja liberado): o gesto segue
        // pelos eventos no svg mesmo assim.
      }
    }
  }

  _release(e) {
    if (this.svg.releasePointerCapture) {
      try {
        this.svg.releasePointerCapture(e.pointerId);
      } catch {
        // ja liberado: nada a fazer.
      }
    }
  }

  _onPointerDown(e) {
    if (!e.isPrimary || this.gesture) return;

    // Botao do meio, direito ou espaco: arrastar o conteudo.
    if (e.button === 1 || e.button === 2 || this.spaceDown) {
      this.gesture = { type: 'pan', last: { x: e.clientX, y: e.clientY } };
      this._capture(e);
      e.preventDefault();
      return;
    }

    if (e.button !== 0) return;

    if (this.currentTool !== 'select') {
      const start = this._clientToDesign(e);
      this.gesture = {
        type: 'create',
        tool: this.currentTool,
        start,
        current: start,
        startClient: { x: e.clientX, y: e.clientY },
        currentClient: { x: e.clientX, y: e.clientY },
        lines: []
      };
      this._capture(e);
      e.preventDefault();
      this._renderOverlay();
      return;
    }

    const handle = e.target.closest('[data-handle]');
    if (handle) {
      this._startHandle(e, handle.getAttribute('data-handle'));
      return;
    }

    const host = e.target.closest('[data-node-id]');
    const node = host ? this.design.getNode(host.getAttribute('data-node-id')) : null;

    if (node) {
      if (node.locked) return;
      if (this.design.selectedId !== node.id) {
        this.design.selectNode(node);
        this._notifySelect(node);
        this.render();
      }
      this.gesture = {
        type: 'move',
        node,
        start: this._clientToDesign(e),
        origin: { x: node.x, y: node.y, width: node.width, height: node.height },
        lines: []
      };
      this._capture(e);
      e.preventDefault();
      return;
    }

    // Fundo: limpa a selecao.
    this.design.deselectAll();
    this._notifySelect(null);
    this._renderOverlay();
  }

  _startHandle(e, dir) {
    const node = this.design.selected;
    if (!node || node.locked) return;

    const point = this._clientToDesign(e);

    if (dir === 'rotate') {
      const center = node.centerPoint();
      this.gesture = {
        type: 'rotate',
        node,
        center,
        startAngle: Math.atan2(point.y - center.y, point.x - center.x),
        startRotation: node.rotation,
        lines: []
      };
    } else {
      this.gesture = {
        type: 'resize',
        node,
        dir,
        start: point,
        origin: { x: node.x, y: node.y, width: node.width, height: node.height },
        lines: []
      };
    }

    this._capture(e);
    e.preventDefault();
  }

  _onPointerMove(e) {
    const gesture = this.gesture;
    if (!gesture) return;

    if (gesture.type === 'pan') {
      this.design.panBy(e.clientX - gesture.last.x, e.clientY - gesture.last.y);
      gesture.last = { x: e.clientX, y: e.clientY };
      this.render();
      return;
    }

    const point = this._clientToDesign(e);

    if (gesture.type === 'create') {
      gesture.current = point;
      gesture.currentClient = { x: e.clientX, y: e.clientY };
      this._renderOverlay();
      return;
    }
    if (gesture.type === 'move') this._applyMove(gesture, point, e);
    else if (gesture.type === 'resize') this._applyResize(gesture, point, e);
    else if (gesture.type === 'rotate') this._applyRotate(gesture, point, e);
  }

  _onPointerUp(e) {
    const gesture = this.gesture;
    if (!gesture) return;

    this.gesture = null;
    this._release(e);

    if (gesture.type === 'create') {
      this._finishCreate(gesture, e);
      return;
    }

    this.render();

    if (gesture.type === 'pan') {
      if (this.onViewportChange) this.onViewportChange();
      return;
    }
    if (this.onCommit) this.onCommit(gesture.node);
  }

  _applyMove(gesture, point, e) {
    const node = gesture.node;
    if (node.locked) return;

    let x = gesture.origin.x + (point.x - gesture.start.x);
    let y = gesture.origin.y + (point.y - gesture.start.y);
    gesture.lines = [];

    if (!e.shiftKey) {
      const snap = this.design.snapBounds(
        { x, y, width: gesture.origin.width, height: gesture.origin.height },
        { excludeId: node.id }
      );
      x = snap.bounds.x;
      y = snap.bounds.y;
      gesture.lines = snap.lines;
    }

    node.setPosition(x, y);
    this._updateNode(node);
    this._renderOverlay();
  }

  _applyResize(gesture, point, e) {
    const node = gesture.node;
    if (node.locked) return;

    const dir = gesture.dir;
    const origin = gesture.origin;
    const dx = point.x - gesture.start.x;
    const dy = point.y - gesture.start.y;

    let left = origin.x;
    let top = origin.y;
    let right = origin.x + origin.width;
    let bottom = origin.y + origin.height;

    if (dir.indexOf('w') >= 0) left = origin.x + dx;
    if (dir.indexOf('e') >= 0) right = origin.x + origin.width + dx;
    if (dir.indexOf('n') >= 0) top = origin.y + dy;
    if (dir.indexOf('s') >= 0) bottom = origin.y + origin.height + dy;

    gesture.lines = [];
    const corner = dir.length === 2;

    if (e.shiftKey && corner && origin.width > 0 && origin.height > 0) {
      // Shift no canto trava a proporcao; a borda que o mouse mais moveu
      // manda, e a outra e recalculada.
      const aspect = origin.width / origin.height;
      const w = right - left;
      const h = bottom - top;
      const newW = Math.abs(w - origin.width) >= Math.abs(h - origin.height) ? w : h * aspect;
      const newH = newW / aspect;
      if (dir.indexOf('w') >= 0) left = right - newW;
      else right = left + newW;
      if (dir.indexOf('n') >= 0) top = bottom - newH;
      else bottom = top + newH;
    } else if (!e.shiftKey) {
      if (dir.indexOf('w') >= 0) left = this._snapEdge(left, 'x', node, gesture);
      if (dir.indexOf('e') >= 0) right = this._snapEdge(right, 'x', node, gesture);
      if (dir.indexOf('n') >= 0) top = this._snapEdge(top, 'y', node, gesture);
      if (dir.indexOf('s') >= 0) bottom = this._snapEdge(bottom, 'y', node, gesture);
    }

    let width = right - left;
    let height = bottom - top;

    // O piso e do no (linha pode ter 0), e a borda oposta e a que fica.
    if (width < node.minWidth) {
      if (dir.indexOf('w') >= 0) left = right - node.minWidth;
      else right = left + node.minWidth;
      width = right - left;
    }
    if (height < node.minHeight) {
      if (dir.indexOf('n') >= 0) top = bottom - node.minHeight;
      else bottom = top + node.minHeight;
      height = bottom - top;
    }

    node.setBounds({ x: left, y: top, width, height });
    this._updateNode(node);
    this._renderOverlay();
  }

  /** Encaixa uma borda em movimento e registra a linha da guia visual. */
  _snapEdge(value, axis, node, gesture) {
    const snap = this.design.bestSnap(value, axis, undefined, node.id);
    if (!snap) return value;
    gesture.lines.push({ axis, pos: snap.line });
    return value + snap.delta;
  }

  _applyRotate(gesture, point, e) {
    const node = gesture.node;
    if (node.locked) return;

    const angle = Math.atan2(point.y - gesture.center.y, point.x - gesture.center.x);
    let deg = gesture.startRotation + (angle - gesture.startAngle) * 180 / Math.PI;
    if (e.shiftKey) deg = Math.round(deg / ROTATION_STEP) * ROTATION_STEP;

    node.setRotation(deg);
    this._updateNode(node);
    this._renderOverlay();
  }

  /* ---- Roda e duplo clique ----
     Ctrl/cmd + roda da zoom ancorado no cursor, como em editor de imagem;
     roda solta so desloca o conteudo. O `preventDefault` e obrigatorio
     porque o listener foi registrado como nao-passivo -- sem ele a pagina
     inteira rolaria junto. */

  _onWheel(e) {
    e.preventDefault();

    const delta = e.deltaMode === 1
      ? e.deltaY * WHEEL_LINE_PX
      : e.deltaMode === 2
        ? e.deltaY * WHEEL_PAGE_PX
        : e.deltaY;

    if (e.ctrlKey || e.metaKey) {
      this.zoomAt(this.design.zoom * Math.exp(-delta * WHEEL_ZOOM_FACTOR), e.clientX, e.clientY);
      return;
    }

    this.design.panBy(-e.deltaX, -delta);
    this.render();
    if (this.onViewportChange) this.onViewportChange();
  }

  /** Duplo clique no texto: quem edita o conteudo e o painel de propriedades. */
  _onDblClick(e) {
    const host = e.target.closest('[data-node-id]');
    const node = host ? this.design.getNode(host.getAttribute('data-node-id')) : null;
    if (!node || node.locked || node.type !== 'text') return;
    e.preventDefault();
    if (this.onRequestEditText) this.onRequestEditText(node);
  }

  /* ---- Criacao ---- */

  _finishCreate(gesture, e) {
    const bounds = this._createBounds(gesture, e.shiftKey);
    this._renderOverlay();
    if (this.onCreateNode) this.onCreateNode(gesture.tool, bounds);
  }

  /**
   * Geometria do no que vai nascer. Clique solto usa o tamanho padrao da
   * ferramenta; arrasto usa a caixa apertada -- exceto linha, que guarda as
   * duas pontas (a diagonal e o desenho, nao a caixa).
   *
   * O que separa clique de arrasto e medido em px de TELA, e nao em px de
   * design: a 400% de zoom, quatro pixels de tela mal passam de uma unidade
   * de design, e o no nasceria com o tamanho padrao embaixo do cursor.
   */
  _createBounds(gesture, disableSnap) {
    const from = gesture.startClient;
    const to = gesture.currentClient;
    const dragged = from && to
      && Math.hypot(to.x - from.x, to.y - from.y) > MIN_DRAG_PX;

    if (!dragged) {
      const size = gesture.tool === 'image' && this.imageNaturalSize
        ? this.imageNaturalSize
        : (DEFAULT_SIZE[gesture.tool] || { width: 120, height: 80 });
      return { x: gesture.start.x, y: gesture.start.y, width: size.width, height: size.height };
    }

    if (gesture.tool === 'line') {
      return {
        x: gesture.start.x,
        y: gesture.start.y,
        width: gesture.current.x - gesture.start.x,
        height: gesture.current.y - gesture.start.y
      };
    }

    const bounds = {
      x: Math.min(gesture.start.x, gesture.current.x),
      y: Math.min(gesture.start.y, gesture.current.y),
      width: Math.abs(gesture.current.x - gesture.start.x),
      height: Math.abs(gesture.current.y - gesture.start.y)
    };

    // Texto nao gruda na grade: a largura vem do arrasto e a altura e
    // medida do proprio texto.
    if (!disableSnap && gesture.tool !== 'text') {
      return this.design.snapBounds(bounds).bounds;
    }
    return bounds;
  }

  _notifySelect(node) {
    if (this.onSelect) this.onSelect(node);
  }

  /* ---- Exportacao ---- */

  /**
   * SVG autonomo do conteudo: sem grade, sem guias, sem contorno de
   * selecao, sem caixa de acerto. O `viewBox` e a caixa do conteudo
   * visivel, e nao a da tela.
   */
  getSVG() {
    if (!this.svg) return '';

    const bounds = this.design.contentBounds() || { left: 0, top: 0, right: 800, bottom: 600 };
    const width = Math.max(1, Math.round(bounds.right - bounds.left));
    const height = Math.max(1, Math.round(bounds.bottom - bounds.top));

    const root = el('svg', {
      width,
      height,
      viewBox: bounds.left + ' ' + bounds.top + ' ' + width + ' ' + height
    });
    // Declaracao de namespace de verdade: e o que faz o arquivo abrir
    // sozinho em qualquer visualizador, e nao so embutido numa pagina.
    root.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', SVG_NS);

    const group = el('g', {});
    this.design.nodes.forEach((node) => {
      if (node.visible) group.appendChild(this._buildNode(node, false));
    });
    root.appendChild(group);

    return '<?xml version="1.0" encoding="UTF-8"?>\n'
      + new XMLSerializer().serializeToString(root);
  }
}