/* ============================================
   LOUSA VIRTUAL - ObjectController
   ============================================
   Controller responsavel pela criacao, edicao e
   remocao de objetos na lousa (equacoes, textos,
   imagens e graficos), alem da biblioteca de
   equacoes salvas.
   ============================================ */

import { MathObject } from '../models/MathObject.js';
import { ImageObject } from '../models/ImageObject.js';

export class ObjectController {
  /**
   * Dimensao de referencia do canvas de preview do modal. Todas as
   * medidas do grafico (fonte, espessura, deslocamento de rotulo) sao
   * escritas para esta largura e multiplicadas por `w / width` quando o
   * bitmap e produzido noutra resolucao.
   */
  static GRAPH_BASE = { width: 500, height: 350 };

  constructor(board, boardView, mathEditor, toolbox) {
    this.board = board;
    this.boardView = boardView;
    this.mathEditor = mathEditor;
    this.toolbox = toolbox; // { $, graphModal }

    // Callbacks injetados pelo BoardController
    this.onCommit = null; // () => void -> salvar historico
    this.onPersist = null; // () => void -> salvar estado
    this.onLibraryChange = null; // () => void -> re-renderizar biblioteca

    // Grafico em edicao, enquanto o modal de grafico estiver aberto.
    this._editingGraph = null;

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
  createImage(src, isGraph = false, x = 100, y = 100, width, height, opts = {}) {
    const obj = this.board.createImage(src, x, y, isGraph, { ...opts, width, height });
    this.boardView.addObjectElement(obj);
    if (this.onCommit) this.onCommit();
    return obj;
  }

  /**
   * Insere uma imagem a partir de um data URL/URL lendo a resolucao
   * nativa antes de decidir o tamanho da caixa. Sem isso a imagem
   * entraria espremida num tamanho fixo e o detalhe ja nasceria
   * perdido antes mesmo do zoom.
   *
   * @param {string} src
   * @param {number} [x]
   * @param {number} [y]
   * @returns {Promise<object|null>}
   */
  async insertImageFromSrc(src, x = 100, y = 100) {
    if (!src) return null;
    let naturalWidth = 0;
    let naturalHeight = 0;
    try {
      const img = await ImageObject.loadNaturalSize(src);
      naturalWidth = img.naturalWidth;
      naturalHeight = img.naturalHeight;
    } catch (_) {
      // Sem dimensoes: cai no tamanho padrao do ImageObject.
    }
    const box = ImageObject.fitSize(naturalWidth, naturalHeight);
    return this.createImage(src, false, x, y, box.width, box.height, {
      naturalWidth,
      naturalHeight,
      renderedScale: Math.min(naturalWidth / box.width, naturalHeight / box.height)
    });
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
      // A dimensao nativa do elemento e a referencia de pintura e a
      // dimensao a que o preview volta depois de exibir um bitmap grande.
      ObjectController.GRAPH_BASE = {
        width: this.graphCanvas.width || 500,
        height: this.graphCanvas.height || 350
      };
    }
    // Defaults do formulario, lidos uma vez. Editar um grafico escreve
    // nos mesmos campos que o `G` usa, entao sem isto o proximo `G`
    // abriria com o que ficou digitado na edicao anterior.
    this._graphDefaults = this._currentGraphSpec();
    // Atualiza o preview ao vivo para qualquer ajuste do grafico.
    const controls = [
      $.graphFunction, $.graphXmin, $.graphXmax,
      $.graphYmin, $.graphYmax, $.graphColor, $.graphWidth
    ];
    controls.forEach((control) => {
      if (control) control.addEventListener('input', () => this.drawGraphPreview());
    });
  }

