import { UIText } from '../models/UIText.js';

/* ============================================
   UI/UX DESIGNER - UIDesignController
   ============================================
   Orquestra o modo Design: liga as views entre si,
   concentra o desenho num unico `render()`, trata o
   teclado, e cuida de salvar/carregar/exportar.

   O estado e um `UIDesign` so. A `Board` da lousa nao
   entra aqui: o modo Design e um documento separado,
   com arquivo separado (`.uidesign.json`), e a lousa
   continua intacta enquanto ele esta aberto.

   ------------------------------------------------------------------------
   HTML esperado (a ser ligado em `index.html` na Fase 2):

   <div id="design-container" class="hidden">
     <button id="design-back-btn">Voltar a lousa</button>
     <div id="design-toolbar"></div>
     <div id="design-body">
       <div id="design-stage"><svg id="design-svg"></svg></div>
       <aside id="design-sidebar">
         <div id="design-layers"></div>
         <div id="design-properties"></div>
       </aside>
     </div>
   </div>

   O CSS do modulo entra por `injectStyles()` em vez de
   `style.css` porque a Fase 1 nao toca no arquivo de
   estilos da aplicacao; e um `<style>` proprio, com as
   mesmas variaveis de tema, para migrar tal e qual.

   Chaves esperadas em `$`:
     designContainer, designBackBtn, whiteboard, toast
   Cada view usa a sua (`designToolbar`, `designSvg`,
   `designLayers`, `designProperties`) e devolve `false`
   de `init()` quando a chave nao existe -- o modo Design
   fica inerte em vez de quebrar a lousa.
   ============================================ */

const STYLE_ID = 'ui-design-styles';

/** Props que o painel atribui direto no no, sem passar por metodo. */
const DIRECT_PROPS = [
  'name', 'fill', 'stroke', 'strokeWidth', 'radius',
  'fontSize', 'fontFamily', 'color', 'align', 'lineHeight'
];

const TOOL_KEYS = { v: 'select', f: 'frame', r: 'rect', o: 'ellipse', l: 'line', t: 'text' };

export class UIDesignController {
  constructor(design, views, $) {
    this.design = design;
    this.views = views || {};
    this.$ = $ || {};
    this.active = false;
  }

  /**
   * @returns {UIDesignController} this, para encadear na montagem.
   */
  init() {
    UIDesignController.injectStyles();

    const { toolbar, designView, layers, properties } = this.views;

    if (toolbar) {
      toolbar.onToolSelected = (tool, btn) => this.setTool(tool, btn);
      toolbar.onToggleGrid = () => this.render();
      toolbar.onToggleGuides = () => this.render();
      toolbar.onToggleSnap = () => this.render();
      toolbar.onZoomChange = (delta) => {
        if (designView) designView.zoomBy(delta);
      };
      toolbar.onSave = () => this.saveDesign();
      toolbar.onLoad = () => this.loadDesign();
      toolbar.onExportSVG = () => this.exportSVG();
    }

    if (designView) {
      designView.onCreateNode = (tool, props) => {
        const node = this.design.createNode(tool, props);
        this.design.selectNode(node);
        this.render();
      };
      designView.onSelect = () => this.render();
      designView.onCommit = () => this.render();
      designView.onRequestEditText = (node) => this.requestEditText(node);
      designView.onViewportChange = () => {
        if (toolbar) toolbar.setZoom(this.design.zoom);
      };
    }

    if (layers) {
      layers.onSelectNode = (id) => {
        this.design.selectById(id);
        this.render();
      };
      layers.onToggleVisible = (id) => {
        this.design.toggleNodeVisibility(id);
        this.render();
      };
      layers.onToggleLock = (id) => {
        this.design.toggleNodeLock(id);
        this.render();
      };
      layers.onRename = (id, name) => {
        this.design.renameNode(id, name);
        this.render();
      };
      layers.onRequestEditText = (node) => this.requestEditText(node);
    }

    if (properties) {
      properties.onChange = (prop, value) => this.changeProperty(prop, value);
      properties.onCommit = () => this.render();
      properties.onDelete = () => this.removeSelected();
    }

    const back = this.$.designBackBtn;
    if (back) back.addEventListener('click', () => this.exitDesignMode());

    this._bindKeys();
    this.render();
    return this;
  }

