/* ============================================
   LOUSA VIRTUAL - BoardController
   ============================================
   Controller principal: orquestra paginas, zoom,
   historico (undo/redo), persistencia (localStorage
   e import/export), tema, orientacao e biblioteca.
   Conecta todos os demais controllers e views.
   ============================================ */

import { MathObject } from '../models/MathObject.js';
import { TextObject } from '../models/TextObject.js';
import { ImageObject } from '../models/ImageObject.js';

export class BoardController {
  constructor(board, boardView, toolbar, mathEditor,
    toolController, mouseController, objectController, selectionView, $) {
    this.board = board;
    this.boardView = boardView;
    this.toolbar = toolbar;
    this.mathEditor = mathEditor;
    this.toolController = toolController;
    this.mouseController = mouseController;
    this.objectController = objectController;
    this.selectionView = selectionView;
    this.$ = $;

    this.STORAGE_KEY = 'lousa-state';
  }

  #prevSizes = null;

  init() {
    this._loadState();
    if (this.board.pages.length === 0) this.addPage();

    this._setupCanvasResize();
    this._bindViews();
    this._setupZoomWheel();
    this._setupExport();
    this._setupImageUpload();
    this._setupDragDrop();

    this.renderPagesList();
    this.renderLibrary();
    this._switchPage(this.board.currentPageIndex);
    this._applyTheme();
  }

