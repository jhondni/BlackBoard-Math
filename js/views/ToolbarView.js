/* ============================================
   LOUSA VIRTUAL - ToolbarView
   ============================================
   View que gerencia a barra de ferramentas flutuante
   e a barra de controles laterais (zoom, tema,
   orientacao, biblioteca, exportar, ajuda).
   ============================================ */

export class ToolbarView {
  constructor(board, $) {
    this.board = board;
    this.$ = $;

    this.currentTool = 'select';

    // Tabela de ferramentas: id-botao -> nome da ferramenta
    this.tools = {
      'tool-select': 'select',
      'tool-draw': 'draw',
      'tool-text': 'text',
      'tool-equation': 'equation',
      'tool-graph': 'graph',
      'tool-image': 'image',
      'tool-uxdesign': 'uxdesign',
      'tool-eraser': 'eraser',
      'tool-blur': 'blur'
    };

    // Callbacks injetados pelos controllers
    this.onToolSelected = null;   // (tool, btn) => void
    this.onUndo = null;
    this.onRedo = null;
    this.onClearPage = null;
    this.onAddPage = null;
    this.onToggleLibrary = null;
    this.onCloseLibrary = null;
    this.onPenChange = null;      // ({ color, size }) => void
    this.onZoomChange = null;     // (delta) => void
    this.onToggleDark = null;
    this.onToggleLandscape = null;
    this.onHelp = null;
    this.onImport = null;
    this.onExport = null;
  }

  init() {
    this._bindTools();
    this._bindControls();
    this._bindPen();
  }

  _bindTools() {
    Object.entries(this.tools).forEach(([btnId, tool]) => {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.addEventListener('click', () => {
        // A decisao (abrir modal ou setar ferramenta) e tomada
        // pelo controller via onToolSelected.
        if (this.onToolSelected) this.onToolSelected(tool, btn);
      });
    });
  }

  _bindControls() {
    if (this.$.undoBtn) this.$.undoBtn.addEventListener('click', () => this.onUndo && this.onUndo());
    if (this.$.redoBtn) this.$.redoBtn.addEventListener('click', () => this.onRedo && this.onRedo());
    if (this.$.clearPageBtn) this.$.clearPageBtn.addEventListener('click', () => this.onClearPage && this.onClearPage());
    if (this.$.addPageBtn) this.$.addPageBtn.addEventListener('click', () => this.onAddPage && this.onAddPage());
    if (this.$.libraryBtn) this.$.libraryBtn.addEventListener('click', () => this.onToggleLibrary && this.onToggleLibrary());
    if (this.$.closeLibraryBtn) this.$.closeLibraryBtn.addEventListener('click', () => this.onCloseLibrary && this.onCloseLibrary());

    if (this.$.zoomInBtn) this.$.zoomInBtn.addEventListener('click', () => this.onZoomChange && this.onZoomChange(0.1));
    if (this.$.zoomOutBtn) this.$.zoomOutBtn.addEventListener('click', () => this.onZoomChange && this.onZoomChange(-0.1));

    if (this.$.darkModeBtn) this.$.darkModeBtn.addEventListener('click', () => this.onToggleDark && this.onToggleDark());
    if (this.$.landscapeBtn) this.$.landscapeBtn.addEventListener('click', () => this.onToggleLandscape && this.onToggleLandscape());
    if (this.$.helpBtn) this.$.helpBtn.addEventListener('click', () => this.onHelp && this.onHelp());
    if (this.$.importBtn) this.$.importBtn.addEventListener('click', () => this.onImport && this.onImport());
    if (this.$.exportBtn) this.$.exportBtn.addEventListener('click', () => this.onExport && this.onExport());
  }

  _bindPen() {
    if (this.$.penColor) {
      this.$.penColor.addEventListener('input', (e) => this._dispatchPen());
    }
    if (this.$.penSize) {
      this.$.penSize.addEventListener('input', (e) => this._dispatchPen());
    }
  }

  _dispatchPen() {
    this.board.penColor = this.$.penColor.value;
    this.board.penSize = parseInt(this.$.penSize.value, 10) || 3;
    if (this.onPenChange) this.onPenChange({ color: this.board.penColor, size: this.board.penSize });
  }

  /**
   * Define a ferramenta ativa (classe 'active' e cursor).
   * @param {string} tool
   * @param {HTMLElement} [btn]
   */
  setTool(tool, btn) {
    this.currentTool = tool;
    const activeBtn = btn || document.getElementById(`tool-${tool}`);
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    if (activeBtn) activeBtn.classList.add('active');

    // O whiteboard, e nao o canvas: o canvas de tinta nao recebe clique
    // (`pointer-events: none`), entao o cursor definido nele nunca
    // apareceria.
    if (this.$.whiteboard) {
      this.$.whiteboard.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    }
  }

  /* ---- Zoom ---- */
  updateZoomLabel(zoom) {
    if (this.$.zoomLevel) this.$.zoomLevel.textContent = Math.round(zoom * 100) + '%';
  }

  /* ---- Tema / orientacao ---- */
  applyThemeIcon(isDark) {
    const btn = this.$.darkModeBtn;
    if (!btn) return;
    if (isDark) {
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>';
    } else {
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.39 5.39 0 01-4.4 2.26 5.4 5.4 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>';
    }
  }

  setLandscapeActive(isLandscape) {
    if (this.$.landscapeBtn) this.$.landscapeBtn.classList.toggle('active', isLandscape);
  }
}