  /* ---- Desenho ----
     Um unico ponto de repintar: as tres views leem o mesmo
     modelo, e repintar uma sem as outras era exatamente o
     bug de antes (clicar na camada selecionava no modelo e
     nao desenhava). */

  render() {
    const { designView, layers, properties, toolbar } = this.views;
    if (designView) designView.render();
    if (layers) layers.render();
    if (properties) properties.render();
    if (toolbar) toolbar.setZoom(this.design.zoom);
  }

  setTool(tool, btn) {
    const { toolbar, designView } = this.views;
    if (toolbar) toolbar.setTool(tool, btn);
    if (designView) designView.setTool(tool);
  }

  /* ---- Propriedades ---- */

  changeProperty(prop, value) {
    const node = this.design.selected;
    if (!node || node.locked) return;

    if (prop === 'x' || prop === 'y') {
      node.setPosition(prop === 'x' ? value : node.x, prop === 'y' ? value : node.y);
    } else if (prop === 'width' || prop === 'height') {
      // Altura manual desliga o ajuste automatico do texto: as duas metas
      // se brigam, e a escolha explicita do usuario manda.
      if (prop === 'height' && node.type === 'text' && node.autoHeight) node.autoHeight = false;
      node.setSize(prop === 'width' ? value : node.width, prop === 'height' ? value : node.height);
    } else if (prop === 'rotation') {
      node.setRotation(value);
    } else if (prop === 'text' && node.type === 'text') {
      node.setText(value);
    } else if (prop === 'shapeType' && node.type === 'shape') {
      node.setShapeType(value);
    } else if (prop === 'strokeEnabled' && node.type === 'shape') {
      node.stroke = value ? this._colorOf('stroke', '#1a1a1a') : 'none';
    } else if (prop === 'fillEnabled' && node.type === 'shape') {
      node.fill = value ? this._colorOf('fill', '#6C5CE7') : 'none';
    } else if (prop === 'fontWeight' && node.type === 'text') {
      node.fontWeight = UIText.normalizeWeight(value);
    } else if (prop === 'name') {
      // Nome vazio deixaria a linha da camada sem rotulo; o painel mantem o
      // valor antigo e o campo volta ao conteudo do modelo no proximo render.
      const name = String(value).trim();
      if (!name) {
        this.views.properties.render(true);
        return;
      }
      node.name = name;
    } else if (DIRECT_PROPS.includes(prop)) {
      node[prop] = value;
    } else {
      return;
    }

    this.render();

    // A troca de forma muda o conjunto de campos (cantos, preenchimento),
    // entao o painel precisa ser remontado. As outras mudancas nao: o
    // campo ja mostra o que o usuario digitou, e remontar roubaria o foco.
    if (prop === 'shapeType' && this.views.properties) this.views.properties.render(true);
  }

  _colorOf(prop, fallback) {
    const field = this.views.properties ? this.views.properties.getField(prop) : null;
    const value = field ? field.value : '';
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  }

  /** Duplo clique no texto: seleciona e joga o foco no campo de conteudo. */
  requestEditText(node) {
    if (!node || node.type !== 'text' || node.locked) return;
    this.design.selectNode(node);
    this.render();
    if (this.views.properties && !this.views.properties.focusText()) {
      this._toast('Duplo clique no texto abre o campo de conteudo no painel');
    }
  }

  removeSelected() {
    const removed = this.design.removeSelected();
    if (removed) this.render();
    return removed;
  }

  /* ---- Modo ---- */

  enterDesignMode() {
    this.active = true;
    if (this.$.whiteboard) this.$.whiteboard.classList.add('hidden');
    if (this.$.designContainer) this.$.designContainer.classList.remove('hidden');
    if (document.body) document.body.classList.add('design-mode');
    this.render();
    if (this.views.designView) this.views.designView.focus();
  }

  exitDesignMode() {
    this.active = false;
    if (this.$.designContainer) this.$.designContainer.classList.add('hidden');
    if (this.$.whiteboard) this.$.whiteboard.classList.remove('hidden');
    if (document.body) document.body.classList.remove('design-mode');
    if (this.views.designView) this.views.designView.setSpace(false);
  }

  toggleDesignMode() {
    if (this.active) this.exitDesignMode();
    else this.enterDesignMode();
  }