  /** Interligacao entre controllers/views. */
  _bindViews() {
    const board = this.board;
    const bv = this.boardView;

    this.toolbar.onToggleDark = () => this.toggleDarkMode();
    this.toolbar.onToggleLandscape = () => this.toggleLandscape();
    this.toolbar.onAddPage = () => this.addPage();
    this.toolbar.onClearPage = () => this.clearPage();
    this.toolbar.onToggleLibrary = () => this.toggleLibrary(this.$.librarySidebar.classList.contains('hidden'));
    this.toolbar.onCloseLibrary = () => this.toggleLibrary(false);
    this.toolbar.onHelp = () => this.openHelp();
    this.toolbar.onExport = () => this.openExport();

    // Ferramentas que abrem modais/imagens
    this.toolController.onRequestEquation = () => this.objectController.openEquationModal();
    this.toolController.onRequestGraph = () => this.objectController.openGraphModal();
    this.toolController.onRequestImage = () => this.$.imageUpload.click();
    this.toolController.onBlur = () => this.blurSelectedObject();
    this.toolController.onUndo = () => this.undo();
    this.toolController.onRedo = () => this.redo();
    this.toolController.onDeleteSelected = () => this.objectController.handleDeleteSelected();
    this.toolController.onEscape = () => this.handleEscape();

    // Object controller
    this.objectController.onCommit = () => this.commitHistory();
    this.objectController.onPersist = () => this._saveState();
    this.objectController.onLibraryChange = () => this.renderLibrary();

    // Mouse
    this.mouseController.onStrokeEnd = () => this.commitHistory();

    // Selection
    this.selectionView.onDeleteObject = (obj) => {
      this.boardView.removeObjectElement(obj);
      this.board.removeObject(obj);
      this.commitHistory();
    };
    this.selectionView.onEditEquation = (obj) => this.objectController.openEquationModal(obj);
    this.selectionView.onEditText = (obj) => this.objectController.focusText(obj);
    this.selectionView.onBlurObject = (obj, force) => {
      obj.applyBlur(force !== undefined ? force : !obj.blurred);
      this.board.deselectObject();
      this.commitHistory();
      this._saveState();
    };
    this.selectionView.onCommitChange = () => this.commitHistory();

    // Biblioteca
    this.$.saveToLibraryBtn.addEventListener('click', () => {
      this.mathEditor.open('', (latex) => {
        this.objectController.saveToLibrary(latex);
        this.renderLibrary();
        this.showToast('Equacao salva na biblioteca');
      });
    });
    this.$.librarySearchInput.addEventListener('input', () => this.renderLibrary());

    // Insert grafico
    this.$.insertGraphBtn.addEventListener('click', () => {
      this.objectController.insertGraph();
      this.renderLibrary();
      this.showToast('Grafico inserido');
    });

    // Modais (fechar)
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.modal').classList.add('hidden'));
    });
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('modal-backdrop')) {
          modal.classList.add('hidden');
        }
      });
    });
  }

  /* ---- Canvas resize ---- */
  _setupCanvasResize() {
    const resize = () => {
      const rect = this.$.whiteboard.getBoundingClientRect();
      this.boardView.canvas.width = rect.width;
      this.boardView.canvas.height = rect.height;
      const page = this.board.currentPage;
      if (page && page.drawingData) this.boardView.drawBackground(page.drawingData);
    };
    resize();
    window.addEventListener('resize', resize);
  }

  /* ---- Zoom (scroll) ---- */
  _setupZoomWheel() {
    document.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        this.toolController.changeZoom(e.deltaY > 0 ? -0.05 : 0.05);
      }
    }, { passive: false });
  }

  /* ---- Paginas ---- */
  addPage(name = null) {
    const page = {
      id: Date.now(),
      name: name || `Pagina ${this.board.pages.length + 1}`,
      drawingData: null,
      elements: [],
      objects: [],
      orientation: this.board.isLandscape ? 'landscape' : 'portrait'
    };
    this.board.pages.push(page);
    this.renderPagesList();
    return page;
  }

  _switchPage(index) {
    if (index < 0 || index >= this.board.pages.length) return;
    this._saveCurrentPage();
    this.board.currentPageIndex = index;

    const page = this.board.pages[index];
    this.board.isLandscape = page.orientation === 'landscape';
    this.boardView.setOrientation(this.board.isLandscape);
    this.toolbar.setLandscapeActive(this.board.isLandscape);

    // Limpa canvas e objetos da view
    this.boardView.clearCanvas();
    this.board.clear();
    this.boardView.clearLayer();

    if (page.drawingData) this.boardView.drawBackground(page.drawingData);
    page.elements.forEach(el => this._restoreFromSerialized(el));
    this._saveState();
    this.renderPagesList();
  }

  deletePage(index) {
    if (this.board.pages.length <= 1) {
      this.showToast('Nao e possivel remover a unica pagina');
      return;
    }
    this.board.pages.splice(index, 1);
    if (this.board.currentPageIndex >= this.board.pages.length) {
      this.board.currentPageIndex = this.board.pages.length - 1;
    }
    this._switchPage(this.board.currentPageIndex);
    this.renderPagesList();
    this.showToast('Pagina removida');
  }

  _saveCurrentPage() {
    const page = this.board.currentPage;
    if (!page) return;
    page.drawingData = this.boardView.canvas.toDataURL();
    page.elements = this.board.objects.map(o => o.toJSON());
    page.objects = page.elements;
    this._saveState();
  }

  _restoreFromSerialized(data) {
    // Reconstroi o objeto de modelo a partir do JSON serializado
    let obj = null;
    switch (data.type) {
      case 'equation':
        obj = MathObject.fromJSON(data);
        break;
      case 'text':
        obj = TextObject.fromJSON(data);
        break;
      case 'image':
      case 'graph':
        obj = ImageObject.fromJSON(data);
        break;
      default:
        return;
    }
    this.board.addObject(obj);
    this.boardView.addObjectElement(obj);
  }

  /* ---- Renderizacao de paginas --- */
  renderPagesList() {
    const list = this.$.pagesList;
    list.innerHTML = '';
    this.board.pages.forEach((page, i) => {
      const item = document.createElement('div');
      item.className = `page-item ${i === this.board.currentPageIndex ? 'active' : ''}`;
      item.innerHTML = `
        <div class="page-thumb"><img src="${page.drawingData || ''}" alt=""></div>
        <div class="page-info">
          <div class="page-name">${page.name}</div>
          <div class="page-number">Pagina ${i + 1}</div>
        </div>
        <button class="page-delete-btn" data-index="${i}" title="Remover">&times;</button>
      `;
      item.addEventListener('click', (e) => {
        if (e.target.closest('.page-delete-btn')) return;
        this._switchPage(i);
      });
      item.querySelector('.page-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.deletePage(i);
      });
      list.appendChild(item);
    });
  }

  /* ---- Limpar pagina ---- */
  clearPage() {
    if (!confirm('Limpar toda a pagina?')) return;
    this.board.clear();
    this.boardView.clearCanvas();
    this.boardView.clearLayer();
    this.commitHistory();
    this.showToast('Pagina limpa');
  }

  /* ---- Biblioteca ---- */
  toggleLibrary(open) {
    this.$.librarySidebar.classList.toggle('hidden', !open);
    if (open) this.renderLibrary();
  }

  renderLibrary() {
    const list = this.$.libraryList;
    const query = this.$.librarySearchInput.value || '';
    list.innerHTML = '';
    const filtered = this.objectController.searchLibrary(query);

    if (filtered.length === 0) {
      list.innerHTML = '<p style="padding:24px;color:var(--text-muted);font-size:12px;text-align:center">Nenhuma equacao salva</p>';
      return;
    }

    filtered.forEach(item => {
      const div = document.createElement('div');
      div.className = 'library-item';

      const label = document.createElement('div');
      label.className = 'lib-label';
      try { window.katex.render(item.latex, label, { displayMode: true, throwOnError: false }); } catch {}

      const del = document.createElement('button');
      del.className = 'lib-delete';
      del.dataset.id = item.id;
      del.textContent = '×';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        this.objectController.removeFromLibrary(item.id);
        this.renderLibrary();
        this.showToast('Equacao removida');
      });

      div.appendChild(del);
      div.appendChild(label);
      div.addEventListener('click', (e) => {
        if (!e.target.closest('.lib-delete')) this.objectController.createEquation(item.latex);
      });
      list.appendChild(div);
    });
  }

  /* ---- Historia ---- */
  commitHistory() {
    this.board.pushHistory();
  }

  undo() {
    if (this.board.historyIndex <= 0) return;
    this.board.historyIndex--;
    this._restoreHistory(this.board.history[this.board.historyIndex]);
    this.showToast('Desfeito');
  }

  redo() {
    if (this.board.historyIndex >= this.board.history.length - 1) return;
    this.board.historyIndex++;
    this._restoreHistory(this.board.history[this.board.historyIndex]);
    this.showToast('Refito');
  }

  _restoreHistory(snapshot) {
    if (!snapshot) return;
    this.boardView.clearCanvas();
    this.board.clear();
    this.boardView.clearLayer();
    (snapshot.objects || []).forEach(data => this._restoreFromSerialized(data));
  }

  /* ---- Tema ---- */
  toggleDarkMode() {
    this.board.isDarkMode = !this.board.isDarkMode;
    this._applyTheme();
    this._saveState();
  }

  _applyTheme() {
    document.body.classList.toggle('dark-mode', this.board.isDarkMode);
    this.toolbar.applyThemeIcon(this.board.isDarkMode);
  }

  /* ---- Orientacao ---- */
  toggleLandscape() {
    this.board.isLandscape = !this.board.isLandscape;
    this.boardView.setOrientation(this.board.isLandscape);
    const page = this.board.currentPage;
    if (page) page.orientation = this.board.isLandscape ? 'landscape' : 'portrait';
    this.toolbar.setLandscapeActive(this.board.isLandscape);
    this._saveState();
    setTimeout(() => {
      const rect = this.$.whiteboard.getBoundingClientRect();
      this.boardView.canvas.width = rect.width;
      this.boardView.canvas.height = rect.height;
      const curPage = this.board.currentPage;
      if (curPage && curPage.drawingData) this.boardView.drawBackground(curPage.drawingData);
    }, 450);
  }

  /* ---- Blur ---- */
  blurSelectedObject() {
    const obj = this.board.selectedObject;
    if (!obj) return;
    obj.applyBlur(true);
    this.board.deselectObject();
    this.commitHistory();
    this._saveState();
  }

  /* ---- Modais de ajuda/export ---- */
  openHelp() { this.$.helpModal.classList.remove('hidden'); }
  openExport() { this.$.exportModal.classList.remove('hidden'); }
  handleEscape() {
    this.board.deselectObject();
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  }

  /* ---- Export ---- */
  _setupExport() {
    this.$.exportPdfBtn.addEventListener('click', () => this.exportPDF());
    this.$.exportPngBtn.addEventListener('click', () => this.exportPNG());
    this.$.exportJsonBtn.addEventListener('click', () => this.exportJSON());
    this.$.jsonUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.importJSON(file);
      e.target.value = '';
    });
  }

  exportPDF() {
    this._saveCurrentPage();
    this.showToast('Gerando PDF...');
    window.html2canvas(this.$.whiteboard, { scale: 2, backgroundColor: '#ffffff' }).then((c) => {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: this.board.isLandscape ? 'landscape' : 'portrait',
        unit: 'px',
        format: [c.width / 2, c.height / 2]
      });
      pdf.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, c.width / 2, c.height / 2);
      pdf.save('lousa-virtual.pdf');
      this.showToast('PDF exportado!');
      this.$.exportModal.classList.add('hidden');
    });
  }

  exportPNG() {
    this._saveCurrentPage();
    this.showToast('Gerando PNG...');
    window.html2canvas(this.$.whiteboard, { scale: 2, backgroundColor: '#ffffff' }).then((c) => {
      const link = document.createElement('a');
      link.download = 'lousa-virtual.png';
      link.href = c.toDataURL('image/png');
      link.click();
      this.showToast('PNG exportado!');
      this.$.exportModal.classList.add('hidden');
    });
  }

  exportJSON() {
    this._saveCurrentPage();
    const data = { version: 1, pages: this.board.pages, library: this.board.library };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = 'lousa-virtual.json';
    link.href = URL.createObjectURL(blob);
    link.click();
    this.showToast('Projeto salvo!');
    this.$.exportModal.classList.add('hidden');
  }

  importJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.pages) {
          this.board.pages = data.pages;
          this.board.library = data.library || [];
          this.board.currentPageIndex = 0;
          this.renderPagesList();
          this.renderLibrary();
          this._switchPage(0);
          this.showToast('Projeto carregado!');
        }
      } catch {
        this.showToast('Arquivo invalido');
      }
    };
    reader.readAsText(file);
  }

  /* ---- Upload de imagem ---- */
  _setupImageUpload() {
    this.$.imageUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => this.objectController.createImage(ev.target.result, false, 100, 100);
      reader.readAsDataURL(file);
      e.target.value = '';
    });
  }

  /* ---- Drag & Drop ---- */
  _setupDragDrop() {
    const workspace = this.$.workspace;
    workspace.addEventListener('dragover', (e) => e.preventDefault());
    workspace.addEventListener('drop', (e) => {
      e.preventDefault();
      for (const file of e.dataTransfer.files) {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (ev) => this.objectController.createImage(ev.target.result, false, 100, 100);
          reader.readAsDataURL(file);
        } else if (file.name.endsWith('.json')) {
          this.importJSON(file);
        }
      }
    });
  }

  /* ---- Persistencia ---- */
  _loadState() {
    try {
      const data = JSON.parse(localStorage.getItem(this.STORAGE_KEY));
      if (data) {
        this.board.pages = data.pages || [];
        this.board.library = data.library || [];
        this.board.isDarkMode = data.isDarkMode || false;
        this.board.isLandscape = data.isLandscape || false;
        this.board.currentPageIndex = data.currentPageIndex || 0;
      }
    } catch {}
  }

  _saveState() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
        pages: this.board.pages,
        library: this.board.library,
        isDarkMode: this.board.isDarkMode,
        isLandscape: this.board.isLandscape,
        currentPageIndex: this.board.currentPageIndex
      }));
    } catch {}
  }

  /* ---- Toast ---- */
  showToast(msg) {
    const toast = this.$.toast;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2000);
  }

  /** Acessa paginas/estado para helpers externos. */
  get debug() {
    return { board: this.board };
  }
}
