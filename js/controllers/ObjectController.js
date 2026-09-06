/* ============================================
   LOUSA VIRTUAL - ObjectController
   ============================================
   Controller responsavel pela criacao, edicao e
   remocao de objetos na lousa (equacoes, textos,
   imagens e graficos), alem da biblioteca de
   equacoes salvas.
   ============================================ */

import { MathObject } from '../models/MathObject.js';

export class ObjectController {
  constructor(board, boardView, mathEditor, toolbox) {
    this.board = board;
    this.boardView = boardView;
    this.mathEditor = mathEditor;
    this.toolbox = toolbox; // { $, graphModal }

    // Callbacks injetados pelo BoardController
    this.onCommit = null; // () => void -> salvar historico
    this.onPersist = null; // () => void -> salvar estado

    this.graphCtx = null;
    this.initGraph();
  }

  /* ---- Criacao de objetos ---- */
  /**
   * Cria uma equacao LaTeX na posicao informada.
   * @param {string} latex
   * @param {number} [x]
   * @param {number} [y]
   */
  createEquation(latex, x = 100, y = 100) {
    const obj = this.board.createMath(latex, x, y);
    const el = this.boardView.addObjectElement(obj);
    if (this.onCommit) this.onCommit();
    return obj;
  }

  /**
   * Cria um elemento de texto editavel.
   * @param {number} x
   * @param {number} y
   */
  createText(x = 100, y = 100) {
    const obj = this.board.createText(x, y);
    const el = this.boardView.addObjectElement(obj);
    el.contentEditable = 'true';
    el.focus();
    if (this.onCommit) this.onCommit();
    return obj;
  }

  /**
   * Cria um elemento de imagem (ou grafico) na lousa.
   * @param {string} src
   * @param {boolean} [isGraph]
   * @param {number} [x]
   * @param {number} [y]
   */
  createImage(src, isGraph = false, x = 100, y = 100) {
    const obj = this.board.createImage(src, x, y, isGraph);
    this.boardView.addObjectElement(obj);
    if (this.onCommit) this.onCommit();
    return obj;
  }

  /**
   * Abre o modal de equacao para insercao de nova equacao.
   */
  openEquationModal(existing = null) {
    if (existing instanceof MathObject) {
      // Edicao de equacao existente
      this.mathEditor.open(existing.latex, (newLatex) => {
        existing.setLatex(newLatex);
        if (this.onCommit) this.onCommit();
        if (this.onPersist) this.onPersist();
      });
    } else {
      // Nova equacao
      this.mathEditor.open('', (latex) => this.createEquation(latex));
    }
  }

  /* ---- Edicao / Remocao ---- */
  handleDeleteSelected() {
    const obj = this.board.selectedObject;
    if (!obj) return;
    this.boardView.removeObjectElement(obj);
    this.board.removeObject(obj);
    if (this.onCommit) this.onCommit();
  }

  /* ---- Graficos ---- */
  initGraph() {
    const $ = this.toolbox.$;
    this.graphCanvas = $.graphPreview;
    if (this.graphCanvas) {
      this.graphCtx = this.graphCanvas.getContext('2d');
    }
    if ($.graphFunction) $.graphFunction.addEventListener('input', () => this.drawGraphPreview());
  }

  openGraphModal() {
    this.drawGraphPreview();
    this.toolbox.$.graphModal.classList.remove('hidden');
  }

  insertGraph() {
    this.drawGraphPreview();
    if (!this.graphCanvas) return;
    this.createImage(this.graphCanvas.toDataURL(), true, 100, 100);
    this.toolbox.$.graphModal.classList.add('hidden');
  }

