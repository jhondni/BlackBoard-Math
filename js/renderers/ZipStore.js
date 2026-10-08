/* ============================================
   UI/UX DESIGNER - ZipStore
   ============================================
   ZIP "store" (sem compressao) escrito a mao,
   em vez de trazer JSZip: sao tres cabecalhos e
   um CRC32, e o projeto ja nao tem build -- seria
   mais um script CDN para recomprimir algo que ja
   esta comprimido (PNG) ou que nem ganharia com a
   compressao (texto curto).

   O mesmo builder serve a lousa (o export de PNG
   em varias paginas) e o Design (o botao de baixar
   o codigo do frame em tres arquivos). Ele nao
   depende do DOM nem de estado: recebe os arquivos
   e devolve um Blob.
   ============================================ */

export class ZipStore {
  /**
   * Monta um ZIP "store" (sem compressao) no formato ZIP64.
   *
   * ZIP64 e o mesmo formato que ja usava a lousa no export de PNG, quando
   * uma captura em `scale: 2` podia passar de 4 GB com poucas paginas.
   * Para texto e PNG o limite nao aparece, mas o formato e identico e o
   * mesmo codigo serve os dois.
   *
   * @param {Array<{nome:string, dados:Uint8Array|string}>} arquivos
   *   `dados` em bytes ja crus, ou um texto que vira UTF-8.
   * @returns {Blob} um ZIP de `application/zip`
   */
  static buildZip(arquivos) {
    const enc = new TextEncoder();
    // Um unico carimbo de tempo para todos os itens: um arquivo com metadados
    // por item tem data e hora proprias, e isso nao compra nada aqui.
    const agora = new Date();
    const hora = ((agora.getHours() & 0x1f) << 11) | ((agora.getMinutes() & 0x3f) << 5) |
      ((Math.floor(agora.getSeconds() / 2)) & 0x1f);
    const data = (((agora.getFullYear() - 1980) & 0x7f) << 9) | (((agora.getMonth() + 1) & 0x0f) << 5) |
      (agora.getDate() & 0x1f);

    const crcTable = ZipStore._crcTable();
    const crc = (bytes) => {
      let c = 0xffffffff;
      for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };

    const locais = [];
    const centrais = [];
    let offset = 0;

    arquivos.forEach((arq) => {
      const nome = enc.encode(arq.nome);
      const dados = typeof arq.dados === 'string' ? enc.encode(arq.dados) : arq.dados;
      const soma = crc(dados);

      const local = new Uint8Array(30 + nome.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);   //assinatura de header local
      lv.setUint16(4, 45, true);           // versao 4.5, obrigatoria p/ ZIP64
      lv.setUint16(6, 0, true);            // store
      lv.setUint16(8, 0, true);            // sem horario nem data definidos
      lv.setUint16(10, hora, true);
      lv.setUint16(12, data, true);
      lv.setUint32(14, soma, true);
      lv.setUint32(18, dados.length, true);
      lv.setUint32(22, dados.length, true);
      lv.setUint16(26, nome.length, true);
      lv.setUint16(28, 0, true);
      local.set(nome, 30);

      const central = new Uint8Array(46 + nome.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);   // assinatura de header central
      cv.setUint16(4, 45, true);           // versao que criou o ZIP64
      cv.setUint16(6, 45, true);           // versao que precisa ler
      cv.setUint16(8, 0, true);            // flags
      cv.setUint16(10, 0, true);           // compressao: store
      cv.setUint16(12, hora, true);
      cv.setUint16(14, data, true);
      cv.setUint32(16, soma, true);
      cv.setUint32(20, dados.length, true);
      cv.setUint32(24, dados.length, true);
      cv.setUint16(28, nome.length, true);
      cv.setUint16(30, 0, true);           // extra field
      cv.setUint16(32, 0, true);           // comentario
      cv.setUint16(34, 0, true);           // numero do disco
      cv.setUint16(36, 0, true);           // atributos internos
      cv.setUint32(38, 0, true);           // atributos externos
      // Header central tem 46 bytes de cabecalho: o offset do header local
      // e o ultimo campo de 4 bytes, e nao o primeiro -- errar para 40
      // sobrescreve os atributos externos e deixa o offset em zero.
      cv.setUint32(42, offset, true);
      central.set(nome, 46);

      locais.push(local, dados);
      centrais.push(central);
      offset += local.length + dados.length;
    });

    const tamCentral = centrais.reduce((n, c) => n + c.length, 0);
    const fim = new Uint8Array(22);
    const fv = new DataView(fim.buffer);
    fv.setUint32(0, 0x06054b50, true);     // assinatura de EOCD
    fv.setUint16(4, 0, true);
    fv.setUint16(6, 0, true);
    fv.setUint16(8, arquivos.length, true);
    fv.setUint16(10, arquivos.length, true);
    fv.setUint32(12, tamCentral, true);
    fv.setUint32(16, offset, true);

    const partes = [...locais, ...centrais, fim];
    const total = partes.reduce((n, p) => n + p.length, 0);
    const buffer = new Uint8Array(total);
    let cursor = 0;
    partes.forEach((p) => { buffer.set(p, cursor); cursor += p.length; });
    return new Blob([buffer], { type: 'application/zip' });
  }

  /** Tabela do CRC32 (polinomio 0xEDB88320), montada uma vez e reusada. */
  static _crcTable() {
    if (ZipStore.__crcTable) return ZipStore.__crcTable;
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c >>> 0;
    }
    ZipStore.__crcTable = table;
    return table;
  }
}