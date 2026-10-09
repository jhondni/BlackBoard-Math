import { UIText } from '../models/UIText.js';
import { UIShape } from '../models/UIShape.js';

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
  'name', 'fill', 'stroke', 'strokeWidth',
  'fontSize', 'fontFamily', 'color', 'align', 'lineHeight'
];

const TOOL_KEYS = { v: 'select', f: 'frame', r: 'rect', o: 'ellipse', l: 'line', t: 'text', i: 'image', p: 'polygon' };

export class UIDesignController {
  constructor(design, views, $) {
    this.design = design;
    this.views = views || {};
    this.$ = $ || {};
    this.active = false;
    // Arquivo escolhido e ainda nao colocado no canvas: data URL e medida
    // original. Vive no controller porque escolher o arquivo e uma acao de
    // ferramenta, nao um estado do design (o arquivo so passa a existir no
    // design quando a caixa e arrastada).
    this.pendingImage = null;
  }

  /**
   * @returns {UIDesignController} this, para encadear na montagem.
   */
  init() {
    const { toolbar, designView, layers, properties, code } = this.views;

    if (toolbar) {
      toolbar.onToolSelected = (tool, btn) => this.setTool(tool, btn);
      toolbar.onToggleGrid = () => this.render();
      toolbar.onToggleGuides = () => this.render();
      toolbar.onToggleSnap = () => this.render();
      // Cor e tamanho da grade sao preferencia de visualizacao como os
      // toggles: o popover escreve no modelo e aqui so repintamos o SVG.
      toolbar.onGridSettingsChange = () => this.render();
      toolbar.onZoomChange = (delta) => {
        if (designView) designView.zoomBy(delta);
      };
      toolbar.onSave = () => this.saveDesign();
      toolbar.onLoad = () => this.loadDesign();
      toolbar.onExportSVG = () => this.exportSVG();
      toolbar.onWorkspaceChange = (workspace) => this.setWorkspace(workspace);
    }

    // A aba de codigo nao pede o arquivo ao controller: ela monta o texto
    // com o gerador e so entrega o arquivo pronto (so o frame selecionado,
    // num HTML unico, com o CSS por dentro e o JavaScript, se houver).
    // O download continua sendo do controller, como o do SVG.
    if (code) {
      code.onDownload = (fileName, text) => {
        UIDesignController.download(new Blob([text], { type: 'text/html' }), fileName);
        this._toast('HTML baixado em ' + fileName);
      };
    }

    if (designView) {
      designView.onCreateNode = (tool, props) => {
        // A ferramenta Imagem fica armada esperando o arquivo; se a
        // ferramenta virou outra coisa no meio, nao ha imagem para criar e
        // o arrasto foi de outra coisa. Sem `src` a imagem entraria como
        // caixa tracejada, que e estado invalido, nao um erro a favor do
        // usuario.
        if (tool === 'image') {
          const pending = this.pendingImage;
          this._discardPendingImage();
          if (!pending) {
            this.setTool('select');
            this._toast('Escolha um arquivo de imagem antes de arrastar a caixa', true);
            this.render();
            return;
          }
          props = {
            ...props,
            src: pending.src,
            naturalWidth: pending.naturalWidth,
            naturalHeight: pending.naturalHeight
          };
        }

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
      // `panelIndex` e a posicao na lista (0 = topo = frente da pilha).
      layers.onMoveNode = (id, panelIndex) => {
        if (this.design.moveNodeTo(id, panelIndex)) this.render();
      };
      layers.onDuplicate = (id) => this.duplicateSelected(id);
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
    const { designView, layers, properties, toolbar, code } = this.views;
    if (designView) designView.render();
    if (layers) layers.render();
    if (properties) properties.render();
    if (toolbar) toolbar.setZoom(this.design.zoom);
    // Qualquer mudanca no design deixa o codigo possivelmente velho. A
    // aba so acende o aviso: regenerar por conta comeria o que a pessoa
    // estiver editando no textarea.
    if (code) code.markStale();
  }

  /**
   * Troca entre o canvas e a aba de codigo. O SVG e escondido em vez de
   * desmontado: e o mesmo desenho, e o rodizio de ferramentas continua
   * valendo quando a pessoa volta.
   */
  setWorkspace(workspace) {
    const { designView, code } = this.views;
    const isCode = workspace === 'code';
    if (designView && designView.svg) designView.svg.hidden = isCode;
    if (code) {
      // Gerar na entrada, e nao a cada `render`: quem entrou na aba
      // quer o codigo do estado atual, e nao perder o que editou.
      code.setActive(isCode);
      if (isCode) code.generate();
    }
  }

  setTool(tool, btn) {
    const { toolbar, designView } = this.views;

    // Imagem e a unica ferramenta que nao se arma: ela precisa de um
    // arquivo antes de existir. Escolher a ferramenta abre o seletor; so
    // depois que o arquivo carrega e que o arrasto da caixa vale. E o
    // que a lousa faz com o mesmo botao.
    if (tool === 'image') {
      this.pickImage();
      return;
    }

    this._discardPendingImage();
    if (toolbar) toolbar.setTool(tool, btn);
    if (designView) designView.setTool(tool);
  }

  /* ---- Imagem ---- */

  /**
   * Escolhe um arquivo de imagem e o guarda para a proxima caixa. O
   * arquivo vira data URL: e o que faz o `.uidesign.json` valer sozinho,
   * sem uma pasta de imagens do lado. O input e criado aqui, e nao
   * reaproveitado do `#image-upload` da lousa, porque aquele input tem
   * um dono so e os dois modulos estao na mesma pagina.
   */
  pickImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onerror = () => this._toast('Nao foi possivel ler a imagem', true);
      reader.onload = (e) => this._armImage(String(e.target.result));
      reader.readAsDataURL(file);
    });