  /**
   * Abre o modal de grafico.
   *
   * Sem argumento, e a criacao de um grafico novo: o formulario mostra os
   * valores padrao. Com um grafico existente, e edicao: o formulario e
   * preenchido com os parametros ja pintados e o rodape passa a falar em
   * salvar. O alvo fica guardado em `_editingGraph` para que `insertGraph`
   * atualize o objeto em vez de criar outro.
   *
   * @param {ImageObject} [existing] - Grafico a editar.
   */
  openGraphModal(existing = null) {
    const $ = this.toolbox.$;
    const isEditing = Boolean(existing && existing.type === 'graph');
    this._editingGraph = isEditing ? existing : null;

    if (isEditing) this._fillGraphForm(existing.graphSpec);
    else this._fillGraphForm(null); // 'G' sempre abre com os defaults
    this._setGraphModalMode(isEditing, !isEditing);

    this.drawGraphPreview(isEditing ? this._currentGraphSpec() : null);
    $.graphModal.classList.remove('hidden');

    const fn = $.graphFunction;
    if (fn) {
      // Editando, o cursor no comeco da funcao: normalmente e ela que muda.
      // Criando, seleciona o texto para trocar direto pelo teclado.
      if (isEditing) {
        fn.focus();
        fn.setSelectionRange(0, 0);
      } else {
        fn.focus();
        fn.select();
      }
    }
  }

  /**
   * Escreve os parametros de um grafico no formulario do modal.
   *
   * Graficos inseridos antes do `graphSpec` existir nao tem o que
   * reconstruir: o modal abre com os valores padrao e um aviso, em vez de
   * fingir que conhece o desenho.
   *
   * @param {object|null} spec
   */
  _fillGraphForm(spec) {
    const $ = this.toolbox.$;
    // Sem spec, os defaults originais do formulario (e nao o que estiver
    // nos campos agora): abrir um grafico legado nao pode herdar o que
    // o usuario digitou numa edicao anterior. O aviso no modal diz que
    // os campos chegaram vazios.
    const source = spec || this._graphDefaults || this._currentGraphSpec();

    if ($.graphFunction) $.graphFunction.value = source.funcStr;
    if ($.graphXmin) $.graphXmin.value = source.xmin;
    if ($.graphXmax) $.graphXmax.value = source.xmax;
    if ($.graphYmin) $.graphYmin.value = source.ymin;
    if ($.graphYmax) $.graphYmax.value = source.ymax;
    if ($.graphColor) $.graphColor.value = source.color;
    if ($.graphWidth) $.graphWidth.value = source.lineW;
  }

  

  /**
   * Ajusta os textos do modal ao modo (criar ou editar).
   * @param {boolean} isEditing
   * @param {boolean} [hasSpec]
   */
  _setGraphModalMode(isEditing, hasSpec) {
    const $ = this.toolbox.$;
    if ($.graphModalTitle) {
      $.graphModalTitle.textContent = isEditing ? 'Editar Grafico' : 'Criar Grafico';
    }
    if ($.insertGraphBtn) {
      $.insertGraphBtn.textContent = isEditing ? 'Salvar' : 'Inserir Grafico';
    }
    if ($.graphModalHint) {
      // O aviso so aparece quando falta o spec, ou quando ha spec e vale
      // lembrar que a edicao repinta. Sem spec, o texto e obrigatorio:
      // o formulario abre no padrao e o usuario precisa saber disso.
      if (isEditing) {
        $.graphModalHint.textContent = hasSpec
          ? 'Altere os parametros e salve para repintar o grafico.'
          : 'Este grafico foi criado antes de os parametros serem salvos. Ajuste os campos e salve para repintar a partir deles.';
        $.graphModalHint.hidden = false;
      } else {
        $.graphModalHint.textContent = '';
        $.graphModalHint.hidden = true;
      }
    }
  }

  /**
   * Cancela a edicao de um grafico: limpa o alvo e devolve os textos do
   * modal ao modo de criacao. O grafico em si nao e tocado.
   */
  cancelGraphEdit() {
    if (!this._editingGraph) return;
    this._editingGraph = null;
    this._setGraphModalMode(false, false);
  }

  /**
   * Insere um grafico novo ou salva as alteracoes de um ja existente.
   *
   * Na edicao o objeto e atualizado no lugar (mesma posicao e tamanho):
   * recria-lo perderia a disposicao e ainda ensacaria o historico com um
   * par remover/criar em vez de uma edicao.
   *
   * @returns {ImageObject|null}
   */
  insertGraph() {
    const spec = this._currentGraphSpec();
    const existing = this._editingGraph;

    if (existing) return this._saveGraphInto(existing, spec);

    const aspect = this._graphAspect();
    const width = 400;
    const height = Math.round(width / aspect);

    // O primeiro bitmap ja e pintado na densidade de tela alvo; o
    // `graphSpec` guardado permite repintar em resolucao maior no zoom.
    const scale = this._renderScale();
    const src = this.drawGraphOffscreen(spec, {
      width: Math.round(width * scale),
      height: Math.round(height * scale)
    });
    if (!src) return null;

    const obj = this.createImage(src, true, 100, 100, width, height, {
      graphSpec: spec,
      naturalWidth: Math.round(width * scale),
      naturalHeight: Math.round(height * scale),
      renderedScale: scale
    });
    this.drawGraphPreview(spec);
    this.toolbox.$.graphModal.classList.add('hidden');
    return obj;
  }

