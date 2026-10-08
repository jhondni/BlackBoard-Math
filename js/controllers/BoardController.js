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
import { ZipStore } from '../renderers/ZipStore.js';

export class BoardController {
  /** Espera (ms) antes de refazer bitmaps apos uma troca de zoom. */
  static QUALITY_DEBOUNCE_MS = 80;

  /** Pixels de saida por pixel da pagina, no PDF e no PNG. */
  static EXPORT_SCALE = 2;

  /**
   * Formato do arquivo de projeto (`.json`) gravado por `exportJSON`.
   *
   * O mesmo numero vai no `version` que o export escreve e no limite que o
   * import aceita, entao os dois lados nao podem divergir: um projeto
   * gravado por uma versao mais nova do programa e recusado com aviso,
   * em vez de abrir pela metade e perder as paginas que ela nao conhecesse.
   */
  static PROJECT_VERSION = 1;

  /**
   * Pontos PDF por pixel CSS. O PDF e medido em `pt` (1/72") e o browser
   * em px (1/96"), entao 1 px = 72/96 = 0,75 pt. Deixar o jsPDF em
   * `unit: 'px'` faz o contrario -- ele multiplica por 96/72 = 4/3 -- e a
   * folha sai 1,78x maior que o papel, com o A4 virando 52,8 x 37,3 cm.
   */
  static PX_TO_PT = 72 / 96;

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
    this._setupImport();
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
    this.toolbar.onImport = () => this.$.jsonUpload.click();
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
    // Salvar na biblioteca e por equacao, nao no ato de inserir: aqui o
    // `false` do `saveToLibrary` significa "ja estava na biblioteca", e o
    // toast precisa dizer isso em vez de confirmar um salvamento que nao
    // aconteceu.
    this.selectionView.onSaveToLibrary = (obj) => {
      if (!obj || !obj.latex) return;
      const saved = this.objectController.saveToLibrary(obj.latex);
      this.showToast(saved ? 'Equacao salva na biblioteca' : 'Equacao ja esta na biblioteca');
    };
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
        const saved = this.objectController.saveToLibrary(latex);
        this.renderLibrary();
        this.showToast(saved ? 'Equacao salva na biblioteca' : 'Equacao ja esta na biblioteca');
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

  /**
 * Troca a pagina visivel.
 *
 * Devolve a Promise do repinte da tinta (ver `BoardView.drawBackground`),
 * para quem precisar do canvas ja pintado -- hoje so o export multipagina.
 * Quem so quer trocar a pagina pode ignorar o retorno, como antes.
 *
 * @param {number} index
 * @returns {Promise<void>}
 */
_switchPage(index) {
    if (index < 0 || index >= this.board.pages.length) return Promise.resolve();
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

    const pintado = this.boardView.drawBackground(page.drawingData);
    page.elements.forEach(el => this._restoreFromSerialized(el));
    this._saveState();
    this.renderPagesList();
    return pintado;
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
  }

  /* ---- Import ---- */
  _setupImport() {
    this.$.jsonUpload.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      // Zerar o `value` depois de ler o arquivo: sem isso, escolher o
      // MESMO `.json` duas vezes seguidas nao dispara `change` e o
      // segundo projeto parece nao ter aberto.
      e.target.value = '';
      if (file) this.importJSON(file);
    });
  }

  /**
   * Captura a folha inteira na proporcao do papel, com o zoom desligado.
   *
   * O `html2canvas` dimensiona a captura por `getBoundingClientRect()`, e
   * esse retangulo ja inclui o `transform: scale(zoom)` que o `BoardView`
   * aplica no `#whiteboard`. O canvas de saida saia com o tamanho da TELA
   * (794 x zoom) e, pior, com o conteudo escalado e deslocado dentro dele:
   * medido em 200%, das 9 referencias numa pagina so 1 aparecia no lugar.
   * O scroll da `#workspace` (que o `centerOnPage` mexe) somava o resto do
   * deslocamento.
   *
   * Zerar o transform durante a captura resolve os dois de uma vez: o
   * retangulo volta a ser o papel. Como `transform` e so visual, ele nao
   * participa do layout -- o `offsetWidth`/`offsetHeight` da folha e o
   * `--page-width`/`--page-height` continuam valer -- entao a pagina
   * reservas a propria dimensao e o html2canvas captura a folha inteira, na
   * orientation corrente, com a proporcao do papel. O `finally` restaura o
   * zoom mesmo se a captura falhar.
   *
   * @returns {Promise<HTMLCanvasElement>}
   */
  async _capturePage() {
    const wb = this.$.whiteboard;
    // O anel do raio vive dentro da folha: se estivesse visivel no momento
    // da captura, sairia impresso no PDF.
    this.boardView.hideDrawGuide();

    const zoom = wb.style.transform;
    wb.style.transform = 'none';
    try {
      return await window.html2canvas(wb, {
        scale: BoardController.EXPORT_SCALE,
        backgroundColor: '#ffffff'
      });
    } finally {
      wb.style.transform = zoom;
    }
  }

