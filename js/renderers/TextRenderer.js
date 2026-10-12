/* ============================================
   LOUSA VIRTUAL - TextRenderer
   ============================================
   Renderizacao e medidas de textos no contexto
   do canvas e dos elementos da lousa.
   ============================================ */

/* Canvas de medicao: um so para a pagina, criado na primeira quebra.
   Guardar o contexto evita criar canvas por linha de texto, e medir no
   canvas e o que faz a quebra bater com o que o navegador desenha. */
let measureCtx = null;

function measureContext() {
  if (measureCtx) return measureCtx;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  measureCtx = canvas.getContext('2d');
  return measureCtx;
}

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

  /**
   * Metricas verticais da fonte no corpo dado: ascent e descent, em px,
   * medidos no mesmo canvas do `wrapToWidth`. E o que permite o CSS do
   * export casar a baseline da primeira linha com a do SVG -- o
   * `line-height` do CSS sozinho so depende de um multiplicador, e a
   * baseline real fica na meia-entrelinha mais o ascent da fonte.
   *
   * Sem DOM, ou em navegador sem `fontBoundingBox`, cai na proporcao
   * tipica 0.8/0.2: nao e a metrica exata, mas mantem o desenho no lugar
   * em vez de saltar.
   *
   * @param {string} font - Fonte no formato do canvas (`700 16px Inter`)
   * @param {number} fontSize - Corpo, para a proporcao de reserva
   * @returns {{ ascent: number, descent: number }}
   */
  static metrics(font, fontSize) {
    const size = Number(fontSize) || 0;
    const fallback = { ascent: size * 0.8, descent: size * 0.2 };
    const ctx = measureContext();
    if (!ctx) return fallback;
    ctx.font = font;
    const m = ctx.measureText('Hg');
    const ascent = m.fontBoundingBoxAscent;
    const descent = m.fontBoundingBoxDescent;
    if (Number.isFinite(ascent) && Number.isFinite(descent) && ascent > 0) {
      return { ascent, descent };
    }
    return fallback;
  }

  /**
   * Quebra um texto em linhas que cabem na largura dada, medindo com a
   * fonte informada. Parte por `\n`, depois por espaco, e palavra mais
   * larga que a caixa e partida caractere a caractere -- o SVG nao tem
   * quebra propria, entao sem isto o texto corre para fora da caixa.
   * Sem DOM (ambiente sem `document`) devolve o texto partido so por `\n`.
   * @param {string} text
   * @param {number} width - Largura alvo, na mesma unidade da fonte
   * @param {string} font - Fonte no formato do canvas (`700 16px Inter`)
   * @returns {string[]}
   */
  static wrapToWidth(text, width, font) {
    const paragraphs = String(text).split('\n');
    const ctx = measureContext();
    if (!ctx || !(width > 0)) return paragraphs;

    ctx.font = font;
    const fits = (value) => ctx.measureText(value).width <= width;

    // Parte uma palavra que nao couber sozinha e devolve o ultimo pedaco,
    // que ainda nao esta fechado; os anteriores vao para `sink`. Uma URL
    // costuma ser mais larga que a caixa inteira.
    const splitWord = (word, sink) => {
      let chunk = '';
      for (const char of word) {
        if (chunk && !fits(chunk + char)) {
          sink.push(chunk);
          chunk = char;
        } else {
          chunk += char;
        }
      }
      return chunk;
    };

    const lines = [];
    paragraphs.forEach((paragraph) => {
      if (!paragraph.trim()) {
        lines.push('');
        return;
      }
      let line = '';
      paragraph.trim().split(/\s+/).forEach((word) => {
        const candidate = line ? line + ' ' + word : word;
        if (fits(candidate)) {
          line = candidate;
          return;
        }
        if (line) {
          lines.push(line);
          line = '';
        }
        line = fits(word) ? word : splitWord(word, lines);
      });
      lines.push(line);
    });
    return lines;
  }
}