  /**
   * Repinta um grafico existente com os parametros do formulario.
   *
   * O bitmap e gerado na densidade que a caixa atual exige, e nao na do
   * primeiro bitmap: assim o grafico editado ja nasce com o mesmo
   * detalhe que o zoom atual mostra, sem depender de um rerender depois.
   *
   * @param {ImageObject} obj
   * @param {object} spec
   * @returns {ImageObject|null}
   */
  _saveGraphInto(obj, spec) {
    const boxW = Math.max(1, Math.round(obj.width));
    const boxH = Math.max(1, Math.round(obj.height));
    const scale = this._renderScale();
    const targetW = Math.max(1, Math.round(boxW * scale));
    const targetH = Math.max(1, Math.round(boxH * scale));

    const src = this.drawGraphOffscreen(spec, { width: targetW, height: targetH });
    if (!src) return null;

    obj.graphSpec = spec;
    obj.naturalWidth = targetW;
    obj.naturalHeight = targetH;
    obj.renderedScale = targetW / boxW;
    obj.setSrc(src);
    if (obj.dom) obj.render();

    this.drawGraphPreview(spec);
    this._setGraphModalMode(false, false);
    this._editingGraph = null;
    this.toolbox.$.graphModal.classList.add('hidden');

    if (this.onCommit) this.onCommit();
    if (this.onPersist) this.onPersist();
    return obj;
  }

  /** Proporcao (largura/altura) do canvas de preview do modal. */
  _graphAspect() {
    const { width, height } = ObjectController.GRAPH_BASE;
    return width / height;
  }

  /** Densidade de pixels (px do bitmap / px de tela) do preview. */
  _renderScale() {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    return Math.min(dpr, 2);
  }

  /** Le os parametros atuais do grafico do formulario. */
  _currentGraphSpec() {
    const $ = this.toolbox.$;
    const num = (el, fallback) => {
      const v = parseFloat(el && el.value);
      return isFinite(v) ? v : fallback;
    };
    return {
      funcStr: (($.graphFunction && $.graphFunction.value) || 'Math.sin(x)').trim(),
      xmin: num($.graphXmin, -10),
      xmax: num($.graphXmax, 10),
      ymin: num($.graphYmin, -10),
      ymax: num($.graphYmax, 10),
      color: ($.graphColor && $.graphColor.value) || '#2196f3',
      lineW: parseInt($.graphWidth && $.graphWidth.value, 10) || 2
    };
  }

  /**
   * Desenha o grafico no canvas de preview do modal.
   *
   * O canvas do modal tem dimensao fixa: e repintado e depois
   * restaurado ao tamanho original, para que pedir um bitmap grande
   * (durante o zoom de um objeto ja inserido) nao estoure a caixa do
   * preview.
   *
   * @param {object} [spec] - Parametros; usa o formulario quando omitido.
   * @returns {string|null} data URL do resultado.
   */
  drawGraphPreview(spec = null) {
    const canvas = this.graphCanvas;
    const gctx = this.graphCtx;
    if (!canvas || !gctx) return null;

    const base = ObjectController.GRAPH_BASE;
    const resized = canvas.width !== base.width || canvas.height !== base.height;
    if (resized) {
      canvas.width = base.width;
      canvas.height = base.height;
    }
    this._paintGraph(gctx, base.width, base.height, spec || this._currentGraphSpec());
    return canvas.toDataURL('image/png');
  }

