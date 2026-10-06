/* ============================================
   LOUSA VIRTUAL - ToolController
   ============================================
   Controller responsavel pelas ferramentas da barra,
   atalhos de teclado, ajuste de zoom e config de pen.
   ============================================ */

export class ToolController {
  constructor(board, boardView, toolbar) {
    this.board = board;
    this.boardView = boardView;
    this.toolbar = toolbar;

    // Callbacks injetados pelo BoardController
    this.onRequestEquation = null;  // () => void
    this.onRequestGraph = null;      // () => void
    this.onRequestImage = null;      // () => void
    this.onRequestUXDesign = null;   // () => void -> abre/fecha o modo Design
    this.onBlur = null;              // () => void -> borrar objeto selecionado
    this.onUndo = null;
    this.onRedo = null;
    this.onZoomChange = null;   // () => void -> bitmaps podem precisar de mais pixels
    this.onDeleteSelected = null;
    this.onEscape = null;
    this.onToolChange = null;   // (tool) => void -> guia do raio some ao trocar
    // () => boolean -> o modo Design esta aberto e tem o teclado dele
    this.isUXDesignActive = null;
  }

  /**
   * Unico ponto por onde a ferramenta ativa muda.
   *
   * `routeTool` e o atalho de teclado chamavam `toolbar.setTool`
   * diretamente, o que deixaria o aviso de troca dependente de lembrar
   * os dois lugares.
   *
   * @param {string} tool
   */
  _setTool(tool) {
    this.toolbar.setTool(tool);
    if (this.onToolChange) this.onToolChange(tool);
  }

  init() {
    this.toolbar.onToolSelected = (tool) => this.routeTool(tool);
    this.toolbar.onUndo = () => this.onUndo && this.onUndo();
    this.toolbar.onRedo = () => this.onRedo && this.onRedo();
    this.toolbar.onZoomChange = (delta) => this.changeZoom(delta);
    this.setZoom(this.board.zoom);
    this._bindKeyboard();
  }

  /**
   * Encaminha a ferramenta selecionada para a acao apropriada.
   * @param {string} tool
   */
  routeTool(tool) {
    if (tool === 'equation') return this.onRequestEquation && this.onRequestEquation();
    if (tool === 'graph') return this.onRequestGraph && this.onRequestGraph();
    if (tool === 'image') return this.onRequestImage && this.onRequestImage();
    // 'uxdesign' e um modo, nao uma ferramenta: nao vira a ferramenta ativa
    // da lousa, so troca o que o #workspace mostra.
    if (tool === 'uxdesign') return this.onRequestUXDesign && this.onRequestUXDesign();
    if (tool === 'blur') {
      this._setTool(tool);
      if (this.onBlur) this.onBlur();
      return;
    }
    this._setTool(tool);
  }

  /* ---- Zoom ---- */
  changeZoom(delta) {
    this.setZoom(this.board.zoom + delta);
  }

  setZoom(value) {
    const next = Math.min(3, Math.max(0.25, value));
    this.board.zoom = next;
    this.boardView.applyZoom(next);
    this.toolbar.updateZoomLabel(next);
    // `scale()` nao cria pixels: quem tem bitmap rasterizado precisa
    // refaze-lo na densidade do novo zoom.
    if (this.onZoomChange) this.onZoomChange(next);
  }

  /* ---- Atalhos de teclado ---- */
  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (this._isTyping(e)) return;

      // Modo Design aberto: o teclado e dele. O listener dele e de captura e
      // para as teclas que ele trata, mas `E`, `G`, `+` e `Ctrl+Z` ficariam
      // so com a lousa -- e abririam modal ou dariam zoom em cima do design.
      if (this.isUXDesignActive && this.isUXDesignActive()) return;

      const key = e.key.toLowerCase();

      if (e.ctrlKey && key === 'z') { e.preventDefault(); this.onUndo && this.onUndo(); return; }
      if (e.ctrlKey && key === 'y') { e.preventDefault(); this.onRedo && this.onRedo(); return; }

      const keyMap = { 'v': 'select', 'd': 'draw', 't': 'text', 'x': 'eraser', 'b': 'blur' };
      if (keyMap[key]) {
        this._setTool(keyMap[key]);
        return;
      }
      if (key === 'e') { e.preventDefault(); this.onRequestEquation && this.onRequestEquation(); return; }
      if (key === 'g') { e.preventDefault(); this.onRequestGraph && this.onRequestGraph(); return; }
      if (key === 'i') { e.preventDefault(); this.onRequestImage && this.onRequestImage(); return; }
      // Abre o modo Design. Com ele aberto a guarda la de cima ja cortou a
      // tecla, entao `U` aqui nunca fecha: quem fecha e o botao "Voltar".
      if (key === 'u') { e.preventDefault(); this.onRequestUXDesign && this.onRequestUXDesign(); return; }
      if (key === '=' || key === '+') { this.changeZoom(0.1); return; }
      if (key === '-') { this.changeZoom(-0.1); return; }
      if ((key === 'delete' || key === 'backspace')) { this.onDeleteSelected && this.onDeleteSelected(); return; }
      if (key === 'escape') { this.onEscape && this.onEscape(); }
    });
  }

  _isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.contentEditable === 'true');
  }
}
