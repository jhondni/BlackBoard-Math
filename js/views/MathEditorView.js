/* ============================================
   LOUSA VIRTUAL - MathEditorView
   ============================================
   View do modal de insercao de equacao LaTeX,
   incluindo input, preview via KaTeX e templates.
   ============================================ */

export class MathEditorView {
  constructor($) {
    this.$ = $;
    this.callback = null; // (latex) => void, chamado ao confirmar

    this.onInsert = null; // callback (latex) => void (modo criar)
  }

  init() {
    const $ = this.$;
    if ($.latexInput) $.latexInput.addEventListener('input', () => this.updatePreview());

    document.querySelectorAll('.template-btn').forEach(btn => {
      btn.addEventListener('click', () => this.insertTemplate(btn.dataset.latex));
    });

    document.querySelectorAll('.template-select[data-insert]').forEach(select => {
      select.addEventListener('change', () => {
        if (select.value) {
          this.insertTemplate(select.value);
          select.value = '';
        }
      });
    });

    if ($.insertEquationBtn) {
      $.insertEquationBtn.addEventListener('click', () => this.confirm());
    }
  }

  /**
   * Abre o modal com latex inicial e callback de edicao.
   * @param {string} [initial] - LaTeX preexistente
   * @param {Function} [callback] - Chamado com o novo latex ao confirmar
   */
  open(initial = '', callback = null) {
    this.callback = callback || this.onInsert;
    this.$.latexInput.value = initial;
    this.updatePreview();
    this.$.equationModal.classList.remove('hidden');
    this.$.latexInput.focus();
  }

  close() {
    this.$.equationModal.classList.add('hidden');
    this.callback = null;
  }

  updatePreview() {
    const latex = this.$.latexInput.value.trim();
    const preview = this.$.equationPreview;
    if (!latex) {
      preview.innerHTML = '<span class="placeholder-text">Preview da equacao</span>';
      return;
    }
    if (window.katex) {
      try {
        window.katex.render(latex, preview, { displayMode: true, throwOnError: false });
        return;
      } catch (err) {
        preview.innerHTML = `<span style="color:var(--danger)">${err.message}</span>`;
        return;
      }
    }
    preview.textContent = latex;
  }

  insertTemplate(latex) {
    const input = this.$.latexInput;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = input.value.substring(0, start) + latex + input.value.substring(end);
    input.selectionStart = input.selectionEnd = start + latex.length;
    input.focus();
    this.updatePreview();
  }

  confirm() {
    const latex = this.$.latexInput.value.trim();
    if (!latex) return;
    if (this.callback) this.callback(latex);
    this.close();
  }
}
