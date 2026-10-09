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

import { UIShape } from '../models/UIShape.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GRID_PATTERN_ID = 'design-grid-pattern';

/** Handle e offset de rotacao em px de TELA (divididos pelo zoom no desenho). */
const HANDLE_PX = 9;
const ROTATE_OFFSET_PX = 26;

/**
 * Faixa de clique ao redor de uma linha, em px de TELA. A caixa de acerto
 * comum e a bbox do no, e a bbox de uma linha horizontal ou vertical tem
 * zero de altura: o clique nao achava nada. Vale para o traço fino tambem.
 */
const LINE_HIT_PX = 12;

/** Abaixo disso o gesto e um clique: o no nasce com o tamanho padrao. */
const MIN_DRAG_PX = 4;

/** Shift durante a rotacao prende nos multiplos deste passo. */
const ROTATION_STEP = 15;

/**
 * Direcoes do encaixe angular da linha com Shift: 0, 45, 90, 135, 180, 225,
 * 270 e 315 graus. Tabela em vez de `cos/sin` para as horizontais e
 * verticais caírem em zero exato -- cosseno de 90 graus vira 6e-17 em ponto
 * flutuante, e a linha "reta" nasceria com uma altura invisivel, mas suja.
 */
const SNAP_DIRECTIONS = [
  [1, 0],
  [Math.SQRT1_2, Math.SQRT1_2],
  [0, 1],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [-1, 0],
  [-Math.SQRT1_2, -Math.SQRT1_2],
  [0, -1],
  [Math.SQRT1_2, -Math.SQRT1_2]
];

