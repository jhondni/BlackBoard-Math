/* ============================================
   LOUSA VIRTUAL - TextRenderer
   ============================================
   Renderizacao e medidas de textos no contexto
   do canvas e dos elementos da lousa.
   ============================================ */

export class TextRenderer {
  /**
   * Cria/atualiza um elemento de texto editavel na lousa.
   * @param {HTMLElement} el - Elemento alvo
   * @param {string} text - Conteudo
   * @param {object} [opts] - { fontSize, color, editable }
   */
  applyText(el, text, opts = {}) {
    const { fontSize = 18, color = '#000000', editable = true } = opts;
    el.textContent = text;
    el.style.fontSize = fontSize + 'px';
    el.style.color = color;
    if (editable) el.contentEditable = 'true';
  }

  /**
   * Mede a largura de um texto em um dado contexto 2D.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} text
   * @param {number} [fontSize]
   * @returns {number}
   */
  measureText(ctx, text, fontSize = 18) {
    ctx.font = `${fontSize}px sans-serif`;
    return ctx.measureText(text).width;
  }

  /**
   * Quebra um texto em linhas dentro de uma largura maxima.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} text
   * @param {number} maxWidth
   * @returns {string[]}
   */
  wrapText(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }
}