    input.click();
  }

  /**
   * O arquivo virou data URL; falta saber o tamanho original, porque o
   * `<image>` do SVG nao tem `naturalWidth` como o `<img>` do HTML. Um
   * `Image` solto, so para ler a medida e jogar fora.
   */
  _armImage(src) {
    const probe = new Image();
    probe.onerror = () => {
      this._toast('O navegador nao conseguiu abrir essa imagem', true);
      this._discardPendingImage();
    };
    probe.onload = () => {
      this.pendingImage = {
        src,
        naturalWidth: probe.naturalWidth || 0,
        naturalHeight: probe.naturalHeight || 0
      };

      const { toolbar, designView } = this.views;
      if (designView) designView.setImageNaturalSize(probe.naturalWidth, probe.naturalHeight);
      if (toolbar) toolbar.setTool('image');
      if (designView) designView.setTool('image');
      this._toast('Arraste a caixa onde a imagem vai entrar');
    };
    probe.src = src;
  }

  _discardPendingImage() {
    this.pendingImage = null;
    const { designView } = this.views;
    if (designView) designView.setImageNaturalSize(0, 0);
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
    } else if (prop === 'fit' && node.type === 'image') {
      node.setFit(value);
    } else if (UIShape.CORNERS.includes(prop) && node.type === 'shape') {
      const index = UIShape.CORNERS.indexOf(prop);
      node.setRadius(prop, value);
      // O painel so ressincroniza os campos que NAO estao em foco, e o
      // canto que o usuario digita e justamente o em foco: sem isto o
      // campo continuaria mostrando o numero pedido, e nao o raio que a
      // figura de fato tem. Remontar o painel nao serve, porque
      // roubaria o foco do campo.
      const field = this.views.properties ? this.views.properties.getField(prop) : null;
      if (field) field.value = Math.round(node.radii[index] * 100) / 100;
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

  /**
   * Duplica a camada `id` -- ou a selecionada, quando vem do Ctrl+D. A
   * copia nasce deslocada e ja selecionada, e o `render()` repinta as
   * quatro views de uma vez (canvas, camadas, propriedades e aviso da
   * aba Codigo), no mesmo formato do `removeSelected`.
   */
  duplicateSelected(id) {
    const target = id || this.design.selectedId;
    const copy = target ? this.design.duplicateNode(target) : null;
    if (copy) this.render();
    return copy;
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
    // O popover da grade vive no `<body>`, fora do container que vai ser
    // escondido: sem fechar aqui ele ficaria flutuando sobre a lousa.
    if (this.views.toolbar && this.views.toolbar.closeGridSettings) {
      this.views.toolbar.closeGridSettings();
    }
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
      impede que a outra camada veja a tecla. Vale tambem para a
      `I`, que os dois modulos usam para Imagem: sem isto, escolher
      uma imagem aqui abriria o seletor duas vezes -- uma por
      modulo. E o `ToolController` tambem pergunta por
      `isUXDesignActive()` antes de agir,
      para as teclas que aqui nao sao tratadas (`E`, `G`, `+`)
      nao abrirem os modais da lousa por cima do modo Design. */

  _bindKeys() {
    document.addEventListener('keydown', (e) => this._onKeyDown(e), true);
    document.addEventListener('keyup', (e) => this._onKeyUp(e), true);
  }

  _onKeyUp(e) {
    if (!this.active) return;
    if (e.key === 'Shift') {
      if (this.views.designView) this.views.designView.setShift(false);
      return;
    }
    if (e.key !== ' ') return;
    if (this.views.designView) this.views.designView.setSpace(false);
  }

  _onKeyDown(e) {
    if (!this.active) return;

    // Shift durante o arrasto de criacao: reencaixa (ou solta) o preview na
    // hora, sem esperar um movimento do mouse. Nao para a propagacao -- a
    // lousa nao usa Shift, e o `pointerup` e quem confirma o valor final.
    if (e.key === 'Shift') {
      if (this.views.designView) this.views.designView.setShift(true);
      return;
    }

    if (e.key === ' ' && !this._isTyping(e)) {
      if (this.views.designView) this.views.designView.setSpace(true);
      e.preventDefault();
      return;
    }

    if (this._isTyping(e)) return;

    const key = e.key.toLowerCase();
    let handled = true;

    if ((key === 'delete' || key === 'backspace')
        && this.views.designView && this.views.designView.isDrawingPolygon()) {
      // Durante o desenho do poligono, apagar remove o ultimo vertice; a
      // mesma tecla, fora da sessao, remove o node selecionado.
      this.views.designView.popPolygonPoint();
    }
    else if (key === 'delete' || key === 'backspace') this.removeSelected();
    // Escape cancela a imagem armada antes de qualquer outra coisa: sem
    // isso o arquivo ficaria esperando o proximo arrasto, em qualquer
    // canto do canvas, muito depois de o usuario ter desistido.
    else if (key === 'escape') {
      if (this.pendingImage) {
        this._discardPendingImage();
        this.setTool('select');
      } else if (this.views.designView && this.views.designView.isDrawingPolygon()) {
        // Poligono a meio: Esc descarta a sessao e volta para Selecionar.
        this.views.designView.cancelPolygon();
        this.setTool('select');
      } else {
        this.design.deselectAll();
      }
      this.render();
    }
    // Enter fecha a forma em construção, sem depender do duplo clique.
    else if (key === 'enter' && this.views.designView && this.views.designView.isDrawingPolygon()) {
      this.views.designView.finishPolygon();
      handled = true;
    }
    // Ctrl+D duplica a camada selecionada. O `preventDefault` nao e
    // opcional: no navegador Ctrl+D e "favoritar pagina", e sem segurar o
    // evento a barra salva em cima do modo Design. Com o `stopImmediatePropagation`
    // o Ctrl+D tambem nao chega no ToolController da lousa.
    else if (key === 'd' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.duplicateSelected();
    }
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
