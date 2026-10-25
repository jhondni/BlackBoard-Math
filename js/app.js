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
import { AuthController } from './controllers/AuthController.js';

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
    authBtn: byId('auth-btn'),

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
  const authController = new AuthController();
  const boardController = new BoardController(
    board, boardView, toolbar, mathEditor,
    toolController, mouseController, objectController, selectionView, ui,
    authController
  );

  /* ---- Inicializacao ---- */
  mathEditor.init();
  toolbar.init();
  toolController.init();
  boardController.init();

  // Trocar de ferramenta tira o anel do raio: so caneta e borracha tem
  // guia, e ele nao pode ficar orfao na tela.
  toolController.onToolChange = () => mouseController.hideDrawGuide();

  // Inicializar auth e botões
  authController.init().then(({ user }) => {
    const authBtn = ui.authBtn;
    const saveJsonCloudBtn = document.getElementById('save-json-cloud-btn');
    const loadJsonCloudBtn = document.getElementById('load-json-cloud-btn');
    if (authBtn) {
      if (user) {
        authBtn.title = `Logado: ${user.email}`;
        authBtn.onclick = async () => {
          if (confirm('Deseja sair da conta?')) {
            await authController.signOut();
            window.location.reload();
          }
        };
        if (saveJsonCloudBtn) {
          saveJsonCloudBtn.style.display = 'flex';
          saveJsonCloudBtn.onclick = async () => {
            const title = prompt('Nome do projeto para salvar no Supabase:');
            if (!title) return;
            try {
              const data = boardController.exportProjectJSON();
              await authController.saveBoard(title, data);
              alert('JSON salvo no Supabase com sucesso!');
            } catch (e) {
              alert('Erro ao salvar: ' + e.message);
            }
          };
        }
        if (loadJsonCloudBtn) {
          loadJsonCloudBtn.style.display = 'flex';
          loadJsonCloudBtn.onclick = () => {
            if (typeof boardController.openCloudFilesModal === 'function') {
              boardController.openCloudFilesModal();
            } else {
              alert('Função não disponível');
            }
          };
        }
      } else {
        authBtn.title = 'Fazer login';
        authBtn.onclick = () => {
          window.location.href = 'login.html';
        };
        if (saveJsonCloudBtn) saveJsonCloudBtn.style.display = 'none';
        if (loadJsonCloudBtn) loadJsonCloudBtn.style.display = 'none';
      }
    }
  });

  // Disponibiliza o controller no escopo global para debug.
  window.__lousa = { board, boardController, authController };
})();
