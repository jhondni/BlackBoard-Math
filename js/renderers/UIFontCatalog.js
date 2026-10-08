/* ============================================
   UI/UX DESIGNER - UIFontCatalog
   ============================================
   Catalogo de fontes do sistema para o select de
   familia do painel de propriedades.

   O navegador nao tem API pra enumerar fontes com
   CSS/JS puro; a unica saida e a Local Font Access
   (`window.queryLocalFonts`), que lista as fontes
   instaladas -- mas pede permissao e exige gesto do
   usuario (Chromium/Edge, e `localhost` e contexto
   seguro, como os ES modules). Onde a API nao existe
   (Firefox/Safari) ou a permissao e negada, devolve
   lista vazia e a view cai na lista padrao de
   `UIText.FONT_FAMILIES`.

   Aqui so vive a chamada e o cache; decidir o que o
   select mostra e papel da view (UIPropertiesView).
   ============================================ */

const SOURCE_LOCAL = 'local';
const SOURCE_FALLBACK = 'fallback';

let cached = null;

export class UIFontCatalog {
  /** A Local Font Access existe neste navegador? */
  static available() {
    return typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function';
  }

  /** Lista ja carregada (ou ja tentada), ou `null` se nada foi pedido. */
  static get cached() {
    return cached;
  }

  /**
   * Carrega (ou devolve do cache) as familias do sistema. Deve ser
   * chamado num gesto do usuario: a Local Font Access exige ativacao
   * transitoria. Nunca lanca -- sem API ou permissao negada, devolve
   * `source: 'fallback'` e a view usa o padrao.
   *
   * @returns {{ source: string, families: string[] }}
   */
  static async load() {
    if (cached) return cached;
    if (!UIFontCatalog.available()) {
      cached = { source: SOURCE_FALLBACK, families: [] };
      return cached;
    }
    try {
      const fonts = await window.queryLocalFonts();
      cached = { source: SOURCE_LOCAL, families: UIFontCatalog._normalize(fonts) };
    } catch (err) {
      cached = { source: SOURCE_FALLBACK, families: [] };
    }
    return cached;
  }

  /** Dedupe por familia, ordena e mantem 'Inter' no topo. */
  static _normalize(fonts) {
    const seen = new Set();
    (fonts || []).forEach((font) => {
      const name = (font.family || '').trim();
      if (name) seen.add(name);
    });
    const names = [...seen].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    // O padrao do tema vai pro topo pra nao se perder na lista.
    const inter = names.indexOf('Inter');
    if (inter > 0) names.splice(0, 0, names.splice(inter, 1)[0]);
    return names;
  }
}