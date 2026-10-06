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
   HTML ligado em `index.html`:

   <div id="design-container" class="hidden">
     <button id="design-back-btn">Voltar a Lousa</button>
     <div id="design-toolbar"></div>
     <div id="design-body">
       <div id="design-stage"><svg id="design-svg"></svg></div>
       <aside id="design-sidebar">
         <div id="design-layers" class="design-layers"></div>
         <div id="design-properties" class="design-properties"></div>
       </aside>
     </div>
   </div>

   O CSS do modulo esta em `js/views/style.css`, na secao
   "MODO DESIGN", e reaproveita as mesmas variaveis de tema
   da aplicacao.

   Chaves esperadas em `$`:
     designContainer, designBackBtn, whiteboard, toast
   Cada view usa a sua (`designToolbar`, `designSvg`,
   `designLayers`, `designProperties`) e devolve `false`
   de `init()` quando a chave nao existe -- o modo Design
   fica inerte em vez de quebrar a lousa.
   ============================================ */

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
        // Criar e um comando de uma vez so: depois que o node nasce, a
        // ferramenta volta para Selecionar (como no Figma) para ele poder
        // ser arrastado e redimensionado na hora, em vez de exigir uma
        // troca de ferramenta so para isso.
        this.setTool('select');
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
     impede que a outra camada veja a tecla. E o `ToolController`
     tambem pergunta por `isUXDesignActive()` antes de agir,
     para as teclas que aqui nao sao tratadas (`E`, `G`, `+`)
     nao abrirem os modais da lousa por cima do modo Design. */

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
}
