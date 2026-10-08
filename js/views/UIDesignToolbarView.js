/* ============================================
   UI/UX DESIGNER - UIDesignToolbarView
   ============================================
   Barra de ferramentas do modo Design: as ferramentas
   de criacao, os toggles de visualizacao (grade,
   guias, encaixe), o zoom e as acoes de arquivo.

   O botao "Voltar para a lousa" nao e montado aqui:
   ele pertence ao container do modo Design e e ligado
   pelo controller, que e quem sabe trocar de modo.
   ============================================ */

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  select: '<path fill="currentColor" d="M7 2l10 10-4.5 1 2.8 6.5-2.5 1.1-2.8-6.5L7 17V2z"/>',
  frame: '<path fill="none" stroke="currentColor" stroke-width="2" d="M7 3v18M17 3v18M3 7h18M3 17h18"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="2" fill="currentColor"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8" ry="6" fill="currentColor"/>',
  line: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5 19L19 5"/>',
  polygon: '<path fill="currentColor" d="M12 4l6.6 4.8-2.5 7.7H7.9l-2.5-7.7z"/>',
  text: '<path fill="currentColor" d="M5 4v3h5.5v12h3V7H19V4H5z"/>',
  // Montura com o horizonte e o sol: e o que distingue "imagem" de
  // "retangulo", que ja tem icone proprio e e a mesma coisa sem o miolo.
  image: '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8.5" cy="10" r="1.5" fill="currentColor"/><path fill="currentColor" d="M4.5 18l5-5.5 4 4 2.5-2.5 3.5 4z"/>',
  grid: '<path fill="none" stroke="currentColor" stroke-width="1.6" d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  guides: '<path fill="none" stroke="currentColor" stroke-width="1.6" d="M12 3v18"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/>',
  snap: '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M5 4v8a7 7 0 0014 0V4M12 12v8"/>',
  minus: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5 12h14"/>',
  plus: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 5v14M5 12h14"/>',
  save: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M5 3h11l3 3v15H5V3zm3 0v6h7V3M8 21v-7h8v7"/>',
  open: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M4 6h6l2 3h8v11H4V6z"/>',
  download: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 4v10m0 0l-4-4m4 4l4-4M4 19h16"/>',
  caret: '<path fill="currentColor" d="M7 10l5 5 5-5z"/>'
};

// Cor de partida do seletor quando a pessoa desmarca "Cor do tema" sem
// nunca ter escolhido nada: um cinza claro que nao se confunde com o
// fundo escuro nem com o claro do canvas, e que ja da para a pessoa
// trocar em seguida arrastando o cursor.
const GRID_STAND_IN_COLOR = '#c9c9d4';

export class UIDesignToolbarView {
  constructor(design, $) {
    this.design = design;
    this.$ = $;

    this.currentTool = 'select';

    // id do botao -> ferramenta. O prefixo `dtool` evita colisao com a
    // toolbar da lousa (`tool-*`), que fica viva ao lado no mesmo DOM.
    this.tools = {
      'dtool-select': 'select',
      'dtool-frame': 'frame',
      'dtool-rect': 'rect',
      'dtool-ellipse': 'ellipse',
      'dtool-line': 'line',
      'dtool-polygon': 'polygon',
      'dtool-text': 'text',
      'dtool-image': 'image'
    };

    this.onToolSelected = null;   // (tool, btn) => void
    this.onToggleGrid = null;     // (ativo) => void
    this.onToggleGuides = null;   // (ativo) => void
    this.onToggleSnap = null;     // (ativo) => void
    this.onZoomChange = null;     // (delta) => void
    this.onSave = null;
    this.onLoad = null;
    this.onExportSVG = null;
    this.onWorkspaceChange = null; // (workspace) => void
    this.onGridSettingsChange = null; // () => void -- cor/tamanho mudou
    this.workspace = 'canvas';

    // Popover de configuracao da grade. Montado na primeira abertura, e nao
    // no `init()`: enquanto ninguem clicar no caret ele nem existe no DOM.
    // As referencias ficam aqui para o `closeGridSettings()` poder ser
    // chamado de fora (trocar de aba, sair do modo Design).
    this.gridPopover = null;
    this.gridSettingsBtn = null;
    // Ligados/desligados junto com o popover; guardados como propriedades
    // para o `removeEventListener` receber a mesma funcao.
    this._gridOutside = (event) => this._handleGridOutside(event);
    this._gridKey = (event) => this._handleGridKey(event);
  }

