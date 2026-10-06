/* ============================================
   LOUSA VIRTUAL - App Entry Point (ES Module)
   ============================================
   Instancia o modelo, as views e os controllers
   seguindo a arquitetura MVC.
   ============================================ */

import { Board } from './models/Board.js';
import { BoardView } from './views/BoardView.js';
import { ToolbarView } from './views/ToolbarView.js';
import { MathEditorView } from './views/MathEditorView.js';
import { SelectionView } from './views/SelectionView.js';
import { MathRenderer } from './renderers/MathRenderer.js';
import { BoardController } from './controllers/BoardController.js';
import { ToolController } from './controllers/ToolController.js';
import { ObjectController } from './controllers/ObjectController.js';
import { MouseController } from './controllers/MouseController.js';
import { UIDesign } from './models/UIDesign.js';
import { UIDesignView } from './views/UIDesignView.js';
import { UIDesignToolbarView } from './views/UIDesignToolbarView.js';
import { UILayerPanelView } from './views/UILayerPanelView.js';
import { UIPropertiesView } from './views/UIPropertiesView.js';
import { UIDesignController } from './controllers/UIDesignController.js';

(function () {
  'use strict';

  /* ---- Referencias DOM centralizadas ---- */
  const byId = (id) => document.getElementById(id);

  // Chaves usadas pelas views/controllers (nomes coerentes).
  const ui = {
    /* BoardView (elements) */
    whiteboard: byId('whiteboard'),
    canvas: byId('drawing-canvas'),
    elementsLayer: byId('elements-layer'),
    drawGuide: byId('draw-guide'),
    zoomLevel: byId('zoom-level'),

    /* Toolbar / controls */
    penColor: byId('pen-color'),
    penSize: byId('pen-size'),
    undoBtn: byId('undo-btn'),
    redoBtn: byId('redo-btn'),
    clearPageBtn: byId('clear-page-btn'),
    addPageBtn: byId('add-page-btn'),
    libraryBtn: byId('library-btn'),
    closeLibraryBtn: byId('close-library-btn'),
    darkModeBtn: byId('dark-mode-btn'),
    landscapeBtn: byId('landscape-btn'),
    helpBtn: byId('help-btn'),
    importBtn: byId('import-btn'),
    exportBtn: byId('export-btn'),
    zoomInBtn: byId('zoom-in-btn'),
    zoomOutBtn: byId('zoom-out-btn'),

    /* Modais */
    equationModal: byId('equation-modal'),
    latexInput: byId('latex-input'),
    equationPreview: byId('equation-preview'),
    insertEquationBtn: byId('insert-equation-btn'),

    graphModal: byId('graph-modal'),
    graphFunction: byId('graph-function'),
    graphXmin: byId('graph-xmin'),
    graphXmax: byId('graph-xmax'),
    graphYmin: byId('graph-ymin'),
    graphYmax: byId('graph-ymax'),
    graphColor: byId('graph-color'),
    graphWidth: byId('graph-width'),
    graphPreview: byId('graph-preview'),
    insertGraphBtn: byId('insert-graph-btn'),
    graphModalTitle: byId('graph-modal-title'),

    helpModal: byId('help-modal'),
    exportModal: byId('export-modal'),
    exportPdfBtn: byId('export-pdf-btn'),
    exportPngBtn: byId('export-png-btn'),
    exportJsonBtn: byId('export-json-btn'),

    /* Sidebars / listas */
    pagesSidebar: byId('pages-sidebar'),
    toggleSidebarBtn: byId('toggle-sidebar-btn'),
    sidebarTab: byId('sidebar-tab'),
    pagesList: byId('pages-list'),
    librarySidebar: byId('library-sidebar'),
    librarySearchInput: byId('library-search-input'),
    libraryList: byId('library-list'),
    saveToLibraryBtn: byId('save-to-library-btn'),

    /* Modo Design (UI/UX Designer) */
    designContainer: byId('design-container'),
    designBackBtn: byId('design-back-btn'),
    designToolbar: byId('design-toolbar'),
    designSvg: byId('design-svg'),
    designLayers: byId('design-layers'),
    designProperties: byId('design-properties'),

    /* Diversos */
    toast: byId('toast'),
    workspace: byId('workspace'),
    imageUpload: byId('image-upload'),
    jsonUpload: byId('json-upload')
  };

  /* ---- Instancia o modelo ---- */
  const board = new Board();

  /* ---- Renderers ---- */
  const mathRenderer = new MathRenderer();

  /* ---- Views ---- */
  const boardView = new BoardView(board, ui);
  boardView.mathRenderer = mathRenderer;

  const toolbar = new ToolbarView(board, ui);
  const mathEditor = new MathEditorView(ui);
  const selectionView = new SelectionView(board, boardView);
  boardView.selectionView = selectionView;
  selectionView.getCurrentTool = () => toolbar.currentTool;

  /* ---- Controllers ---- */
  const objectController = new ObjectController(board, boardView, mathEditor, {
    $: ui,
    graphModal: ui.graphModal
  });

  const mouseController = new MouseController(board, boardView, toolbar, objectController);
  const toolController = new ToolController(board, boardView, toolbar);
  const boardController = new BoardController(
    board, boardView, toolbar, mathEditor,
    toolController, mouseController, objectController, selectionView, ui
  );

  /* ---- Modulo UI/UX Designer ----
     Documento separado: o `UIDesign` nao conhece a `Board`, e o
     arquivo `.uidesign.json` tambem e separado do projeto da lousa. */
  const uiDesign = new UIDesign();
  const uiDesignToolbar = new UIDesignToolbarView(uiDesign, ui);
  const uiDesignView = new UIDesignView(uiDesign, ui);
  const uiLayerPanel = new UILayerPanelView(uiDesign, ui);
  const uiProperties = new UIPropertiesView(uiDesign, ui);
  const uiDesignController = new UIDesignController(uiDesign, {
    toolbar: uiDesignToolbar,
    designView: uiDesignView,
    layers: uiLayerPanel,
    properties: uiProperties
  }, ui);

  /* ---- Inicializacao ---- */
  mathEditor.init();
  toolbar.init();
  toolController.init();
  boardController.init();

  // Cada view se monta antes do controller: e o `init()` dele que ja
  // repinta, e as views devolvem `false` em vez de estourar quando o
  // HTML do modo Design nao existe.
  uiDesignToolbar.init();
  uiDesignView.init();
  uiLayerPanel.init();
  uiProperties.init();
  uiDesignController.init();

  // Trocar de ferramenta tira o anel do raio: so caneta e borracha tem
  // guia, e ele nao pode ficar orfao na tela.
  toolController.onToolChange = () => mouseController.hideDrawGuide();

  // O botao da toolbar so troca o modo; e a lousa que para de reagir ao
  // teclado enquanto o modo Design esta aberto.
  toolController.onRequestUXDesign = () => uiDesignController.toggleDesignMode();
  toolController.isUXDesignActive = () => uiDesignController.active;

  // Disponibiliza o controller no escopo global para debug.
  window.__lousa = {
    board,
    boardController,
    uiDesign,
    uiDesignController
  };
})();
