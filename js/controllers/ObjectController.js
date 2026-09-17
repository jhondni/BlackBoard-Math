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
    this.onLibraryChange = null; // () => void -> re-renderizar biblioteca

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
   * Cria um elemento de texto editavel com as dimensoes da caixa.
   * @param {number} x
   * @param {number} y
   * @param {number} [width]
   * @param {number} [height]
   */
  createText(x = 100, y = 100, width, height) {
    const obj = this.board.createText(x, y, width, height);
    this.boardView.addObjectElement(obj);
    this.wireTextEditing(obj, obj.contentEl);
    this.focusText(obj);
    if (this.onCommit) this.onCommit();
    return obj;
  }

  /**
   * Foca um texto existente para edicao, posicionando o cursor no final.
   * @param {TextObject} obj
   */
  focusText(obj) {
    if (!obj || obj.type !== 'text') return;
    const el = obj.contentEl || obj.dom;
    if (!el) return;
    el.contentEditable = 'true';
    this.board.selectObject(obj);
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /**
   * Conecta os eventos de edicao (digitar, blur e teclas) ao texto.
   * @param {TextObject} obj
   * @param {HTMLElement} el
   */
  wireTextEditing(obj, el) {
    if (el.dataset.textWired) return;
    el.dataset.textWired = '1';

    el.addEventListener('input', () => {
      obj.text = el.textContent;
      obj.content = el.textContent;
    });

    el.addEventListener('blur', () => this._finishTextEdit(obj, el));

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        el.blur();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        el.blur();
        return;
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && !el.textContent.trim()) {
        e.preventDefault();
        this.removeObject(obj);
      }
    });
  }

  /**
   * Finaliza a edicao: remove textos vazios, aplica o conteudo no modelo,
   * redimensiona a caixa e registra no historico.
   * @param {TextObject} obj
   * @param {HTMLElement} el
   */
  _finishTextEdit(obj, el) {
    const text = (el.textContent || '').trim();
    if (!text) {
      this.removeObject(obj);
      return;
    }
    obj.text = el.textContent;
    obj.content = el.textContent;
    if (this.onCommit) this.onCommit();
  }

  /**
   * Remove um objeto especifico da lousa.
   * @param {object} obj
   */
  removeObject(obj) {
    if (!obj) return;
    this.boardView.removeObjectElement(obj);
    this.board.removeObject(obj);
    if (this.onCommit) this.onCommit();
  }

  /**
   * Cria um elemento de imagem (ou grafico) na lousa.
   * @param {string} src
   * @param {boolean} [isGraph]
   * @param {number} [x]
   * @param {number} [y]
   */
  createImage(src, isGraph = false, x = 100, y = 100, width, height) {
    const obj = this.board.createImage(src, x, y, isGraph);
    if (width) obj.width = width;
    if (height) obj.height = height;
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
      this.mathEditor.open('', (latex) => {
        this.createEquation(latex);
        this.saveToLibrary(latex);
      });
    }
  }

  /* ---- Edicao / Remocao ---- */
  handleDeleteSelected() {
    this.removeObject(this.board.selectedObject);
  }

  /* ---- Graficos ---- */
  initGraph() {
    const $ = this.toolbox.$;
    this.graphCanvas = $.graphPreview;
    if (this.graphCanvas) {
      this.graphCtx = this.graphCanvas.getContext('2d');
    }
    // Atualiza o preview ao vivo para qualquer ajuste do grafico.
    const controls = [
      $.graphFunction, $.graphXmin, $.graphXmax,
      $.graphYmin, $.graphYmax, $.graphColor, $.graphWidth
    ];
    controls.forEach((control) => {
      if (control) control.addEventListener('input', () => this.drawGraphPreview());
    });
  }

  openGraphModal() {
    this.drawGraphPreview();
    this.toolbox.$.graphModal.classList.remove('hidden');
    const fn = this.toolbox.$.graphFunction;
    if (fn) {
      fn.focus();
      fn.select();
    }
  }

  insertGraph() {
    this.drawGraphPreview();
    if (!this.graphCanvas) return null;

    // Mantem a proporcao do preview ao inserir na lousa.
    const srcW = this.graphCanvas.width;
    const srcH = this.graphCanvas.height;
    const width = 400;
    const height = Math.round(width * (srcH / srcW));

    const obj = this.createImage(this.graphCanvas.toDataURL('image/png'), true, 100, 100, width, height);
    this.toolbox.$.graphModal.classList.add('hidden');
    return obj;
  }

  drawGraphPreview() {
    const $ = this.toolbox.$;
    const canvas = this.graphCanvas;
    const gctx = this.graphCtx;
    if (!canvas || !gctx) return;

    const w = canvas.width;
    const h = canvas.height;
    gctx.clearRect(0, 0, w, h);

    const funcStr = ($.graphFunction.value || 'Math.sin(x)').trim();
    let xmin = parseFloat($.graphXmin.value);
    let xmax = parseFloat($.graphXmax.value);
    let ymin = parseFloat($.graphYmin.value);
    let ymax = parseFloat($.graphYmax.value);
    if (!isFinite(xmin)) xmin = -10;
    if (!isFinite(xmax)) xmax = 10;
    if (!isFinite(ymin)) ymin = -10;
    if (!isFinite(ymax)) ymax = 10;
    if (xmax <= xmin) xmax = xmin + 1;
    if (ymax <= ymin) ymax = ymin + 1;

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
    gctx.fillStyle = '#666';
    gctx.font = '10px sans-serif';
    const axisY = (ymin <= 0 && ymax >= 0) ? toScreenY(0) : h;
    const axisX = (xmin <= 0 && xmax >= 0) ? toScreenX(0) : 0;
    const stepX = Math.ceil((xmax - xmin) / 20) || 1;
    for (let x = Math.ceil(xmin); x <= xmax; x += stepX) {
      const sx = toScreenX(x);
      gctx.beginPath(); gctx.moveTo(sx, 0); gctx.lineTo(sx, h); gctx.stroke();
      if (x !== 0) gctx.fillText(x, sx + 2, Math.min(h - 2, axisY + 11));
    }
    const stepY = Math.ceil((ymax - ymin) / 15) || 1;
    for (let y = Math.ceil(ymin); y <= ymax; y += stepY) {
      const sy = toScreenY(y);
      gctx.beginPath(); gctx.moveTo(0, sy); gctx.lineTo(w, sy); gctx.stroke();
      if (y !== 0) gctx.fillText(y, Math.min(w - 16, axisX + 4), sy - 2);
    }

    // Plot da funcao
    const { fn, error } = this._computeFunction(funcStr);
    if (error) {
      gctx.fillStyle = '#e53935';
      gctx.font = '14px sans-serif';
      gctx.fillText(error, 20, 30);
      return;
    }
    if (fn) {
      gctx.strokeStyle = color;
      gctx.lineWidth = lineW;
      gctx.lineJoin = 'round';
      gctx.beginPath();
      let started = false;
      let plotted = 0;
      for (let px = 0; px <= w; px++) {
        const x = xmin + (px / w) * (xmax - xmin);
        let y;
        try { y = fn(x); } catch { started = false; continue; }
        if (typeof y !== 'number' || !isFinite(y)) { started = false; continue; }
        const sy = toScreenY(y);
        if (!started) { gctx.moveTo(px, sy); started = true; }
        else gctx.lineTo(px, sy);
        plotted++;
      }
      gctx.stroke();
      if (plotted === 0) {
        gctx.fillStyle = '#e53935';
        gctx.font = '14px sans-serif';
        gctx.fillText('Sem valores no intervalo', 20, 30);
      }
    }
  }

  /**
   * Converte uma entrada de funcao/equacao em uma funcao JS f(x).
   * Aceita JavaScript puro (Math.*) ou notacao matematica simples
   * (x^2, 3x, 3.x, sen(x), pi) e equacoes com '=' (reduzidas a y=f(x)).
   * @param {string} input
   * @returns {{ fn: Function|null, error: string|null }}
   */
  _computeFunction(input) {
    const raw = (input || '').trim();
    if (!raw) return { fn: null, error: null };

    // Equacao: reduz para uma unica expressao f(x).
    let expr = raw;
    if (expr.includes('=')) {
      const parts = expr.split('=');
      const lhs = (parts.shift() || '').trim();
      const rhs = parts.join('=').trim();
      if (lhs.toLowerCase() === 'y') expr = rhs;
      else if (rhs === '0' || rhs === '') expr = lhs;
      else expr = '(' + lhs + ') - (' + rhs + ')';
    }

    // JavaScript puro quando usa Math.*; caso contrario, traduz a notacao.
    if (!/Math\./.test(expr)) expr = this._toMathExpression(expr);

    try {
      const fn = new Function('x', 'with (Math) { return (' + expr + '); }');
      fn(1);
      return { fn, error: null };
    } catch (err) {
      return { fn: null, error: 'Expressao invalida' };
    }
  }

  /**
   * Traduz notacao matematica comum para uma expressao JavaScript.
   * @param {string} expr
   * @returns {string}
   */
  _toMathExpression(expr) {
    let out = expr;
    out = out.replace(/\^/g, '**');
    out = out.replace(/\bsen\b/gi, 'sin');
    out = out.replace(/\bln\b/gi, 'log');
    // Multiplicacao por ponto, sem confundir com decimal (ex.: 3.5).
    out = out.replace(/([a-zA-Z)])\s*\.\s*([a-zA-Z0-9(])/g, '$1*$2');
    out = out.replace(/(\d)\s*\.\s*([a-zA-Z(])/g, '$1*$2');
    // Constante pi.
    out = out.replace(/\bpi\b/gi, 'PI');
    // Multiplicacao implicita: 3x, 3(x+1), (x+1)(x-1), 2sin(x), x(x+1).
    out = out.replace(/(\d)\s*([a-zA-Z(])/g, '$1*$2');
    out = out.replace(/(\))\s*([a-zA-Z0-9(])/g, '$1*$2');
    out = out.replace(/\bx\s*\(/g, 'x*(');
    return out;
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
    if (this.onLibraryChange) this.onLibraryChange();
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