  init() {
    const bar = this.$.designToolbar;
    if (!bar) return false;

    bar.textContent = '';
    bar.classList.add('design-toolbar');

    // A aba vem primeiro e fora de qualquer grupo de ferramenta: e o que
    // troca o que a barra inteira significa, nao uma ferramenta entre
    // outras. Fica na esquerda, como as abas Canvas/Code do Figma.
    const abas = document.createElement('div');
    abas.className = 'design-tabs';
    abas.setAttribute('role', 'tablist');
    abas.appendChild(this._tabButton('dtab-canvas', 'canvas', 'Canvas'));
    abas.appendChild(this._tabButton('dtab-code', 'code', 'Codigo'));
    bar.appendChild(abas);

    bar.appendChild(this._separator());

    // Tudo que so faz sentido com o canvas visivel fica num agrupador
    // proprio: na aba Codigo ele some, em vez de aceitar clique em uma
    // ferramenta que nao tem onde desenhar.
    this.canvasOnly = document.createElement('div');
    this.canvasOnly.className = 'design-toolbar-canvas-only';
    bar.appendChild(this.canvasOnly);

    const canvas = this.canvasOnly;
    canvas.appendChild(this._group([
      this._toolButton('dtool-select', 'select', 'Selecionar (V)'),
      this._toolButton('dtool-frame', 'frame', 'Frame (F)'),
      this._toolButton('dtool-rect', 'rect', 'Retangulo (R)'),
      this._toolButton('dtool-ellipse', 'ellipse', 'Elipse (O)'),
      this._toolButton('dtool-line', 'line', 'Linha (L)'),
      this._toolButton('dtool-polygon', 'polygon', 'Poligono (P)'),
      this._toolButton('dtool-text', 'text', 'Texto (T)'),
      this._toolButton('dtool-image', 'image', 'Imagem (I)')
    ]));

    canvas.appendChild(this._separator());

    // O caret abre a configuracao da grade (tamanho e cor). Ele e irmao do
    // toggle, nao parte dele: ligar a grade nao pode abrir popover, e abrir
    // o popover nao pode ligar a grade.
    const gridBtn = this._toggleButton('dtool-grid', 'grid', 'Grade');
    const gridCfgBtn = this._button('dtool-grid-settings', 'caret', 'Configurar grade: tamanho e cor', () => this.toggleGridSettings());
    gridCfgBtn.classList.add('design-grid-caret');
    gridCfgBtn.setAttribute('aria-haspopup', 'true');
    gridCfgBtn.setAttribute('aria-expanded', 'false');
    this.gridSettingsBtn = gridCfgBtn;

    canvas.appendChild(this._group([
      gridBtn,
      gridCfgBtn,
      this._toggleButton('dtool-guides', 'guides', 'Guias'),
      this._toggleButton('dtool-snap', 'snap', 'Encaixe')
    ]));

    canvas.appendChild(this._separator());

    this.zoomLabel = this._element('span', 'design-zoom-label');
    canvas.appendChild(this._group([
      this._button('dtool-zoom-out', 'minus', 'Reduzir zoom', () => this.onZoomChange && this.onZoomChange(-0.1)),
      this.zoomLabel,
      this._button('dtool-zoom-in', 'plus', 'Aumentar zoom', () => this.onZoomChange && this.onZoomChange(0.1))
    ]));

    canvas.appendChild(this._separator());

    bar.appendChild(this._group([
      this._button('dtool-save', 'save', 'Salvar .uidesign.json', () => this.onSave && this.onSave(), 'Salvar'),
      this._button('dtool-load', 'open', 'Abrir .uidesign.json', () => this.onLoad && this.onLoad(), 'Abrir'),
      this._button('dtool-export-svg', 'download', 'Exportar SVG', () => this.onExportSVG && this.onExportSVG(), 'SVG')
    ]));

    this.setTool(this.currentTool);
    this.syncToggles();
    this.setZoom(this.design.zoom);
    // No fim: `setWorkspace` marca as abas, e as abas so existem depois
    // que foram anexadas.
    this.setWorkspace(this.workspace);
    return true;
  }

  /* ---- Construcao ---- */

  _group(children) {
    const group = this._element('div', 'design-toolbar-group');
    children.forEach((child) => group.appendChild(child));
    return group;
  }

  _separator() {
    return this._element('div', 'design-toolbar-sep');
  }

  _element(tag, className) {
    const node = document.createElement(tag);
    node.className = className;
    return node;
  }

