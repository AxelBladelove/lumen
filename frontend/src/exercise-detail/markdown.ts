// Renderizador propio de un subset de Markdown pensado para los enunciados de
// `content/activities/*/statement.md`. La regla dura es que TODO el contenido
// se escapa como HTML antes de tocar la estructura Markdown: nada de lo que
// venga del enunciado puede convertirse en tags reales. El resultado es
// HTML seguro para inyectar con `{@html}` en la webview.
//
// Subset soportado:
//   - Encabezados `#`, `##`, `###`.
//   - Párrafos separados por línea en blanco.
//   - Listas simples con `- `.
//   - Tablas GFM simples `| a | b |` con fila separadora `| --- | --- |`.
//   - Código inline con backticks: `` `x` ``.
//   - Negrita `**x**` e itálica `*x*`.
//   - Bloques de código fenced ```` ``` ````.
//
// No soportado (a propósito, para mantener el escape total como invariante):
// enlaces, imágenes, HTML embebido, blockquotes, listas ordenadas.

export function renderMarkdown(md: string): string {
  const source = md.replace(/\r\n?/g, "\n");
  const lines = source.split("\n");

  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (/^```/.test(line)) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const inner = renderInline(heading[2].trim());
      blocks.push(`<h${level}>${inner}</h${level}>`);
      i++;
      continue;
    }

    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const header = parseTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        lines[i].includes("|")
      ) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      blocks.push(renderTable(header, rows));
      continue;
    }

    if (/^-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^-\s+/, "");
        items.push(`<li>${renderInline(itemText)}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Párrafo: acumula líneas hasta blank line o inicio de otro bloque.
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(?:#{1,3}\s|```|-\s)/.test(lines[i]) &&
      !(
        lines[i].includes("|") &&
        i + 1 < lines.length &&
        isTableSeparator(lines[i + 1])
      )
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      const paraText = paraLines.join(" ");
      blocks.push(`<p>${renderInline(paraText)}</p>`);
    }
  }

  return blocks.join("\n");
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Recorre el texto crudo carácter a carácter reconociendo code spans, bold e
// itálica, y escapa HTML solo del contenido literal. Así nunca convive texto
// escapado con marcadores Markdown (evita colisiones tipo "`&lt;`") y no hacen
// falta placeholders internos que el input pudiera imitar.
function renderInline(text: string): string {
  let out = "";
  let literal = "";

  const flush = () => {
    if (literal.length > 0) {
      out += escapeHtml(literal);
      literal = "";
    }
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];

    if (c === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1 && text.indexOf("\n", i) === -1) {
        flush();
        out += `<code>${escapeHtml(text.slice(i + 1, end))}</code>`;
        i = end + 1;
        continue;
      }
    }

    if (c === "*" && text[i + 1] === "*") {
      const end = findClosing(text, i + 2, "**");
      if (end !== -1) {
        flush();
        out += `<strong>${renderInline(text.slice(i + 2, end))}</strong>`;
        i = end + 2;
        continue;
      }
    }

    if (c === "*") {
      const end = findClosing(text, i + 1, "*");
      if (end !== -1) {
        flush();
        out += `<em>${renderInline(text.slice(i + 1, end))}</em>`;
        i = end + 1;
        continue;
      }
    }

    literal += c;
    i++;
  }

  flush();
  return out;
}

// Busca la marca de cierre en la misma línea. Bold es `**`, itálica es `*` con
// la condición extra de no confundirse con el inicio de un `**`. Devuelve el
// índice del cierre o -1 si no aparece antes de un salto de línea.
function findClosing(text: string, from: number, marker: string): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === "\n") return -1;
    if (marker === "*") {
      if (text[i] === "*" && text[i + 1] !== "*" && text[i - 1] !== "*") {
        return i;
      }
      continue;
    }
    if (text[i] === "*" && text[i + 1] === "*") return i;
  }
  return -1;
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  const cells = trimmed.replace(/^\||\|$/g, "").split("|");
  if (cells.length === 0) return false;
  return cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell));
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(header: string[], rows: string[][]): string {
  const th = header.map((cell) => `<th>${renderInline(cell)}</th>`).join("");
  const trs = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`
    )
    .join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}
