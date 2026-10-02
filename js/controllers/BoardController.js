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
  /** Espera (ms) antes de refazer bitmaps apos uma troca de zoom. */
  static QUALITY_DEBOUNCE_MS = 80;

  /** Ja avisou que o localStorage estourou (evita toast repetido). */
  #quotaWarned = false;

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

    this._thumbs = new WeakMap();

    this.STORAGE_KEY = 'lousa-state';
  }

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

    // Centraliza a folha apos o layout assentar (fonts, canvas e zoom).
    requestAnimationFrame(() => requestAnimationFrame(() => this.boardView.centerOnPage()));
    // Garante os bitmaps na densidade inicial do zoom.
    this.refreshImageQuality();
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

    // Barra de paginas recolhida. Estado de UI, nao de documento: a
    // classe vive no DOM e some no reload, junto com a aba de reabertura.
    this.$.toggleSidebarBtn.addEventListener('click', () => this.togglePagesSidebar());
    this.$.sidebarTab.addEventListener('click', () => this.togglePagesSidebar(false));

    // Ferramentas que abrem modais/imagens
    this.toolController.onRequestEquation = () => this.objectController.openEquationModal();
    this.toolController.onRequestGraph = () => this.objectController.openGraphModal();
    this.toolController.onRequestImage = () => this.$.imageUpload.click();
    this.toolController.onBlur = () => this.blurSelectedObject();
    this.toolController.onUndo = () => this.undo();
    this.toolController.onRedo = () => this.redo();
    this.toolController.onDeleteSelected = () => this.objectController.handleDeleteSelected();
    this.toolController.onEscape = () => this.handleEscape();
    // Cada mudanca de zoom pode exigir mais pixels nos bitmaps.
    this.toolController.onZoomChange = () => this.refreshImageQuality();

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
    // O botao de editar e o mesmo para todo objeto, entao quem sabe qual
    // modal cabe e o controller: equacao e grafico tem modal proprio, e
    // texto se edita na propria lousa.
    this.selectionView.onEditObject = (obj) => {
      if (!obj) return;
      if (obj.type === 'graph') return this.objectController.openGraphModal(obj);
      if (obj.type === 'equation') return this.objectController.openEquationModal(obj);
      if (obj.type === 'text') return this.objectController.focusText(obj);
    };
    this.selectionView.onEditText = (obj) => this.objectController.focusText(obj);
    this.selectionView.onBlurObject = (obj, force) => {
      obj.applyBlur(force !== undefined ? force : !obj.blurred);
      this.board.deselectObject();
      this.commitHistory();
      this._saveState();
    };
    this.selectionView.onCommitChange = () => this.commitHistory();
    this.selectionView.objectController = this.objectController;
    // Redimensionar muda a densidade exigida do bitmap.
    this.selectionView.onResized = (obj) => this.refreshObjectQuality(obj);

    // Biblioteca
    this.$.saveToLibraryBtn.addEventListener('click', () => {
      this.mathEditor.open('', (latex) => {
        this.objectController.saveToLibrary(latex);
        this.renderLibrary();
        this.showToast('Equacao salva na biblioteca');
      });
    });
    this.$.librarySearchInput.addEventListener('input', () => this.renderLibrary());

    // Insert/edita grafico
    this.$.insertGraphBtn.addEventListener('click', () => {
      const wasEditing = Boolean(this.objectController._editingGraph);
      const result = this.objectController.insertGraph();
      if (result) this.showToast(wasEditing ? 'Grafico atualizado' : 'Grafico inserido');
    });

    // Modais (fechar). Fechar o modal de grafico cancela a edicao: o alvo
    // e limpo e os rotulos voltam ao modo de criacao, senao o proximo
    // `G` abriria em modo de edicao sobre o grafico anterior.
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal');
        if (modal && modal === this.$.graphModal) this.objectController.cancelGraphEdit();
        modal.classList.add('hidden');
      });
    });
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('modal-backdrop')) {
          if (modal === this.$.graphModal) this.objectController.cancelGraphEdit();
          modal.classList.add('hidden');
        }
      });
    });
  }

  /* ---- Canvas resize ---- */
  _setupCanvasResize() {
    const resize = () => {
      // O backing store do canvas e reservado na densidade maxima
      // (ver BoardView.resizeDrawingCanvas), entao nao depende do zoom:
      // redimensionar a janela raramente o altera. Quando altera, o
      // canvas e limpo e a pagina precisa ser redesenhada por cima.
      const { resized } = this.boardView.resizeDrawingCanvas();
      if (!resized) return;
      const page = this.board.currentPage;
      this.boardView.clearCanvas();
      if (page && page.drawingData) this.boardView.drawBackground(page.drawingData);
    };
    resize();
    window.addEventListener('resize', resize);
  }

  /**
   * Regenera o bitmap das imagens e graficos cujo cache esta abaixo da
   * densidade de pixels que o zoom atual exige.
   *
   * O `transform: scale()` do zoom nao cria pixels: sem regenerar o
   * cache, o navegador apenas interpola o bitmap existente. O trabalho
   * e adiado por um debounce para que um `Ctrl+Scroll` continuo nao
   * dispare dezenas de repaints, e cada objeto decide sozinho se precisa
   * (so re-renderiza quando o ganho e real).
   *
   * Fica num `setTimeout`, e nao num `requestAnimationFrame`: repintar
   * canvas e um trabalho bloqueante, e fazê-lo dentro do frame atrasaria o
   * proprio paint que o zoom esta solicitando.
   */
  refreshImageQuality() {
    clearTimeout(this._qualityTimer);
    this._qualityTimer = setTimeout(() => {
      const zoom = this.board.zoom;
      this.board.objects.forEach((obj) => {
        if (typeof obj.needsRerender !== 'function') return;
        if (!obj.needsRerender(zoom)) return;
        const done = obj.rerender(this.objectController, zoom);
        if (done && typeof done.then === 'function') {
          done.then((changed) => { if (changed) this._saveState(); });
        } else if (done) {
          this._saveState();
        }
      });
    }, BoardController.QUALITY_DEBOUNCE_MS);
  }

  /**
   * Regenera o cache de um objeto especifico (apos resize/insercao).
   * @param {object} obj
   */
  refreshObjectQuality(obj) {
    if (!obj || typeof obj.rerender !== 'function') return;
    const done = obj.rerender(this.objectController, this.board.zoom);
    if (done && typeof done.then === 'function') {
      done.then((changed) => { if (changed) this._saveState(); });
    } else if (done) {
      this._saveState();
    }
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
    // O desenho e serializado numa densidade limitada: o buffer em alta
    // resolucao geraria um PNG de dezenas de MB no localStorage.
    page.drawingData = this.boardView.exportDrawing();
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

  /**
   * Desenha a lista de paginas da sidebar.
   *
   * O rotulo vem do indice, nunca de `page.name`: o nome e um texto
   * gravado no momento da criacao e nada o renumera. Apagar a pagina 1
   * deixava a pagina 2 como unica da lista continuando rotulada "Pagina
   * 2", e o mesmo vale para um `localStorage` antigo ou para um projeto
   * JSON importado, cujos nomes podem vir em qualquer ordem. Como nao ha
   * renomear pagina na UI, `page.name` nunca foi lido em outro lugar e a
   * posicao na lista e a unica identidade que a sidebar precisa mostrar.
   */
  renderPagesList() {
    const list = this.$.pagesList;
    list.innerHTML = '';
    this.board.pages.forEach((page, i) => {
      const item = document.createElement('div');
      item.className = `page-item ${i === this.board.currentPageIndex ? 'active' : ''}`;
      item.innerHTML = `
        <div class="page-thumb"></div>
        <div class="page-info">
          <div class="page-name">Pagina ${i + 1}</div>
        </div>
        <button class="page-delete-btn" data-index="${i}" title="Remover">&times;</button>
      `;
      // `drawingData` e um raster de pagina inteira; reduzi-lo para a
      // miniatura evita decodificar uma imagem grande para uma caixa de
      // poucos pixels.
      this._renderPageThumb(item.querySelector('.page-thumb'), page);
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

  /**
   * Desenha a miniatura de uma pagina a partir do raster salvo.
   *
   * O cache fica num `WeakMap` de proposito: uma propriedade no objeto
   * `page` entraria no `JSON.stringify` das pagoes e inflaria o
   * localStorage com um segundo data URL.
   *
   * @param {HTMLElement} host
   * @param {object} page
   */
  _renderPageThumb(host, page) {
    if (!host) return;
    const source = page.drawingData;
    if (!source) {
      host.innerHTML = '';
      return;
    }
    const cached = this._thumbs.get(page);
    if (cached && cached.for === source) {
      host.style.backgroundImage = `url(${cached.url})`;
      return;
    }
    const img = new Image();
    img.onload = () => {
      const w = 120;
      const h = Math.max(1, Math.round(w * (img.height / (img.width || 1))));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      // JPEG nao tem canal alfa: no Chrome, todo pixel transparente do
      // `drawingData` (que e um PNG com alfa) seria codificado como
      // preto. Como a miniatura e aplicada por cima do `background:
      // white` do CSS, o branco do papel nunca apareceria. O preenchimento
      // abaixo e a propria cor da pagina em ambos os temas
      // (`--bg-canvas` e `#ffffff`), a mesma que o `exportPDF` ja usa.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const url = canvas.toDataURL('image/jpeg', 0.6);
      this._thumbs.set(page, { for: source, url });
      host.style.backgroundImage = `url(${url})`;
    };
    img.src = source;
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

  /* ---- Barra de paginas ---- */

  /**
   * Recolhe ou expande a barra lateral de paginas.
   *
   * Sao tres classes e nada mais: `transform` desloca a sidebar, o
   * `padding-left` do #workspace devolve a faixa que ela ocupava e a aba
   * reaparece. As duas primeiras propriedades ja sao transicionadas no
   * CSS, entao o recolhimento sai animado sem JS de animacao. As tres
   * classes sao escritas aqui juntas de proposito: o padding do #workspace
   * e acoplado a largura da sidebar em `calc()`, e sem a segunda classe
   * sobraria uma faixa morta a esquerda da lousa.
   *
   * @param {boolean} [collapsed] omitido, alterna o estado atual.
   */
  togglePagesSidebar(collapsed) {
    const isCollapsed = this.$.pagesSidebar.classList.contains('collapsed');
    const next = collapsed === undefined ? !isCollapsed : collapsed;

    this.$.pagesSidebar.classList.toggle('collapsed', next);
    this.$.workspace.classList.toggle('sidebar-collapsed', next);
    this.$.sidebarTab.classList.toggle('hidden', !next);
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
    // A troca de eixos muda o tamanho do backing store do canvas, entao
    // ele so pode ser reservado (e o redesenhado) com a dimensao final.
    setTimeout(() => {
      const { resized } = this.boardView.resizeDrawingCanvas();
      if (!resized) return;
      this.boardView.clearCanvas();
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
    // O anel do raio vive dentro do whiteboard: se estivesse visivel no
    // momento da captura, sairia impresso no PDF.
    this.boardView.hideDrawGuide();
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
    this.boardView.hideDrawGuide();  // ver exportPDF
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
      reader.onload = (ev) => this.objectController.insertImageFromSrc(ev.target.result, 100, 100);
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
      const dt = e.dataTransfer;
      if (this._isInternalDrag(dt)) return;
      for (const file of dt.files) {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            if (this._isDuplicateImage(ev.target.result, 100, 100)) return;
            this.objectController.insertImageFromSrc(ev.target.result, 100, 100);
          };
          reader.readAsDataURL(file);
        } else if (file.name.endsWith('.json')) {
          this.importJSON(file);
        }
      }
    });
  }

  /**
   * Arrastar um elemento da propria lousa dispara `drop` no workspace.
   * Nesses casos o dataTransfer traz payloads de string (text/uri-list,
   * text/html, chromium/x-drag-id) e nao um arquivo real do disco.
   */
  _isInternalDrag(dt) {
    if (!dt) return true;
    if (!dt.files || dt.files.length === 0) return true;
    return Array.from(dt.items || []).some((item) => item.kind === 'string');
  }

  /**
   * Descarta o drop se o mesmo src ja foi inserido na mesma posicao,
   * evitando duplicatas akibat de multiplos disparos de `drop`.
   */
  _isDuplicateImage(src, x, y) {
    return this.board.objects.some(
      (obj) => obj.src === src && obj.x === x && obj.y === y
    );
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
      this.#quotaWarned = false;
    } catch (err) {
      this._warnQuota(err);
    }
  }

  /**
   * Avisa uma unica vez que o localStorage estourou.
   *
   * Bitmaps de alta resolucao consumem cota rapido (o limite e ~5 MB), e
   * o `setItem` lanca `QuotaExceededError` sem deixar o estado salvo. O
   * aviso importa porque a falha e silenciosa: a lousa continua
   * funcionando, mas recarregar a pagina perde o trabalho.
   * @param {Error} [err]
   */
  _warnQuota(err) {
    const isQuota = err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014);
    if (!isQuota || this.#quotaWarned) return;
    this.#quotaWarned = true;
    this.showToast('Armazenamento cheio: reduza as imagens ou exporte o projeto');
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