  _icon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.innerHTML = ICONS[name] || '';
    return svg;
  }

  _button(id, icon, title, onClick, label) {
    const btn = this._element('button', 'design-btn');
    btn.id = id;
    btn.type = 'button';
    btn.title = title;
    btn.appendChild(this._icon(icon));
    if (label) {
      const text = this._element('span', 'design-btn-label');
      text.textContent = label;
      btn.appendChild(text);
    }
    btn.addEventListener('click', onClick);
    return btn;
  }

  _toolButton(id, tool, title) {
    // A chave do icone e o proprio nome da ferramenta.
    const btn = this._button(id, tool, title, () => {
      if (this.onToolSelected) this.onToolSelected(tool, btn);
    });
    btn.dataset.tool = tool;
    return btn;
  }

  _tabButton(id, workspace, title) {
    const btn = this._element('button', 'design-tab');
    btn.id = id;
    btn.type = 'button';
    btn.title = title;
    btn.dataset.workspace = workspace;
    btn.setAttribute('role', 'tab');
    btn.textContent = title;
    btn.addEventListener('click', () => this.setWorkspace(workspace, btn));
    return btn;
  }

  /**
   * Troca entre o canvas e a aba de codigo. O agrupador das ferramentas
   * e escondido por CSS na aba Codigo -- e o que impede que a pessoa
   * clique em Retangulo e nao aconteca nada.
   */
  setWorkspace(workspace, btn) {
    const next = workspace === 'code' ? 'code' : 'canvas';
    const mudou = next !== this.workspace;
    this.workspace = next;
    // Na aba Codigo o caret some (e filho do agrupador de canvas), entao o
    // popover aberto ficaria flutuando sem botao nenhum para fecha-lo.
    if (mudou) this.closeGridSettings();
    const bar = this.$.designToolbar;
    if (bar) {
      bar.classList.toggle('is-code', next === 'code');
      bar.querySelectorAll('.design-tab').forEach((tab) => {
        const on = tab.dataset.workspace === next;
        tab.classList.toggle('is-active', on);
        tab.setAttribute('aria-selected', String(on));
      });
    }
    // So avisa quando mudou de verdade: o `init()` passa por aqui para
    // marcar a aba inicial, e nao e uma troca de workspace.
    if (mudou && this.onWorkspaceChange) this.onWorkspaceChange(next);
  }

  _toggleButton(id, icon, label) {
    const btn = this._element('button', 'design-btn design-toggle');
    btn.id = id;
    btn.type = 'button';
    btn.appendChild(this._icon(icon));
    const text = this._element('span', 'design-btn-label');
    text.textContent = label;
    btn.appendChild(text);
    btn.addEventListener('click', () => {
      // Os tres flags sao preference de visualizacao, nao geometria: o
      // toggle mexe no modelo e o controller so repinta o que mudou.
      const key = icon === 'grid' ? 'showGrid' : icon === 'guides' ? 'showGuides' : 'snap';
      this.design[key] = !this.design[key];
      this.syncToggles();
      const callback = icon === 'grid'
        ? this.onToggleGrid
        : icon === 'guides' ? this.onToggleGuides : this.onToggleSnap;
      if (callback) callback(this.design[key]);
    });
    return btn;
  }

  /* ---- Estado ---- */

  setTool(tool, btn) {
    this.currentTool = tool;
    const active = btn || document.getElementById('dtool-' + tool);
    const bar = this.$.designToolbar;
    if (!bar) return;
    bar.querySelectorAll('.design-btn[data-tool]').forEach((item) => {
      item.classList.toggle('is-active', item === active);
    });
  }

  /** Reflete o estado do modelo nos toggles (usado ao carregar arquivo). */
  syncToggles() {
    const bar = this.$.designToolbar;
    if (!bar) return;
    this._setToggle('dtool-grid', this.design.showGrid);
    this._setToggle('dtool-guides', this.design.showGuides);
    this._setToggle('dtool-snap', this.design.snap);
  }

  _setToggle(id, active) {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('is-active', active === true);
  }

  setZoom(zoom) {
    if (this.zoomLabel) this.zoomLabel.textContent = Math.round(zoom * 100) + '%';
  }

  /* ---- Configuracao da grade ---- */

  /**
   * Abre/fecha o popover de tamanho e cor da grade.
   *
   * O popover mora no `<body>`, nao na barra: a barra tem `overflow-x: auto`
   * e um filho dela seria recortado em vez de flutuar por cima do canvas.
   */
  toggleGridSettings() {
    if (this._gridOpen()) this.closeGridSettings();
    else this.openGridSettings();
  }

  _gridOpen() {
    return !!this.gridPopover && !this.gridPopover.hidden;
  }

  openGridSettings() {
    const pop = this._gridPopover();
    this._syncGridFields();
    pop.hidden = false;
    this._placeGridPopover(pop);

    if (this.gridSettingsBtn) this.gridSettingsBtn.setAttribute('aria-expanded', 'true');
    // `pointerdown` na captura: o popover fecha no inicio do clique, e nao no
    // fim, entao ele ja nao esta na frente quando o evento segue para o
    // canvas -- o que estiver embaixo recebe o clique normalmente.
    document.addEventListener('pointerdown', this._gridOutside, true);
    // No `window` e na captura: o controller escuta o Escape no `document` e
    // consome o evento com `stopImmediatePropagation`, entao so um listener
    // mais externo (window captura antes do document) consegue fechar o
    // popover e ainda evitar o deselect.
    window.addEventListener('keydown', this._gridKey, true);
  }

  closeGridSettings() {
    if (this.gridPopover) this.gridPopover.hidden = true;
    if (this.gridSettingsBtn) this.gridSettingsBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', this._gridOutside, true);
    window.removeEventListener('keydown', this._gridKey, true);
  }

  _handleGridOutside(e) {
    if (!this._gridOpen()) return;
    if (this.gridPopover.contains(e.target)) return;
    // O clique no proprio caret e resolvido pelo `click` dele (toggle);
    // fechar aqui tambem faria o popover piscar.
    if (e.target && e.target.closest && e.target.closest('#dtool-grid-settings')) return;
    this.closeGridSettings();
  }

  _handleGridKey(e) {
    if (e.key !== 'Escape') return;
    // Consome o Escape: com o popover aberto ele fecha o popover, em vez de
    // desfazer a selecao do Design que esta atras dele.
    e.preventDefault();
    e.stopImmediatePropagation();
    this.closeGridSettings();
  }

  _placeGridPopover(pop) {
    const btn = this.gridSettingsBtn;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - width - 8));
    // Abaixo por padrao; vira para cima quando nao ha folga ate o rodape.
    const below = r.bottom + 6;
    const top = below + height <= window.innerHeight - 8 ? below : Math.max(8, r.top - height - 6);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  _gridPopover() {
    if (this.gridPopover) return this.gridPopover;

    const pop = this._element('div', 'design-grid-popover');
    pop.hidden = true;

    const title = this._element('div', 'design-grid-popover-title');
    title.textContent = 'Grade';
    pop.appendChild(title);

    const size = this._gridInput('number', 'size');
    size.min = '2';
    size.max = '200';
    size.step = '1';
    // Enquanto digita, repinta ao vivo; ao sair do campo, o `change` devolve
    // o valor ja normalizado pelo modelo (2..200).
    size.addEventListener('input', () => {
      this.design.setGridSize(size.value);
      this._notifyGrid();
    });
    size.addEventListener('change', () => {
      // Ao sair do campo, aplica o que ficou e devolve o valor que o modelo
      // aceitou: digitar 9999 deixa 200 no proprio campo, e nao o valor
      // antigo, que pareceria um clique perdido.
      this.design.setGridSize(size.value);
      size.value = this.design.gridSize;
    });
    pop.appendChild(this._gridField('Tamanho', size));

    const color = this._gridInput('color', 'color');
    color.classList.add('design-color');
    // Valor inicial apenas como apoio: fica escondido enquanto a grade segue
    // o tema, e e o que o checkbox adota se for desmarcado sem uma cor nova.
    color.value = '#c9c9d4';
    color.addEventListener('input', () => {
      this.design.setGridColor(color.value);
      this._notifyGrid();
    });
    const colorRow = this._gridField('Cor', color);
    pop.appendChild(colorRow);

    const auto = this._element('input', 'design-checkbox');
    auto.type = 'checkbox';
    auto.dataset.grid = 'auto';
    auto.addEventListener('change', () => {
      // "Cor do tema" devolve a grade para o `--border-strong`; desmarcar
      // adota a cor que ja estava no seletor, para a grade nunca ficar sem
      // cor nenhuma definida.
      this.design.setGridColor(auto.checked ? '' : color.value);
      this._syncGridFields();
      this._notifyGrid();
    });
    pop.appendChild(this._gridField('Cor do tema', auto));

    document.body.appendChild(pop);
    this.gridPopover = pop;
    return pop;
  }

  _gridField(label, control) {
    const row = this._element('label', 'design-field');
    const text = this._element('span', 'design-field-label');
    text.textContent = label;
    row.appendChild(text);
    row.appendChild(control);
    return row;
  }

  _gridInput(type, key) {
    const input = this._element('input', 'design-input');
    input.type = type;
    input.dataset.grid = key;
    return input;
  }

  /** Devolve aos campos do popover o que esta no modelo. */
  _syncGridFields() {
    if (!this.gridPopover) return;
    const size = this.gridPopover.querySelector('[data-grid="size"]');
    const color = this.gridPopover.querySelector('[data-grid="color"]');
    const auto = this.gridPopover.querySelector('[data-grid="auto"]');
    const custom = /^#[0-9a-f]{6}$/i.test(this.design.gridColor);

    size.value = this.design.gridSize;
    auto.checked = !custom;
    if (custom) color.value = this.design.gridColor;
    // Sem cor propria a grade e `--border-strong`: o seletor de cor inteiro
    // some, para nao sugerir uma cor que nao esta sendo usada.
    color.parentElement.hidden = !custom;
  }

  _notifyGrid() {
    if (this.onGridSettingsChange) this.onGridSettingsChange();
  }
}