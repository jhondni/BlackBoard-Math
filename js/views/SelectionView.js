/* ============================================
   LOUSA VIRTUAL - SelectionView
   ============================================
   View responsavel por arrastar, redimensionar e
   selecionar objetos da lousa (handles e acoes
   visuais do elemento selecionado).
   ============================================ */

export class SelectionView {
  constructor(board, boardView) {
    this.board = board;
    this.boardView = boardView; // para acessar canvas/zoom

    // Estado interno de manipulacao
    this.dragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.resizing = false;
    this.resizeDir = '';
    this.resizeStart = {};

    this.onEditEquation = null; // callback (obj) => void
    this.onEditText = null; // callback (obj) => void -> editar texto (ferramenta texto)
    this.onDeleteObject = null; // callback (obj) => void
    this.onBlurObject = null; // callback (obj) => void
    this.onCommitChange = null; // callback () => void (salvar historico)
    this.objectController = null; // permite re-render de graficos/imagens

    // Getter da ferramenta ativa (injetado pelo app.js).
    // Permite que apenas a ferramenta 'select' mova os objetos.
    this.getCurrentTool = () => 'select';
  }

  /**
   * Anexa os eventos de manipulacao a um elemento DOM.
   * @param {HTMLElement} el
   * @param {object} obj
   */
  attach(el, obj) {
    // Drag
    el.addEventListener('mousedown', (e) => this._onDragStart(e, el, obj));

    // Resize
    el.querySelectorAll('.resize-handle').forEach(handle => {
      handle.addEventListener('mousedown', (e) => this._onResizeStart(e, el, obj, handle));
    });

    // Acoes (editar/borrar/remover)
    const deleteBtn = el.querySelector('.delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onDeleteObject) this.onDeleteObject(obj);
      });
    }

    const blurBtn = el.querySelector('.blur-btn');
    if (blurBtn) {
      blurBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onBlurObject) this.onBlurObject(obj);
        else obj.applyBlur(!obj.blurred);
      });
    }

    const editBtn = el.querySelector('.edit-eq-btn');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onEditEquation) this.onEditEquation(obj);
      });
    }
  }

  /* ---- Selecao ---- */
  select(obj) {
    this.board.selectObject(obj);
  }

  deselectAll() {
    this.board.deselectObject();
  }

  _isOnBoard(el) {
    return Boolean(el);
  }

  /* ---- Drag ---- */
  _onDragStart(e, el, obj) {
    const tool = this.getCurrentTool();

    // Ferramenta de texto: clicar num texto (vazio ou nao) foca para edicao;
    // acoes e handles continuam funcionando. Textos vazios sao removidos
    // ao desfocar (blur) ou via Backspace/Delete.
    if (tool === 'text') {
      if (e.target.closest('.element-actions') || e.target.classList.contains('resize-handle')) {
        return;
      }
      if (obj.type === 'text') {
        e.preventDefault();
        e.stopPropagation();
        if (this.onEditText) this.onEditText(obj);
      }
      return;
    }

    if (tool === 'blur') {
      if (e.target.closest('.element-actions') || e.target.classList.contains('resize-handle')) return;
      e.stopPropagation();
      if (this.onBlurObject) this.onBlurObject(obj);
      return;
    }
    if (tool !== 'select') return;
    if (e.target.closest('.element-actions') || e.target.classList.contains('resize-handle')) return;

    e.stopPropagation();
    this.select(obj);

    this.dragging = true;
    this.dragOffset.x = e.clientX - obj.x;
    this.dragOffset.y = e.clientY - obj.y;

    const onMove = (ev) => {
      obj.move(ev.clientX - this.dragOffset.x, ev.clientY - this.dragOffset.y);
    };
    const onUp = () => {
      this.dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (this.onCommitChange) this.onCommitChange();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  /* ---- Resize ---- */
  _onResizeStart(e, el, obj, handle) {
    e.stopPropagation();
    this.select(obj);

    this.resizing = true;
    this.resizeDir = [...handle.classList].find(c => c !== 'resize-handle');
    this.resizeStart = {
      x: e.clientX,
      y: e.clientY,
      w: obj.width,
      h: obj.height,
      elX: obj.x,
      elY: obj.y
    };

    const onMove = (ev) => {
      const dx = ev.clientX - this.resizeStart.x;
      const dy = ev.clientY - this.resizeStart.y;

      // Minimos por tipo: textos respeitam o min-width/min-height de 50px.
      const isText = obj.type === 'text';
      const minW = isText ? 50 : 40;
      const minH = isText ? 50 : 30;

      let newW = this.resizeStart.w;
      let newH = this.resizeStart.h;
      let newX = this.resizeStart.elX;
      let newY = this.resizeStart.elY;

      if (this.resizeDir.includes('e')) newW = Math.max(minW, this.resizeStart.w + dx);
      if (this.resizeDir.includes('s')) newH = Math.max(minH, this.resizeStart.h + dy);
      if (this.resizeDir.includes('w')) {
        newW = Math.max(minW, this.resizeStart.w - dx);
        // Ancora a borda direita: a esquerda recua o quanto a largura diminuiu.
        newX = this.resizeStart.elX + (this.resizeStart.w - newW);
      }
      if (this.resizeDir.includes('n')) {
        newH = Math.max(minH, this.resizeStart.h - dy);
        // Ancora a borda inferior: o topo desce o quanto a altura diminuiu.
        newY = this.resizeStart.elY + (this.resizeStart.h - newH);
      }

      obj.resize(newW, newH);
      if (this.resizeDir.includes('w')) obj.x = newX;
      if (this.resizeDir.includes('n')) obj.y = newY;

      // Escala o KaTeX dentro de equacoes ao redimensionar
      const katexEl = el.querySelector('.katex');
      if (katexEl) {
        const scale = newW / this.resizeStart.w;
        katexEl.style.fontSize = Math.min(3, Math.max(0.5, scale)) + 'em';
      }
    };

    const onUp = () => {
      this.resizing = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (obj && obj.rerender && this.objectController) {
        obj.rerender(this.objectController);
      }
      if (this.onCommitChange) this.onCommitChange();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
}
