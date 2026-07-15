import { describe, expect, test } from "bun:test";

import {
  extractExamples,
  renderMarkdown,
  renderMarkdownSection
} from "../src/exercise-detail/markdown";

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

describe("renderMarkdownSection", () => {
  test("extrae ejemplos hasta el siguiente h2", () => {
    const md = [
      "# Eco",
      "",
      "Descripción.",
      "",
      "## Ejemplos",
      "",
      "| Entrada | Salida |",
      "| --- | --- |",
      "| `hola` | `hola` |",
      "",
      "## Notas",
      "",
      "No debe aparecer."
    ].join("\n");

    const html = renderMarkdownSection(md, "Ejemplos");
    expect(html).toContain("<table>");
    expect(html).toContain("<code>hola</code>");
    expect(html).not.toContain("Notas");
    expect(html).not.toContain("No debe aparecer");
  });

  test("tolera encabezados sin tilde y secciones ausentes", () => {
    expect(renderMarkdownSection("## Ejemplos\n\n`1`", "ejémplos")).toBe("<p><code>1</code></p>");
    expect(renderMarkdownSection("## Entrada\n\ntexto", "Ejemplos")).toBe("");
  });
});

describe("extractExamples", () => {
  // Misma forma que los statement.md reales del módulo de strings.
  const statement = [
    "# Contar minúsculas en una línea",
    "",
    "Lee una línea y cuenta sus minúsculas.",
    "",
    "## Ejemplos",
    "",
    "| Entrada      | Salida |",
    "| ------------ | ------ |",
    "| `Hola Mundo` | `7`    |",
    "| `ABC 123!`   | `0`    |",
    "| *(vacía)*    | `0`    |",
    "",
    "## Notas",
    "",
    "- No debe aparecer."
  ].join("\n");

  test("convierte la tabla de ejemplos en pares estructurados", () => {
    const model = extractExamples(statement, "Ejemplos");

    expect(model).not.toBeNull();
    expect(model!.cases).toHaveLength(3);
    expect(model!.extraHtml).toBe("");

    const [first, , third] = model!.cases;
    expect(first.cells).toEqual([
      {
        labelHtml: "Entrada",
        valueHtml: "<code>Hola Mundo</code>",
        isEmpty: false
      },
      { labelHtml: "Salida", valueHtml: "<code>7</code>", isEmpty: false }
    ]);
    // La itálica del enunciado se conserva tal cual: no se reinterpreta como vacío.
    expect(third.cells[0]).toEqual({
      labelHtml: "Entrada",
      valueHtml: "<em>(vacía)</em>",
      isEmpty: false
    });
  });

  test("no arrastra secciones vecinas", () => {
    const model = extractExamples(statement, "Ejemplos");
    const html = JSON.stringify(model);
    expect(html).not.toContain("Notas");
    expect(html).not.toContain("No debe aparecer");
  });

  test("celda vacía o ausente queda marcada, no inventada", () => {
    const md = [
      "## Ejemplos",
      "",
      "| Entrada | Salida |",
      "| --- | --- |",
      "|  | `0` |",
      "| `x` |"
    ].join("\n");

    const model = extractExamples(md, "Ejemplos");
    expect(model!.cases[0].cells[0]).toEqual({
      labelHtml: "Entrada",
      valueHtml: "",
      isEmpty: true
    });
    // Fila corta: la celda que falta existe con su etiqueta y se marca vacía.
    expect(model!.cases[1].cells).toHaveLength(2);
    expect(model!.cases[1].cells[1]).toEqual({
      labelHtml: "Salida",
      valueHtml: "",
      isEmpty: true
    });
  });

  test("soporta más de dos columnas", () => {
    const md = [
      "## Ejemplos",
      "",
      "| Entrada | Salida | Nota |",
      "| --- | --- | --- |",
      "| `a` | `1` | *cuenta* |"
    ].join("\n");

    const cells = extractExamples(md, "Ejemplos")!.cases[0].cells;
    expect(cells).toHaveLength(3);
    expect(cells[2]).toEqual({
      labelHtml: "Nota",
      valueHtml: "<em>cuenta</em>",
      isEmpty: false
    });
  });

  test("conserva el texto de la seccion que no es tabla", () => {
    const md = [
      "## Ejemplos",
      "",
      "Los espacios cuentan.",
      "",
      "| Entrada | Salida |",
      "| --- | --- |",
      "| `a` | `1` |",
      "",
      "Nada más."
    ].join("\n");

    const model = extractExamples(md, "Ejemplos");
    expect(model!.cases).toHaveLength(1);
    expect(model!.extraHtml).toBe("<p>Los espacios cuentan.</p>\n<p>Nada más.</p>");
  });

  test("los valores de la tabla siguen escapados", () => {
    const md = [
      "## Ejemplos",
      "",
      "| Entrada | Salida |",
      "| --- | --- |",
      '| <img src=x onerror="alert(1)"> | `5 < 10` |'
    ].join("\n");

    const cells = extractExamples(md, "Ejemplos")!.cases[0].cells;
    expect(cells[0].valueHtml).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(cells[1].valueHtml).toBe("<code>5 &lt; 10</code>");
  });

  test("devuelve null si la seccion falta o no trae tabla", () => {
    expect(extractExamples("## Entrada\n\ntexto", "Ejemplos")).toBeNull();
    expect(extractExamples("## Ejemplos\n\nSin tabla aquí.", "Ejemplos")).toBeNull();
  });
});
