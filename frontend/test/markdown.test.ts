import { describe, expect, test } from "bun:test";

import { renderMarkdown } from "../src/exercise-detail/markdown";

describe("renderMarkdown", () => {
  test("encabezados h1 a h3", () => {
    expect(renderMarkdown("# uno\n\n## dos\n\n### tres")).toBe(
      "<h1>uno</h1>\n<h2>dos</h2>\n<h3>tres</h3>"
    );
  });

  test("parrafos separados por linea en blanco", () => {
    expect(renderMarkdown("Hola mundo.\n\nSegundo parrafo.")).toBe(
      "<p>Hola mundo.</p>\n<p>Segundo parrafo.</p>"
    );
  });

  test("parrafo con multiples lineas se une con espacio", () => {
    expect(renderMarkdown("linea uno\nlinea dos")).toBe(
      "<p>linea uno linea dos</p>"
    );
  });

  test("lista con guiones", () => {
    const md = "- primero\n- segundo\n- tercero";
    expect(renderMarkdown(md)).toBe(
      "<ul><li>primero</li><li>segundo</li><li>tercero</li></ul>"
    );
  });

  test("codigo inline con backticks", () => {
    expect(renderMarkdown("usa `printf` para imprimir")).toBe(
      "<p>usa <code>printf</code> para imprimir</p>"
    );
  });

  test("negrita e italica", () => {
    expect(renderMarkdown("hola **mundo** y *chao*")).toBe(
      "<p>hola <strong>mundo</strong> y <em>chao</em></p>"
    );
  });

  test("bloque de codigo fenced escapa HTML", () => {
    const md = "```c\nint main() { return 0; }\n```";
    expect(renderMarkdown(md)).toBe(
      "<pre><code>int main() { return 0; }</code></pre>"
    );
  });

  test("bloque de codigo fenced no ejecuta reglas inline", () => {
    const md = "```\n**no es bold** y `no es code`\n```";
    expect(renderMarkdown(md)).toBe(
      "<pre><code>**no es bold** y `no es code`</code></pre>"
    );
  });

  test("tabla GFM con cabecera y filas", () => {
    const md = [
      "| Entrada | Salida |",
      "| ------- | ------ |",
      "| `Hola`  | `1`    |",
      "| *ok*    | `0`    |"
    ].join("\n");
    const html = renderMarkdown(md);
    expect(html).toContain("<table>");
    expect(html).toContain("<thead><tr><th>Entrada</th><th>Salida</th></tr></thead>");
    expect(html).toContain("<tr><td><code>Hola</code></td><td><code>1</code></td></tr>");
    expect(html).toContain("<tr><td><em>ok</em></td><td><code>0</code></td></tr>");
  });

  test("inyeccion <script> queda escapada literal", () => {
    const html = renderMarkdown("<script>alert('x')</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
  });

  test("inyeccion <img onerror> queda escapada literal", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">');
    // Ninguna variante del tag pasa: ni el tag literal ni su forma con espacios.
    expect(html).not.toContain("<img");
    expect(html).not.toContain('"alert(1)"');
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  test("HTML dentro de un code span sigue escapado", () => {
    expect(renderMarkdown("prueba `<b>x</b>` fin")).toBe(
      "<p>prueba <code>&lt;b&gt;x&lt;/b&gt;</code> fin</p>"
    );
  });

  test("caracteres HTML sueltos en parrafo escapan", () => {
    expect(renderMarkdown("5 < 10 && 10 > 5")).toBe(
      "<p>5 &lt; 10 &amp;&amp; 10 &gt; 5</p>"
    );
  });

  test("negrita puede contener code inline", () => {
    expect(renderMarkdown("**usa `x`**")).toBe(
      "<p><strong>usa <code>x</code></strong></p>"
    );
  });

  test("estatuto real de statement.md se convierte a HTML valido y seguro", () => {
    const md = [
      "# Contar minusculas",
      "",
      "Recorre una cadena y **cuenta** sus letras minusculas.",
      "",
      "## Entrada",
      "",
      "Una sola linea de hasta 1000 caracteres.",
      "",
      "## Ejemplos",
      "",
      "| Entrada      | Salida |",
      "| ------------ | ------ |",
      "| `Hola Mundo` | `7`    |",
      "| *(vacia)*    | `0`    |",
      "",
      "## Notas",
      "",
      "- La cadena termina en `'\\0'`.",
      "- Solo cuentan `'a'`-`'z'`."
    ].join("\n");
    const html = renderMarkdown(md);
    expect(html.startsWith("<h1>Contar minusculas</h1>")).toBe(true);
    expect(html).toContain("<strong>cuenta</strong>");
    expect(html).toContain("<h2>Entrada</h2>");
    expect(html).toContain("<h2>Ejemplos</h2>");
    expect(html).toContain("<em>(vacia)</em>");
    expect(html).toContain("<ul><li>La cadena termina en <code>&#39;\\0&#39;</code>.</li>");
    expect(html).not.toContain("<script");
  });
});
