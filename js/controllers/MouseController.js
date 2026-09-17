/* ============================================
   LOUSA VIRTUAL - MouseController
   ============================================
   Controller responsavel pelos eventos de mouse no
   canvas da lousa: desenho livre, borracha, blur e
   criacao de objetos por clique (texto, etc).
   ============================================ */

export class MouseController {
  constructor(board, boardView, toolbar, objectController) {
    this.board = board;
    this.boardView = boardView;
    this.toolbar = toolbar;
    this.objectController = objectController;

    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;

    // Desenho da caixa de texto (arrastar com a ferramenta texto)
    this.textBoxDrag = null;   // { startX, startY, x, y }
    this.textBoxPreview = null; // overlay <div>

    // Callback injetado pelo BoardController ao concluir desenho
    this.onStrokeEnd = null; // () => void

    this.bind();
  }

  bind() {
    const canvas = this.boardView.canvas;
    canvas.addEventListener('mousedown', (e) => this.onDown(e));
    canvas.addEventListener('mousemove', (e) => this.onMove(e));
    canvas.addEventListener('mouseup', () => this.onUp());
    canvas.addEventListener('mouseleave', () => this.onUp());
  }

  /** Converte coordenadas de clique para coordenadas da lousa (considerando zoom). */
  _toBoard(e) {
    const rect = this.boardView.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / this.board.zoom,
      y: (e.clientY - rect.top) / this.board.zoom
    };
  }

  onDown(e) {
    const { x, y } = this._toBoard(e);
    const tool = this.toolbar.currentTool;

    if (tool === 'draw') {
      this.isDrawing = true;
      this.lastX = x; this.lastY = y;
      this._beginPath(this.board.penColor, this.board.penSize);
    } else if (tool === 'eraser') {
      this.isDrawing = true;
      this.lastX = x; this.lastY = y;
      this._beginPath('#ffffff', this.board.penSize * 4);
    } else if (tool === 'blur') {
      this.isDrawing = true;
      this._applyBlurAt(x, y);
    } else if (tool === 'text') {
      this._startTextBoxDrag(x, y, e);
    } else if (tool === 'select') {
      this.board.deselectObject();
    }
  }

  /* ---- Caixa de texto (arrastar para dimensionar) ---- */
  _startTextBoxDrag(x, y, e) {
    this.isDrawing = true;
    this.textBoxDrag = {
      startX: x, startY: y, x, y,
      sx0: e.clientX, sy0: e.clientY, // inicio em pixels de tela
      sx: e.clientX, sy: e.clientY,   // posicao atual em pixels de tela
    };
    this._createTextBoxPreview();
    this._updateTextBoxPreview();
  }

  _createTextBoxPreview() {
    if (this.textBoxPreview) return;
    const el = document.createElement('div');
    el.className = 'text-box-preview';
    this.boardView.elementsLayer.appendChild(el);
    this.textBoxPreview = el;
  }

  _updateTextBoxPreview() {
    const el = this.textBoxPreview;
    const d = this.textBoxDrag;
    if (!el || !d) return;
    el.style.left = Math.min(d.startX, d.x) + 'px';
    el.style.top = Math.min(d.startY, d.y) + 'px';
    el.style.width = Math.max(4, Math.abs(d.x - d.startX)) + 'px';
    el.style.height = Math.max(4, Math.abs(d.y - d.startY)) + 'px';
  }

  _removeTextBoxPreview() {
    if (this.textBoxPreview) {
      this.textBoxPreview.remove();
      this.textBoxPreview = null;
    }
  }

  _beginPath(color, size) {
    const ctx = this.boardView.canvas.getContext('2d');
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(this.lastX, this.lastY);
  }

  onMove(e) {
    if (!this.isDrawing) return;
    const { x, y } = this._toBoard(e);

    if (this.textBoxDrag) {
      this.textBoxDrag.x = x;
      this.textBoxDrag.y = y;
      this.textBoxDrag.sx = e.clientX;
      this.textBoxDrag.sy = e.clientY;
      this._updateTextBoxPreview();
      return;
    }

    const tool = this.toolbar.currentTool;
    const ctx = this.boardView.canvas.getContext('2d');

    if (tool === 'draw' || tool === 'eraser') {
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (tool === 'blur') {
      this._applyBlurAt(x, y);
    }
    this.lastX = x; this.lastY = y;
  }

  onUp() {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.textBoxDrag) {
      const drag = this.textBoxDrag;
      this.textBoxDrag = null;
      this._removeTextBoxPreview();

      // Decisao em pixels de tela (independente de zoom): < 8px = clique.
      const sw = Math.abs(drag.sx - drag.sx0);
      const sh = Math.abs(drag.sy - drag.sy0);

      if (sw < 8 && sh < 8) {
        // Clique simples: caixa padrao 200x50 centralizada no clique.
        this.objectController.createText(drag.startX - 100, drag.startY - 25, 200, 50);
      } else {
        // Arrastar e segurar: caixa do tamanho projetado (min 200x50).
        const w = Math.abs(drag.x - drag.startX);
        const h = Math.abs(drag.y - drag.startY);
        const x = Math.min(drag.startX, drag.x);
        const y = Math.min(drag.startY, drag.y);
        this.objectController.createText(x, y, Math.max(200, w), Math.max(50, h));
      }
      return;
    }

    const ctx = this.boardView.canvas.getContext('2d');
    ctx.closePath();
    if (this.onStrokeEnd) this.onStrokeEnd();
  }

  /**
   * Aplica efeito blur (borrao) num ponto do canvas.
   * Executa um desfoque gaussiano simples (3x3) region.
   * @param {number} x
   * @param {number} y
   */
  _applyBlurAt(x, y) {
    const size = this.board.penSize * 5;
    const ctx = this.boardView.canvas.getContext('2d');
    const imageData = ctx.getImageData(x - size / 2, y - size / 2, size, size);
    const data = imageData.data;
    const w = imageData.width;
    const h = imageData.height;
    const copy = new Uint8ClampedArray(data);

    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        let r = 0, g = 0, b = 0, a = 0, count = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = px + dx;
            const ny = py + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const i = (ny * w + nx) * 4;
              r += copy[i]; g += copy[i + 1]; b += copy[i + 2]; a += copy[i + 3]; count++;
            }
          }
        }
        const i = (py * w + px) * 4;
        data[i] = r / count;
        data[i + 1] = g / count;
        data[i + 2] = b / count;
        data[i + 3] = a / count;
      }
    }
    ctx.putImageData(imageData, x - size / 2, y - size / 2);
  }
}