  drawGraphPreview() {
    const $ = this.toolbox.$;
    const canvas = this.graphCanvas;
    const gctx = this.graphCtx;
    if (!canvas) return;

    const w = canvas.width;
    const h = canvas.height;
    gctx.clearRect(0, 0, w, h);

    const funcStr = $.graphFunction.value || 'Math.sin(x)';
    const xmin = parseFloat($.graphXmin.value) || -10;
    const xmax = parseFloat($.graphXmax.value) || 10;
    const ymin = parseFloat($.graphYmin.value) || -10;
    const ymax = parseFloat($.graphYmax.value) || 10;
    const color = $.graphColor.value;
    const lineW = parseInt($.graphWidth.value, 10) || 2;

    gctx.fillStyle = '#ffffff';
    gctx.fillRect(0, 0, w, h);
    const xScale = w / (xmax - xmin);
    const yScale = h / (ymax - ymin);
    const toScreenX = (x) => (x - xmin) * xScale;
    const toScreenY = (y) => h - (y - ymin) * yScale;

    // Eixos
    gctx.strokeStyle = '#999';
    gctx.lineWidth = 1;
    if (ymin <= 0 && ymax >= 0) {
      const y0 = toScreenY(0);
      gctx.beginPath(); gctx.moveTo(0, y0); gctx.lineTo(w, y0); gctx.stroke();
    }
    if (xmin <= 0 && xmax >= 0) {
      const x0 = toScreenX(0);
      gctx.beginPath(); gctx.moveTo(x0, 0); gctx.lineTo(x0, h); gctx.stroke();
    }

    // Grade
    gctx.strokeStyle = '#eee';
    gctx.lineWidth = 0.5;
    const stepX = Math.ceil((xmax - xmin) / 20);
    for (let x = Math.ceil(xmin); x <= xmax; x += stepX) {
      const sx = toScreenX(x);
      gctx.beginPath(); gctx.moveTo(sx, 0); gctx.lineTo(sx, h); gctx.stroke();
      gctx.fillStyle = '#666'; gctx.font = '10px sans-serif';
      gctx.fillText(x, sx + 2, toScreenY(0) - 4);
    }
    const stepY = Math.ceil((ymax - ymin) / 15);
    for (let y = Math.ceil(ymin); y <= ymax; y += stepY) {
      const sy = toScreenY(y);
      gctx.beginPath(); gctx.moveTo(0, sy); gctx.lineTo(w, sy); gctx.stroke();
      if (y !== 0) {
        gctx.fillStyle = '#666'; gctx.font = '10px sans-serif';
        gctx.fillText(y, toScreenX(0) + 4, sy - 2);
      }
    }

    // Plot da funcao
    try {
      const fn = new Function('x', 'return ' + funcStr);
      gctx.strokeStyle = color;
      gctx.lineWidth = lineW;
      gctx.beginPath();
      let started = false;
      for (let px = 0; px < w; px++) {
        const x = xmin + (px / w) * (xmax - xmin);
        let y;
        try { y = fn(x); } catch { continue; }
        if (!isFinite(y) || Math.abs(y) > 1e6) { started = false; continue; }
        const sy = toScreenY(y);
        if (!started) { gctx.moveTo(px, sy); started = true; }
        else gctx.lineTo(px, sy);
      }
      gctx.stroke();
    } catch (err) {
      gctx.fillStyle = '#e53935';
      gctx.font = '14px sans-serif';
      gctx.fillText('Funcao invalida', 20, 30);
    }
  }

  /* ---- Biblioteca de equacoes ---- */
  /**
   * Salva uma equacao na biblioteca.
   * @param {string} latex
   */
  saveToLibrary(latex) {
    if (!latex) return;
    this.board.library.push({ id: Date.now(), latex, label: latex.substring(0, 40) });
    if (this.onPersist) this.onPersist();
  }

  removeFromLibrary(id) {
    this.board.library = this.board.library.filter(l => l.id !== id);
    if (this.onPersist) this.onPersist();
  }

  /** Filtra biblioteca por busca. */
  searchLibrary(query) {
    const q = (query || '').toLowerCase();
    return this.board.library.filter(item => item.latex.toLowerCase().includes(q));
  }
}