/**
   * Captura TODAS as paginas do projeto, uma por vez.
   *
   * O `#whiteboard` so tem a pagina visivel: `_switchPage` faz
   * `clearLayer()` e reconstroi a camada de objetos da pagina alvo. O
   * unico jeito de fotografar as demais e mudar para cada uma e capturar,
   * entao o percurso e sequencial e a pagina original volta no `finally`.
   *
   * A espera entre capturas NAO e um timeout, e o repinte da tinta
   * devolvido por `_switchPage`. O `html2canvas` espera as `<img>` da
   * camada, mas nao espera um canvas ja desenhado: ele le os pixels
   * quando clona o DOM, e o `drawBackground` so pinta depois do
   * `img.onload`. Medido numa pagina que so tinha tinta -- 0 px sem
   * espera, 161.364 px com um `requestAnimationFrame`, 242.398 px com
   * 50 ms. Um frame cai dentro dessa janela, ou seja, era meio cara de
   * moeda: as primeiras folhas saiam em branco conforme o
   * agendamento da maquina. As `<img>` (graficos, imagens, equacoes) nao
   * têm esse problema e nao precisam de espera nenhuma.
   *
   * A transicao de largura/altura da folha (0.4 s no CSS) e desligada
   * durante o percurso: sem ela, capturar no meio da transicao daria uma
   * folha com a proporcao da pagina anterior, e ela custava 37% do tempo
   * (8 paginas alternando orientacao: 7,4 s com, 4,6 s sem).
   *
   * @returns {Promise<Array<{index:number, canvas:HTMLCanvasElement}>>}
   */
