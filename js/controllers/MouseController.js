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
      this.objectController.createText(x, y);
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