  /* ---- Teclado ----
     O `ToolController` da lousa tambem escuta `keydown` no
     `document`, e os dois hears receberiam a mesma tecla:
     `D` viraria caneta enquanto se cria um frame. Por isso o
     listener daqui e de captura e chama
     `stopImmediatePropagation`: ele roda antes do da lousa e
     impede que a outra camada veja a tecla. Quando a Fase 2
     ligar os modos, o certo e o `ToolController` saber que o
     modo Design esta aberto; o `stopImmediatePropagation` e a
     ponte ate la. */

  _bindKeys() {
    document.addEventListener('keydown', (e) => this._onKeyDown(e), true);
    document.addEventListener('keyup', (e) => this._onKeyUp(e), true);
  }

  _onKeyUp(e) {
    if (!this.active || e.key !== ' ') return;
    if (this.views.designView) this.views.designView.setSpace(false);
  }

  _onKeyDown(e) {
    if (!this.active) return;

    if (e.key === ' ' && !this._isTyping(e)) {
      if (this.views.designView) this.views.designView.setSpace(true);
      e.preventDefault();
      return;
    }

    if (this._isTyping(e)) return;

    const key = e.key.toLowerCase();
    let handled = true;

    if (key === 'delete' || key === 'backspace') this.removeSelected();
    else if (key === 'escape') { this.design.deselectAll(); this.render(); }
    else if (key.indexOf('arrow') === 0) this._nudge(key, e);
    else if (TOOL_KEYS[key] && !e.ctrlKey && !e.metaKey) this.setTool(TOOL_KEYS[key]);
    else handled = false;

    if (handled) e.stopImmediatePropagation();
  }

  _nudge(key, e) {
    const node = this.design.selected;
    if (!node || node.locked) return;
    const step = e.shiftKey ? 10 : 1;
    const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
    const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
    node.move(dx, dy);
    this.render();
  }

  _isTyping(e) {
    const target = e.target;
    return Boolean(target) && (target.tagName === 'INPUT'
      || target.tagName === 'TEXTAREA'
      || target.tagName === 'SELECT'
      || target.isContentEditable);
  }

  /* ---- Arquivo ---- */

  saveDesign() {
    const blob = new Blob([JSON.stringify(this.design.toJSON(), null, 2)], { type: 'application/json' });
    UIDesignController.download(blob, 'design.uidesign.json');
    this._toast('Design salvo em design.uidesign.json');
  }