async _captureAllPages() {
    const wb = this.$.whiteboard;
    this._saveCurrentPage();

    const origem = this.board.currentPageIndex;
    const transicao = wb.style.transition;
    const capturas = [];

    wb.style.transition = 'none';
    try {
      for (let i = 0; i < this.board.pages.length; i++) {
        await this._switchPage(i);
        const canvas = await this._capturePage();
        capturas.push({ index: i, canvas });
        if (this.board.pages.length > 1) {
          this.showToast(`Exportando ${i + 1}/${this.board.pages.length}...`);
        }
      }
    } finally {
      wb.style.transition = transicao;
      // A volta e sempre feita, mesmo com falha no meio do percurso: sem
      // isso a lousa ficaria mostrando outra pagina, com a orientacao
      // dela, sem o aviso de que algo deu errado. A `_switchPage` tambem
      // recoloca a orientacao global a partir de `page.orientation`.
      // A selecao NAO volta: `_switchPage` chama `board.clear()`, que
      // descarta os objetos, entao um `selectObject` aqui religaria uma
      // referencia que o Model ja reconstruiu -- o mesmo estado que o
      // usuario ve se passar pelas paginas a mao.
      this._switchPage(origem);
    }
    return capturas;
  }

  /**
   * Medidas do papel, em pontos PDF, a partir da captura.
   *
   * O papel e a propria imagem, nao um formato A4 escolhido a mao: com a
   * pagina em 794 x 1123 px a 96 dpi isso ja e A4, e derivar as duas
   * medidas da captura mantem a proporcao por construcao, sem depender do
   * `orientation` -- que o jsPDF normaliza trocando os eixos do array, e
   * trocaria a folha se as medidas nao batessem com ele.
   *
   * @param {HTMLCanvasElement} canvas
   * @returns {{width:number, height:number, orientation:string}}
   */
  _pageSize(canvas) {
    const k = BoardController.PX_TO_PT / BoardController.EXPORT_SCALE;
    const width = canvas.width * k;
    const height = canvas.height * k;
    return {
      width,
      height,
      orientation: width > height ? 'landscape' : 'portrait'
    };
  }

  exportPDF() {
    this.showToast('Gerando PDF...');
    this._captureAllPages()
      .then((capturas) => {
        const { jsPDF } = window.jspdf;
        const primeira = this._pageSize(capturas[0].canvas);
        // `compress: true` nao e opcional: o jsPDF grava as imagens SEM
        // compressao por padrao, ou seja, o RGB cru -- 10,7 MB por pagina
        // A4 em 2x -- mais uma copia em escala de cinza do canal alfa,
        // que o `toDataURL` sempre emite e que aqui e inteiramente opaco.
        // Medido em 4 paginas: 54,4 MB sem, 0,08 MB com. Sem isso um
        // projeto de 30 paginas passaria de 500 MB e o navegador recusa
        // a abrir. E nao custa qualidade: e Flate, lossless.
        const pdf = new jsPDF({
          orientation: primeira.orientation,
          unit: 'pt',
          format: [primeira.width, primeira.height],
          compress: true
        });
        pdf.addImage(capturas[0].canvas.toDataURL('image/png'), 'PNG', 0, 0, primeira.width, primeira.height);
        // `addImage` escreve na folha ATUAL e `addPage` e o que avanca a
        // folha. Criar todas as folhas primeiro e so depois gravar as
        // imagens empilha as N imagens em 0,0 na ultima -- foi assim que
        // a primeira pagina saia em branco.
        for (let i = 1; i < capturas.length; i++) {
          const s = this._pageSize(capturas[i].canvas);
          pdf.addPage([s.width, s.height], s.orientation);
          pdf.addImage(capturas[i].canvas.toDataURL('image/png'), 'PNG', 0, 0, s.width, s.height);
        }
        pdf.save('lousa-virtual.pdf');
        this.showToast('PDF exportado!');
        this._closeExport();
      })
      .catch(err => this._exportError(err));
  }

  exportPNG() {
    this.showToast('Gerando PNG...');
    this._captureAllPages()
      .then((capturas) => {
        // PNG nao tem paginas: as N folhas vaem num ZIP store. Sem
        // compressao de proposito -- o conteudo ja e PNG, que e deflate, e
        // recomprimir nao ganharia nada e custaria CPU e memoria.
        const arquivos = capturas.map(({ index, canvas }) => ({
          nome: `pagina-${index + 1}.png`,
          dados: this._dataURLToBytes(canvas.toDataURL('image/png'))
        }));
        // Uma pagina so nao ganha envelope: seria um zip com um unico
        // arquivo, que e so um obstaculo entre o usuario e a imagem.
        if (arquivos.length === 1) {
          this._download(this._blobFromBytes(arquivos[0].dados), 'lousa-virtual.png');
          this.showToast('PNG exportado!');
        } else {
          this._download(this._buildZip(arquivos), 'lousa-virtual.zip');
          this.showToast(`${arquivos.length} PNGs exportados!`);
        }
        this._closeExport();
      })
      .catch(err => this._exportError(err));
  }

  _closeExport() {
    this.$.exportModal.classList.add('hidden');
  }

  /**
   * Falha no meio do percurso.
   *
   * Antes o export era uma captura so e o `then` era o fim da historia;
   * agora sao N capturas e qualquer uma delas pode estourar, e o
   * `finally` de `_captureAllPages` ja devolveu a lousa para a pagina
   * original. Sem este `catch` o modal ficaria aberto para sempre e a
   * unica pista seria um `Unhandled rejection` no console -- o usuario
   * achando que o app travou.
   */
  _exportError(err) {
    console.error('Falha ao exportar:', err);
    this.showToast('Nao foi possivel exportar');
    this._closeExport();
  }

  /**
   * Monta o ZIP "store" do export de PNG. A implementacao vive no
   * `ZipStore`, compartilhado com o modo Design.
   *
   * @param {Array<{nome:string, dados:Uint8Array}>} arquivos
   * @returns {Blob}
   */
  _buildZip(arquivos) {
    return ZipStore.buildZip(arquivos);
  }

  /** Converte um `dataURL` de PNG nos bytes que o ZIP store precisa. */
  _dataURLToBytes(dataURL) {
    const bin = atob(dataURL.split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  /** Envolve bytes ja crus no Blob do tipo pedido. */
  _blobFromBytes(bytes, type = 'image/png') {
    return new Blob([bytes], { type });
  }

  /** Dispara o download de um Blob e libera a URL depois do clique. */
  _download(blob, nome) {
    const link = document.createElement('a');
    link.download = nome;
    link.href = URL.createObjectURL(blob);
    link.click();
    // Revogar na hora cancelaria o download em alguns navegadores; o
    // timeout so garante que a URL nao vaza pelo tempo da aba aberta.
    setTimeout(() => URL.revokeObjectURL(link.href), 60000);
  }

  exportJSON() {
    this._saveCurrentPage();
    const data = {
      version: BoardController.PROJECT_VERSION,
      pages: this.board.pages,
      library: this.board.library
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    this._download(blob, 'lousa-virtual.json');
    this.showToast('Projeto salvo!');
    this.$.exportModal.classList.add('hidden');
  }

  /**
   * Abre um projeto `.json` exportado pela propria lousa.
   *
   * O arquivo substitui `board.pages` e `board.library` inteiras, e o
   * estado novo vai para o `localStorage` no `_switchPage` seguinte: o
   * trabalho em aberto some sem volta. Por isso a troca e confirmada.
   * A confirmacao mora aqui, e nao no botao, para valer tambem para o
   * arrasto-e-solta -- que tambem substituia a lousa, em silencio.
   *
   * @param {File} file
   */
  importJSON(file) {
    const reader = new FileReader();
    reader.onerror = () => this.showToast('Nao foi possivel ler o arquivo');
    reader.onload = (e) => {
      let data;
      try {
        data = JSON.parse(e.target.result);
      } catch {
        this.showToast('Arquivo invalido');
        return;
      }

      const motivo = this._projectError(data);
      if (motivo) {
        this.showToast(motivo);
        return;
      }

      const total = data.pages.length;
      const aviso = 'Abrir "' + file.name + '" (' + (total === 1 ? '1 pagina' : total + ' paginas') + ')?'
        + '\n\nA lousa atual sera substituida e nao podera ser recuperada.';
      if (!window.confirm(aviso)) return;

      this._openProject(data);
      this.showToast('Projeto carregado: ' + total + (total === 1 ? ' pagina' : ' paginas'));
    };
    reader.readAsText(file);
  }

  /**
   * Confere se o JSON tem o formato de um projeto da lousa.
   *
   * O `accept` do input e um filtro de conveniencia para quem escolhe o
   * arquivo, nao uma garantia -- o arrasto-e-solta traz o que vier -- e o
   * `JSON.parse` aceita qualquer objeto. Sem esta checagem, um `.json`
   * valido e estraneo (o `package.json` de outro projeto, por exemplo)
   * era aceito em silencio e deixava a lousa vazia, sem aviso nenhum.
   *
   * @param {*} data
   * @returns {string|null} motivo da recusa, ou null se pode abrir
   */
  _projectError(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data))
      return 'Arquivo invalido';
    if (typeof data.version === 'number' && data.version > BoardController.PROJECT_VERSION)
      return 'Projeto de versao mais nova que este programa';
    if (!Array.isArray(data.pages) || data.pages.length === 0)
      return 'O arquivo nao e um projeto da lousa';
    return null;
  }

  /**
   * Troca a lousa atual pelo projeto lido do arquivo.
   *
   * O `currentPageIndex = -1` antes do `_switchPage` e o que impede a
   * pagina importada de ser sobrescrita: `_switchPage` comeca salvando a
   * pagina corrente, e `board.currentPage` com indice -1 e null, entao
   * essa gravacao nao acontece. Sem ele, o `_saveCurrentPage` serializava
   * a tinta e os objetos da lousa ANTIGA por cima da pagina 1 recem
   * lida -- o projeto abria mostrando o conteudo que estava na tela.
   *
   * @param {{pages: Array<object>, library?: Array<object>}} data
   */
  _openProject(data) {
    this.board.pages = data.pages.map((page, i) => this._normalizePage(page, i));
    this.board.library = Array.isArray(data.library) ? data.library : [];
    this.board.currentPageIndex = -1;
    this.renderLibrary();
    this._switchPage(0);
  }

  /**
   * Completa uma pagina vinda do arquivo.
   *
   * O `_switchPage` le `page.elements` e `page.orientation` sem guarda, e
   * o `drawBackground` espera um `dataURL` (o `null` e tratado). Uma
   * pagina sem esses campos -- de um arquivo editado a mao, ou de um
   * export anterior a algum campo existir -- lancaria dentro da troca de
   * pagina e deixaria a lousa pela metade. Pagina que nem for objeto e
   * descartada e devolvida como vazia, para o arquivo inteiro continuar
   * abrindo.
   *
   * @param {*} page
   * @param {number} index
   * @returns {object}
   */
  _normalizePage(page, index) {
    const base = page && typeof page === 'object' && !Array.isArray(page) ? page : {};
    const elements = Array.isArray(base.elements)
      ? base.elements.filter(el => el && typeof el === 'object')
      : [];
    return {
      ...base,
      name: typeof base.name === 'string' ? base.name : `Pagina ${index + 1}`,
      drawingData: typeof base.drawingData === 'string' ? base.drawingData : null,
      elements,
      // `objects` e o mesmo array de `elements`, como em `_saveCurrentPage`.
      objects: elements,
      orientation: base.orientation === 'landscape' ? 'landscape' : 'portrait'
    };
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