  /**
   * Pinta o grafico num canvas solto (nao aparece na tela) e devolve
   * o data URL. Usado pelo `ImageObject.rerender` para refazer o
   * bitmap na densidade exigida pelo zoom.
   *
   * @param {object} spec - Parametros do grafico.
   * @param {{width:number,height:number}} size - Dimensao do bitmap.
   * @returns {string|null}
   */
  drawGraphOffscreen(spec, size) {
    const w = Math.max(1, Math.round(size && size.width));
    const h = Math.max(1, Math.round(size && size.height));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    this._paintGraph(ctx, w, h, spec || this._currentGraphSpec());
    return canvas.toDataURL('image/png');
  }

  /**
   * Desenha o grafico em `ctx` occupying `w` x `h` pixels.
   *
   * Espessuras, fonte e deslocamentos sao multiplicados por `factor`
   * (w / largura de referencia). E o que faz o bitmap grande ser a
   * MESMA figura, so que com pixels suficientes: se a fonte e a linha
   * ficassem em pixels absolutos, o grafico de 4x pareceria com traco
   * fino e rotulo pequeno, e nao como o original ampliado.
   *
   * @param {CanvasRenderingContext2D} gctx
   * @param {number} w
   * @param {number} h
   * @param {object} source
   */
  _paintGraph(gctx, w, h, source) {
    const factor = w / ObjectController.GRAPH_BASE.width;

    const { funcStr, color, lineW } = source;
    let xmin = source.xmin;
    let xmax = source.xmax;
    let ymin = source.ymin;
    let ymax = source.ymax;
    gctx.clearRect(0, 0, w, h);

    if (!isFinite(xmin)) xmin = -10;
    if (!isFinite(xmax)) xmax = 10;
    if (!isFinite(ymin)) ymin = -10;
    if (!isFinite(ymax)) ymax = 10;
    if (xmax <= xmin) xmax = xmin + 1;
    if (ymax <= ymin) ymax = ymin + 1;

    gctx.fillStyle = '#ffffff';
    gctx.fillRect(0, 0, w, h);
    const xScale = w / (xmax - xmin);
    const yScale = h / (ymax - ymin);
    const toScreenX = (x) => (x - xmin) * xScale;
    const toScreenY = (y) => h - (y - ymin) * yScale;

    // Eixos
    gctx.strokeStyle = '#999';
    gctx.lineWidth = Math.max(0.5, factor);
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
    gctx.lineWidth = Math.max(0.25, 0.5 * factor);
    gctx.fillStyle = '#666';
    gctx.font = `${Math.max(6, Math.round(10 * factor))}px sans-serif`;
    const axisY = (ymin <= 0 && ymax >= 0) ? toScreenY(0) : h;
    const axisX = (xmin <= 0 && xmax >= 0) ? toScreenX(0) : 0;
    // Os passos sao contados em unidades de dado, nao em pixels: assim a
    // densidade da grade e a mesma em qualquer resolucao.
    const stepX = Math.ceil((xmax - xmin) / 20) || 1;
    for (let x = Math.ceil(xmin); x <= xmax; x += stepX) {
      const sx = toScreenX(x);
      gctx.beginPath(); gctx.moveTo(sx, 0); gctx.lineTo(sx, h); gctx.stroke();
      if (x !== 0) gctx.fillText(x, sx + 2 * factor, Math.min(h - 2 * factor, axisY + 11 * factor));
    }
    const stepY = Math.ceil((ymax - ymin) / 15) || 1;
    for (let y = Math.ceil(ymin); y <= ymax; y += stepY) {
      const sy = toScreenY(y);
      gctx.beginPath(); gctx.moveTo(0, sy); gctx.lineTo(w, sy); gctx.stroke();
      if (y !== 0) gctx.fillText(y, Math.min(w - 16 * factor, axisX + 4 * factor), sy - 2 * factor);
    }

    const labelError = (msg) => {
      gctx.fillStyle = '#e53935';
      gctx.font = `${Math.max(8, Math.round(14 * factor))}px sans-serif`;
      gctx.fillText(msg, 20 * factor, 30 * factor);
    };

    // Plot da funcao: uma amostra por coluna de pixel, entao o tracado
    // fica suave na maior resolucao possivel.
    const { fn, error } = this._computeFunction(funcStr);
    if (error) {
      labelError(error);
      return;
    }
    if (fn) {
      gctx.strokeStyle = color;
      gctx.lineWidth = lineW * factor;
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
      if (plotted === 0) labelError('Sem valores no intervalo');
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