  loadDesign() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.uidesign.json,.json,application/json';

    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onerror = () => this._toast('Nao foi possivel ler o arquivo', true);
      reader.onload = (e) => this._openDesign(String(e.target.result), file.name);
      reader.readAsText(file);
    });

    input.click();
  }

  _openDesign(text, fileName) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      this._toast('Arquivo invalido: JSON malformado', true);
      return;
    }

    const result = this.design.fromJSON(data);
    if (!result.ok) {
      this._toast(result.error, true);
      return;
    }

    this.setTool('select');
    if (this.views.toolbar) this.views.toolbar.syncToggles();
    this.render();

    const total = this.design.nodes.length;
    const ignored = result.skipped ? ' (' + result.skipped + ' ignorado(s))' : '';
    this._toast('Design carregado: ' + fileName + ' - ' + total + ' elemento(s)' + ignored);
  }

  exportSVG() {
    const svg = this.views.designView ? this.views.designView.getSVG() : '';
    if (!svg) {
      this._toast('Nada para exportar', true);
      return;
    }
    UIDesignController.download(new Blob([svg], { type: 'image/svg+xml' }), 'design.svg');
    this._toast('SVG exportado');
  }

  static download(blob, fileName) {
    const link = document.createElement('a');
    link.download = fileName;
    link.href = URL.createObjectURL(blob);
    link.click();
    // Revogar na hora cancelaria o download em alguns navegadores.
    setTimeout(() => URL.revokeObjectURL(link.href), 60000);
  }

  /** Mesmo contrato do toast da lousa (`#toast` + `.hidden` + `.show`). */
  _toast(message, isError = false) {
    const toast = this.$.toast;
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.add('show');
    if (isError) toast.style.color = 'var(--danger)';
    else toast.style.removeProperty('color');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  /* ---- CSS do modulo ----
     Injeta uma vez. Usa as mesmas variaveis de tema da
     aplicacao, entao o modo escuro vem de graca; quando a
     Fase 2 abrir o `style.css`, este bloco e copiado la e a
     injecao some. */

  static injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = UIDesignController.styles();
    document.head.appendChild(style);
  }

  static styles() {
    return `
/* ---- container do modo Design ---- */
#design-container {
  position: absolute; inset: 0; z-index: 5;
  display: flex; flex-direction: column;
  background: var(--bg-base); overflow: hidden;
}
#design-container.hidden { display: none; }
#whiteboard.hidden { display: none; }
body.design-mode #workspace { padding: 0; overflow: hidden; }
body.design-mode #toolbar,
body.design-mode #controls-bar,
body.design-mode #pages-sidebar,
body.design-mode #sidebar-tab { display: none; }

#design-back-btn {
  position: absolute; top: 16px; left: 16px; z-index: 20;
  display: inline-flex; align-items: center; gap: 8px;
  height: 34px; padding: 0 14px;
  border: 1px solid var(--border); border-radius: var(--radius-pill);
  background: var(--bg-toolbar);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  color: var(--text-primary); font-family: var(--font-sans);
  font-size: 13px; font-weight: 600; cursor: pointer;
  box-shadow: var(--shadow-md);
  transition: color var(--transition), border-color var(--transition);
}
#design-back-btn:hover { color: var(--accent); border-color: var(--accent); }

#design-body { flex: 1; display: flex; min-height: 0; }
#design-stage { position: relative; flex: 1; min-width: 0; overflow: hidden; }

/* ---- canvas ---- */
#design-svg {
  display: block; width: 100%; height: 100%;
  touch-action: none; user-select: none; outline: none;
}
/* A grade e um <rect> dentro do <g> transformado, entao existe mesmo com o
   desenho desligado: e a regra abaixo que a esconde. */
#design-svg:not(.show-grid) .design-grid { display: none; }
#design-svg[data-tool="frame"],
#design-svg[data-tool="rect"],
#design-svg[data-tool="ellipse"],
#design-svg[data-tool="line"],
#design-svg[data-tool="text"] { cursor: crosshair; }
#design-svg[data-tool="select"] { cursor: default; }
#design-svg.is-panning { cursor: grab; }

.design-grid { pointer-events: none; }
.design-grid-line { stroke: var(--border-strong); }
.design-guide {
  stroke: #f59e0b; stroke-width: 1; stroke-dasharray: 4 3;
  vector-effect: non-scaling-stroke; pointer-events: none;
}
.design-hit { fill: transparent; }
.design-node { cursor: move; }
.design-node.is-locked { pointer-events: none; }
.design-frame {
  stroke: var(--border-strong); stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.design-frame-label {
  fill: var(--text-muted); font-family: var(--font-sans); font-size: 11px;
  pointer-events: none;
}
.design-text { font-family: var(--font-sans); white-space: pre; }

/* ---- contorno de selecao ---- */
.design-outline {
  fill: none; stroke: var(--accent); stroke-width: 1;
  vector-effect: non-scaling-stroke; pointer-events: none;
}
.design-handle {
  fill: var(--bg-surface); stroke: var(--accent); stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.design-handle-rotate { fill: var(--accent); cursor: grab; }
.design-rotate-stem {
  stroke: var(--accent); stroke-width: 1; pointer-events: none;
  vector-effect: non-scaling-stroke;
}
.design-preview-shape {
  fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1;
  stroke-dasharray: 4 3; vector-effect: non-scaling-stroke;
}
.design-measure {
  fill: var(--accent); font-family: var(--font-mono); font-size: 11px;
  pointer-events: none;
}
.design-snap-line {
  /* Magenta: e a cor que nao existe no tema, para nao se confundir com
     guia (ambar) nem com selecao (acento). */
  stroke: #e84393; stroke-width: 1; pointer-events: none;
  vector-effect: non-scaling-stroke;
}

.design-handle.dir-nw, .design-handle.dir-se { cursor: nwse-resize; }
.design-handle.dir-ne, .design-handle.dir-sw { cursor: nesw-resize; }
.design-handle.dir-n, .design-handle.dir-s { cursor: ns-resize; }
.design-handle.dir-e, .design-handle.dir-w { cursor: ew-resize; }

/* ---- toolbar ---- */
#design-toolbar {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 16px; border-bottom: 1px solid var(--border);
  background: var(--bg-toolbar);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  overflow-x: auto;
}
.design-toolbar-group { display: flex; align-items: center; gap: 4px; }
.design-toolbar-sep { width: 1px; height: 24px; background: var(--border); }
.design-btn {
  display: inline-flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 8px;
  border: 1px solid transparent; border-radius: var(--radius-sm);
  background: transparent; color: var(--text-secondary);
  font-family: var(--font-sans); font-size: 12px; font-weight: 600;
  cursor: pointer; white-space: nowrap;
  transition: background var(--transition), color var(--transition),
              border-color var(--transition);
}
.design-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.design-btn.is-active {
  background: var(--accent-soft); color: var(--accent); border-color: var(--accent);
}
.design-zoom-label {
  min-width: 48px; text-align: center;
  font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary);
}
.design-danger {
  width: 100%; justify-content: center; margin-top: 4px;
  color: var(--danger); border-color: var(--danger-soft);
}

/* ---- painel lateral ---- */
#design-sidebar {
  display: flex; flex-direction: column; min-height: 0;
  width: 280px; border-left: 1px solid var(--border);
  background: var(--bg-sidebar);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}
.design-layers {
  flex: 1 1 45%; display: flex; flex-direction: column; min-height: 0;
  border-bottom: 1px solid var(--border);
}
.design-properties {
  flex: 1 1 55%; display: flex; flex-direction: column; min-height: 0;
}
.design-panel-header {
  padding: 14px 16px 10px; font-size: 11px; font-weight: 700;
  letter-spacing: 0.8px; text-transform: uppercase; color: var(--text-muted);
}
.design-layers-list {
  flex: 1; overflow-y: auto; padding: 0 8px 12px;
  display: flex; flex-direction: column; gap: 2px;
}
.design-layer {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 8px; border-radius: var(--radius-xs);
  border: 1px solid transparent; cursor: pointer;
  font-size: 12px; color: var(--text-primary);
}
.design-layer:hover { background: var(--bg-hover); }
.design-layer.is-selected { background: var(--accent-soft); border-color: var(--accent); }
.design-layer.is-hidden { opacity: 0.45; }
.design-layer-icon { display: inline-flex; color: var(--text-muted); }
.design-layer-name {
  flex: 1; min-width: 0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.design-layer-action {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; padding: 0;
  border: none; border-radius: 6px; background: none;
  color: var(--text-muted); cursor: pointer;
}
.design-layer-action:hover { background: var(--bg-hover); color: var(--accent); }
.design-layer-rename {
  flex: 1; min-width: 0; height: 22px; padding: 0 6px;
  border: 1px solid var(--accent); border-radius: 6px;
  background: var(--bg-input); color: var(--text-primary);
  font-family: var(--font-sans); font-size: 12px; outline: none;
}
.design-empty {
  padding: 12px; color: var(--text-muted); font-size: 12px; line-height: 1.5;
}

/* ---- propriedades ---- */
.design-properties-body {
  flex: 1; overflow-y: auto; padding: 0 14px 16px;
  display: flex; flex-direction: column; gap: 14px;
}
.design-prop-group { display: flex; flex-direction: column; gap: 6px; }
.design-prop-group-title {
  font-size: 11px; font-weight: 700; letter-spacing: 0.6px;
  text-transform: uppercase; color: var(--text-muted);
}
.design-field {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; font-size: 12px; color: var(--text-secondary);
}
.design-field-label { flex: 0 0 42%; }
.design-input {
  flex: 1; min-width: 0; height: 28px; padding: 0 8px;
  border: 1px solid var(--border); border-radius: var(--radius-xs);
  background: var(--bg-input); color: var(--text-primary);
  font-family: var(--font-sans); font-size: 12px; outline: none;
  transition: border-color var(--transition), box-shadow var(--transition);
}
.design-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.design-textarea { height: auto; padding: 6px 8px; resize: vertical; line-height: 1.4; }
.design-color { padding: 2px; cursor: pointer; }
.design-checkbox { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
`;
  }
}