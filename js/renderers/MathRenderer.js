/* ============================================
   LOUSA VIRTUAL - MathRenderer
   ============================================
   Responsavel por renderizar expressoes matematicas
   em LaTeX usando KaTeX (rapido) com fallback para
   MathJax (expressoes mais complexas).
   ============================================ */

import { SVGRenderer } from './SVGRenderer.js';

export class MathRenderer {
  /**
   * Renderiza uma expressao LaTeX dentro de um elemento DOM.
   * @param {string} latex - Expressao em LaTeX
   * @param {HTMLElement} el - Elemento alvo
   * @param {object} [options] - { displayMode, throwOnError }
   * @returns {HTMLElement} O mesmo elemento alvo (para encadeamento)
   */
  render(latex, el, options = {}) {
    const { displayMode = true, throwOnError = false } = options;

    // Tenta renderizar com KaTeX (preciso e rapido)
    if (window.katex) {
      try {
        window.katex.render(latex, el, { displayMode, throwOnError });
        return el;
      } catch (err) {
        // Se KaTeX falhar e MathJax estiver disponivel, usa MathJax
        if (window.MathJax) {
          return this._renderWithMathJax(latex, el, displayMode);
        }
        el.textContent = latex;
        return el;
      }
    }

    // Fallback para MathJax
    if (window.MathJax) {
      return this._renderWithMathJax(latex, el, displayMode);
    }

    // Sem nenhum renderizador dispoivel
    el.textContent = latex;
    return el;
  }

  /**
   * Renderiza LaTeX usando MathJax (renderizador fallback).
   * @private
   */
  _renderWithMathJax(latex, el, displayMode) {
    try {
      window.MathJax.typesetPromise([el]).catch(() => {});
      return el;
    } catch (err) {
      el.textContent = latex;
      return el;
    }
  }

  /**
   * Remove a expressao renderizada do elemento (limpa o conteudo).
   * @param {HTMLElement} el
   */
  clear(el) {
    if (!el) return;
    el.innerHTML = '';
  }

  /**
   * Converte uma expressao LaTeX em SVG estatico.
   * Utilizado para exportacao (PDF/PNG) quando necessario.
   * @param {string} latex
   * @returns {SVGElement|null}
   */
  toSVG(latex) {
    // Placeholder: em implementacoes finais poderia usar
    // MathJax SVG output ou KaTeX SVG. Por ora retorna nulo.
    return SVGRenderer.svgContainer();
  }
}