/** Distancia (px de tela) de um novo ponto ao primeiro que fecha a forma. */
const POLYGON_CLOSE_PX = 8;

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

    // Sessao de desenho do poligono. Existe so enquanto a ferramenta
    // Poligono esta ativa e o gesto ainda nao terminou; a cada clique um
    // ponto e gravado e o duplo clique/Enter fecha a forma.
    this.polygon = null;

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
    if (tool === 'polygon') {
      // Entrar na ferramenta abre uma sessao nova; qualquer sessao velha
      // ja tinha sido descartada ao sair dela.
      this.polygon = { points: [], hover: null };
    } else {
      this.polygon = null;
    }
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

  /**
   * Shift premido ou solto durante um arrasto de criacao. O `pointermove`
   * so le `e.shiftKey` quando o mouse anda, entao sem isto o encaixe de 45
   * graus da linha so mudaria ao mover o cursor -- apertar Shift parado
   * sobre o preview ficaria sem efeito. Fora de um gesto de criacao nao ha
   * o que atualizar, e o valor do proprio evento decide no `pointerup`.
   */
  setShift(down) {
    if (!this.gesture || this.gesture.type !== 'create') return;
    const next = down === true;
    if (this.gesture.shiftKey === next) return;
    this.gesture.shiftKey = next;
    this._renderOverlay();
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
    // Cor da grade, no `<path>` que o `<pattern>` repete -- e o mesmo caminho
    // que pinta a grade de dentro dos frames, entao os dois nunca discordam.
    // `style` inline vence a regra da classe; valor vazio remove a propriedade
    // e devolve a palavra ao `--border-strong` do tema.
    this.gridLine.style.stroke = this.design.gridColor || '';

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

      // Linha: a bbox acima tem zero de altura (horizontal) ou zero de
      // largura (vertical) e nao recebe clique nenhum -- e o caso comum
      // desde que o snap de 45 graus existe. Este `<line>` invisivel da a
      // faixa de clique em volta do traço, medida em px de TELA e nao em
      // unidades de design, para valer o mesmo a 10% e a 800% de zoom
      // (mesma conta dos handles). Só chrome: o export SVG nunca o leva.
      if (node.type === 'shape' && node.shapeType === 'line') {
        g.appendChild(el('line', {
          x1: n(node.x), y1: n(node.y),
          x2: n(node.x + node.width), y2: n(node.y + node.height),
          'stroke-width': n(Math.max(node.strokeWidth, LINE_HIT_PX / (this.design.zoom || 1))),
          'stroke-linecap': 'round'
        }, 'design-hit-line'));
      }
    }

    if (node.type === 'frame') {
      g.appendChild(el('rect', {
        x: n(node.x), y: n(node.y), width: n(node.width), height: n(node.height),
        fill: node.background
      }, 'design-frame'));
      if (chrome) {
        // A grade de dentro do frame: o mesmo `<pattern>` da grade da tela,
        // entao mesma cor, mesma espessura e o mesmo alinhamento -- as linhas
        // continuam sendo uma grade so, atravessando o canvas e o frame. O
        // retangulo e a propria caixa do frame, entao ele ja nasce recortado
        // nela. Vem depois do fundo (opaco, e o esconderia) e antes do
        // conteudo, que sao os `<g>` dos filhos logo acima na camada de nos.
        // So com chrome: o export SVG nunca levou grade, e continuou sem.
        g.appendChild(el('rect', {
          x: n(node.x), y: n(node.y), width: n(node.width), height: n(node.height),
          fill: 'url(#' + GRID_PATTERN_ID + ')'
        }, 'design-grid'));

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

    if (node.shapeType === 'polygon') {
      // O contorno usa as arestas dos pontos; sem `stroke-linejoin` os
      // cantos agudos de um poligono seriam cortados no desenho.
      g.appendChild(el('polygon', {
        ...paint,
        points: UIDesignView.polygonPointsString(node),
        'stroke-linejoin': 'round'
      }, 'design-shape'));
      return;
    }

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

/* ---- Poligono (pontos) ---- */

  /** Os pontos do no em coordenadas de design. */
  static polygonPoints(node) {
    return (node.points || []).map((p) => ({ x: node.x + p.x, y: node.y + p.y }));
  }

  /** Atributo `points` do `<polygon>`: pares "x,y" separados por espaco. */
  static polygonPointsString(node) {
    return UIDesignView.polygonPoints(node)
      .map((p) => n(p.x) + ',' + n(p.y))
      .join(' ');
  }

  /** `d` de um caminho fechado passando pelos pontos. */
  static polygonPath(pts) {
    if (!Array.isArray(pts) || pts.length < 2) return '';
    return 'M ' + pts.map((p) => n(p.x) + ' ' + n(p.y)).join(' L ') + ' Z';
  }

  /**
   * Caminho fechado do poligono de um no; usado no contorno de selecao
   * (que acompanha as arestas, e nao a caixa).
   */
  static polygonNodePath(node) {
    return UIDesignView.polygonPath(UIDesignView.polygonPoints(node));
  }

  /**
   * Caminho fechado do retangulo com um arco por canto, no sentido horario a
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
    if (this.polygon) this._drawPolygonSession(this.polygon);

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

    // Poligono: o contorno anda pelas arestas, e cada vertice mostra o
    // angulo interno -- a forma e os angulos dela seguem juntos.
    if (node.shapeType === 'polygon') {
      g.appendChild(el('path', { d: UIDesignView.polygonNodePath(node) }, 'design-outline'));
      const pts = UIDesignView.polygonPoints(node);
      const total = pts.length;
      for (let i = 0; i < total; i += 1) {
        this._appendAngleLabel(g, pts[(i - 1 + total) % total], pts[i], pts[(i + 1) % total], zoom);
      }
    } else {
      g.appendChild(el('rect', {
        x: n(node.x), y: n(node.y), width: n(node.width), height: n(node.height)
      }, 'design-outline'));
    }

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

  /**
   * Trava a direcao do vetor `(dx, dy)` no multiplo de 45 graus mais proximo,
   * mantendo o comprimento: e o Shift ao desenhar uma linha. O fim da linha
   * nao vai para o cursor, vai para a diagonal mais perto dele -- a linha
   * gira, nao encolhe (o comprimento continua sendo o do arrasto).
   *
   * O vetor nulo fica no proprio zero: sem direcao nao ha o que arredondar.
   */
  static snapAngle45(dx, dy) {
    const length = Math.hypot(dx, dy);
    if (!length) return { dx: 0, dy: 0 };

    const step = Math.PI / 4;
    const index = Math.round(Math.atan2(dy, dx) / step);
    const [ux, uy] = SNAP_DIRECTIONS[((index % 8) + 8) % 8];
    return { dx: ux * length, dy: uy * length };
  }

  _drawCreatePreview(gesture) {
    // Mesma conta do commit: o preview precisa passar pelo Shift tambem, senao
    // a linha aparece numa direcao enquanto o botao esta solto e nasce em outra
    // no `pointerup`.
    const bounds = this._createBounds(gesture, gesture.shiftKey);
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
    label.textContent = this._measureLabel(gesture, bounds);
    g.appendChild(label);

    this.overlay.appendChild(g);
  }

  /**
   * Texto do rotulo do preview. Com Shift na linha, largura x altura nao diz
   * nada -- o que interessa e o angulo travado, mostrado como inclinacao em
   * 0..180 (a linha nao tem sentido: 315 e 135 sao a mesma reta).
   */
  _measureLabel(gesture, bounds) {
    if (gesture.tool !== 'line' || !gesture.shiftKey) {
      return Math.round(bounds.width) + ' x ' + Math.round(bounds.height);
    }
    let deg = Math.atan2(bounds.height, bounds.width) * 180 / Math.PI;
    if (deg < 0) deg += 180;
    return Math.round(deg) + '\u00B0';
  }

  /* ---- Sessao do poligono ----
     A ferramenta Poligono nao usa o gesto de arrasto: cada clique grava um
     ponto em `this.polygon.points`, e o duplo clique (ou Enter) fecha a
     forma. Tudo que a sessao desenha vive neste overlay, somando aos nos. */

  _drawPolygonSession(session) {
    const zoom = this.design.zoom;
    const pts = session.points;
    const hover = session.hover;
    const g = el('g', { class: 'design-polygon-session' });

    if (pts.length >= 2) {
      g.appendChild(el('path', {
        d: 'M ' + pts.map((p) => n(p.x) + ' ' + n(p.y)).join(' L '),
        fill: 'none'
      }, 'design-preview-shape'));
    }

    const last = pts.length ? pts[pts.length - 1] : null;
    if (last && hover && (hover.x !== last.x || hover.y !== last.y)) {
      // O segmento do cursor: mostra onde o proximo clique vai entrar.
      g.appendChild(el('line', {
        x1: n(last.x), y1: n(last.y), x2: n(hover.x), y2: n(hover.y)
      }, 'design-preview-shape design-preview-live'));
    }

    const radius = 3.2 / zoom;
    pts.forEach((p) => {
      g.appendChild(el('circle', {
        cx: n(p.x), cy: n(p.y), r: n(radius)
      }, 'design-polygon-vertex'));
    });

    // Angulo ao vivo: em cada ponto ja gravado com dois vizinhos (o
    // anterior e o cursor no ultimo), o topo do canto mostra os graus.
    const all = hover ? pts.concat([hover]) : pts.slice();
    for (let i = 1; i < all.length - 1; i += 1) {
      this._appendAngleLabel(g, all[i - 1], all[i], all[i + 1], zoom);
    }

    const first = pts.length ? pts[0] : null;
    if (pts.length >= 2 && first) {
      const hint = el('text', {
        x: n(first.x), y: n(first.y - 16 / zoom), 'text-anchor': 'middle'
      }, 'design-hint');
      hint.textContent = pts.length < 3 ? '3+ pontos, depois duplo clique' : 'duplo clique fecha';
      g.appendChild(hint);
    }

    this.overlay.appendChild(g);
  }

  /** Rotulo do angulo no vertice `b` (entre `a` e `c`), num offset na
      direcao da bissetriz para nao ficar em cima da aresta. */
  _appendAngleLabel(g, a, b, c, zoom, className = 'design-angle') {
    const angle = UIShape.angleBetween(a, b, c);
    if (!angle) return;

    const d1 = { x: a.x - b.x, y: a.y - b.y };
    const d2 = { x: c.x - b.x, y: c.y - b.y };
    const l1 = Math.hypot(d1.x, d1.y) || 1;
    const l2 = Math.hypot(d2.x, d2.y) || 1;
    const ux = d1.x / l1 + d2.x / l2;
    const uy = d1.y / l1 + d2.y / l2;
    const lu = Math.hypot(ux, uy) || 1;
    const off = (className === 'design-angle' ? 13 : 15) / zoom;

    const label = el('text', {
      x: n(b.x + ux / lu * off),
      y: n(b.y + uy / lu * off) + 4 / zoom,
      'text-anchor': 'middle',
      'font-size': n(11 / zoom)
    }, className);
    label.textContent = Math.round(angle) + '\u00B0';
    g.appendChild(label);
  }

  /* ---- Fim da sessao ---- */

  /**
   * Um clique solto no canvas com a ferramenta Poligono grava o vertice.
   * No duplo clique, os dois cliques do par gravam dois vertices quase
   * no mesmo lugar; o `_onDblClick` limpa o primeiro e fecha a forma.
   */
  _polygonUp(e) {
    this._release(e);

    const point = this._clientToDesign(e);
    const snapped = this._snapPointToGrid(point);
    const session = this.polygon;
    const placed = { x: n(snapped.x), y: n(snapped.y) };

    session.points.push(placed);

    // Clicar no primeiro vertice fecha a forma (colando o ultimo vertice
    // no primeiro), um atalho para quem prefere fechar por precisao.
    if (session.points.length >= 3 && this._nearFirstPoint(placed)) {
      const first = session.points[0];
      session.points[session.points.length - 1] = { x: first.x, y: first.y };
      this._finishPolygon();
      return;
    }

    this._renderOverlay();
  }

  /** Vertice na grade quando o encaixe esta ligado. */
  _snapPointToGrid(point) {
    if (!this.design.snap) return point;
    const step = this.design.gridSize;
    return {
      x: Math.round(point.x / step) * step,
      y: Math.round(point.y / step) * step
    };
  }

  _nearFirstPoint(point) {
    const first = this.polygon.points[0];
    if (!first) return false;
    return Math.hypot(point.x - first.x, point.y - first.y) * this.design.zoom <= POLYGON_CLOSE_PX;
  }

  /** Fecha a forma: entrega os pontos ao controller como um node novo. */
  _finishPolygon() {
    const pts = this.polygon ? this.polygon.points.slice() : [];
    this.polygon = null;
    if (pts.length < 3) return;
    this._renderOverlay();
    if (this.onCreateNode) {
      this.onCreateNode('polygon', { points: pts.map((p) => ({ x: p.x, y: p.y })) });
    }
  }

  /** Chamado pelo controller (Enter). */
  finishPolygon() {
    if (this.polygon && this.polygon.points.length >= 3) this._finishPolygon();
  }

  /** Chamado pelo controller (Esc, troca de ferramenta). */
  cancelPolygon() {
    this.polygon = null;
    this._renderOverlay();
  }

  /** Backspace durante o desenho: remove o ultimo vertice, nao o node. */
  popPolygonPoint() {
    if (!this.polygon) return;
    this.polygon.points.pop();
    this._renderOverlay();
  }

  isDrawingPolygon() {
    return Boolean(this.polygon);
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

    if (this.currentTool === 'polygon') {
      // Nao e arastar: o clique grava o vertice no `pointerup`; aqui so
      // se marca onde o cursor esta, para o segmento fantasma aparecer.
      this.polygon = this.polygon || { points: [], hover: null };
      this.polygon.hover = this._clientToDesign(e);
      this._capture(e);
      e.preventDefault();
      this._renderOverlay();
      return;
    }

    if (this.currentTool !== 'select') {
      const start = this._clientToDesign(e);
      this.gesture = {
        type: 'create',
        tool: this.currentTool,
        start,
        current: start,
        startClient: { x: e.clientX, y: e.clientY },
        currentClient: { x: e.clientX, y: e.clientY },
        shiftKey: e.shiftKey,
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
    // Sessao de poligono (sem gesto de pan ativo): so o cursor muda (o
    // segmento fantasma do ultimo ponto ate aqui). O ponto em si nasce no
    // `pointerup`.
    if (this.polygon && !this.gesture) {
      this.polygon.hover = this._clientToDesign(e);
      this._renderOverlay();
      return;
    }

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
      // Guardado no gesto porque o preview precisa do mesmo estado de Shift
      // que o commit: o `pointerup` pode chegar sem um `pointermove` novo.
      gesture.shiftKey = e.shiftKey;
      this._renderOverlay();
      return;
    }
    if (gesture.type === 'move') this._applyMove(gesture, point, e);
    else if (gesture.type === 'resize') this._applyResize(gesture, point, e);
    else if (gesture.type === 'rotate') this._applyRotate(gesture, point, e);
  }

  _onPointerUp(e) {
    // Um solto durante a sessao de poligono grava o vertice -- mas nao
    // quando o gesto era pan (espaco premido), que solta aqui tambem.
    // O `pointercancel` (toque, por exemplo) so solta a captura: um
    // vertice nao nasce de um gesto interrompido.
    if (this.polygon && !this.gesture) {
      if (e.type === 'pointerup') this._polygonUp(e);
      else {
        this._release(e);
        this._renderOverlay();
      }
      return;
    }

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
    // Poligono armado: o duplo clique fecha a forma. Os dois cliques do par
    // gravaram dois vertices quase colados; o primeiro era o "abraço" do
    // duplo clique, entao sobra o ultimo como vertice de fechamento.
    if (this.polygon) {
      e.preventDefault();
      const pts = this.polygon.points;
      if (pts.length >= 2) {
        const penult = pts[pts.length - 2];
        const last = pts[pts.length - 1];
        if (Math.hypot(last.x - penult.x, last.y - penult.y) * this.design.zoom <= POLYGON_CLOSE_PX * 3) {
          pts.splice(pts.length - 2, 1);
        }
      }
      if (pts.length >= 3) this._finishPolygon();
      return;
    }

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
      let dx = gesture.current.x - gesture.start.x;
      let dy = gesture.current.y - gesture.start.y;
      // `disableSnap` e o Shift. Para as demais ferramentas ele desliga a
      // grade; na linha a grade nunca entrou, e o mesmo botao liga o
      // encaixe angular -- mesma conta do preview, que chama isto.
      if (disableSnap) ({ dx, dy } = UIDesignView.snapAngle45(dx, dy));
      return {
        x: gesture.start.x,
        y: gesture.start.y,
        width: dx,
        height: dy
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