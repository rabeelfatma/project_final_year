/**
 * Lightweight syntax highlighter — no third-party dependency, never executes code.
 */

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const KEYWORDS = {
  javascript: /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|typeof|instanceof|switch|case|break|continue|default|null|undefined|true|false)\b/g,
  typescript: /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|typeof|interface|type|enum|public|private|protected|readonly|null|undefined|true|false)\b/g,
  python: /\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|with|yield|lambda|True|False|None|and|or|not|in|is|pass|break|continue|async|await)\b/g,
  java: /\b(public|private|protected|class|interface|return|if|else|for|while|import|package|static|void|new|try|catch|throw|throws|true|false|null)\b/g,
  csharp: /\b(public|private|protected|class|interface|return|if|else|for|while|using|namespace|static|void|new|try|catch|throw|true|false|null|async|await)\b/g,
  cpp: /\b(int|float|double|char|void|class|struct|return|if|else|for|while|include|namespace|using|new|delete|true|false|nullptr|public|private|protected)\b/g,
  c: /\b(int|float|double|char|void|return|if|else|for|while|include|struct|typedef|sizeof|NULL)\b/g,
  php: /\b(function|return|if|else|foreach|for|while|class|public|private|protected|echo|print|true|false|null|namespace|use)\b/g,
  sql: /\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|JOIN|LEFT|RIGHT|INNER|OUTER|GROUP|ORDER|BY|AND|OR|NOT|AS|ON|INTO|VALUES|CREATE|TABLE|INDEX|LIMIT)\b/gi,
  shell: /\b(if|then|else|fi|for|do|done|while|case|esac|function|return|echo|export|source)\b/g,
  go: /\b(func|return|if|else|for|range|package|import|var|const|type|struct|interface|map|chan|go|defer|true|false|nil)\b/g,
  rust: /\b(fn|let|mut|return|if|else|for|while|loop|match|struct|enum|impl|trait|use|mod|pub|crate|true|false|Self)\b/g,
  ruby: /\b(def|class|module|return|if|elsif|else|end|for|while|do|yield|require|true|false|nil|unless|case|when)\b/g,
  kotlin: /\b(fun|val|var|return|if|else|for|while|class|interface|when|import|package|true|false|null|object|data)\b/g,
  swift: /\b(func|var|let|return|if|else|for|while|class|struct|enum|import|true|false|nil|guard|switch|case)\b/g,
  dart: /\b(void|class|return|if|else|for|while|import|true|false|null|final|const|var|async|await)\b/g,
  lua: /\b(function|return|if|then|else|elseif|end|for|while|do|local|true|false|nil|and|or|not)\b/g,
  perl: /\b(sub|return|if|else|elsif|for|foreach|while|use|my|our|true|false|undef)\b/g,
  r: /\b(function|return|if|else|for|while|library|TRUE|FALSE|NULL|NA|repeat|next|break)\b/g,
  css: /\b(color|background|display|flex|grid|margin|padding|border|width|height|font|position|absolute|relative|fixed)\b/g,
  html: /\b(html|head|body|div|span|script|style|link|meta|title|class|id|href|src)\b/gi,
  plaintext: null,
};

export function highlightCode(source, language = "plaintext") {
  const lang = KEYWORDS[language] ? language : "plaintext";
  const raw = String(source || "");
  const slots = [];
  const park = (html) => {
    const key = `§QC${slots.length}SLOT§`;
    slots.push(html);
    return key;
  };

  // Extract strings/comments from raw source before HTML escaping.
  let working = raw
    .replace(/(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g, (m) => park(`<span class="qc-syn-str">${escapeHtml(m)}</span>`));

  if (lang === "python" || lang === "shell" || lang === "ruby" || lang === "perl" || lang === "r") {
    working = working.replace(/(^|\n)([ \t]*#.*)/g, (_, a, b) => `${a}${park(`<span class="qc-syn-com">${escapeHtml(b)}</span>`)}`);
  } else if (lang === "sql") {
    working = working.replace(/(--.*)/g, (m) => park(`<span class="qc-syn-com">${escapeHtml(m)}</span>`));
  } else {
    working = working.replace(/(\/\/.*)/g, (m) => park(`<span class="qc-syn-com">${escapeHtml(m)}</span>`));
    working = working.replace(/(\/\*[\s\S]*?\*\/)/g, (m) => park(`<span class="qc-syn-com">${escapeHtml(m)}</span>`));
  }

  let html = escapeHtml(working);
  html = html.replace(/§QC(\d+)SLOT§/g, (_, idx) => slots[Number(idx)] || "");

  // Protect parked spans so later keyword/number passes cannot nest inside them.
  const done = [];
  const parkDone = (m) => {
    const key = `§DONE${done.length}§`;
    done.push(m);
    return key;
  };
  html = html.replace(/<span class="qc-syn-(?:str|com)">[\s\S]*?<\/span>/g, parkDone);
  html = html.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="qc-syn-num">$1</span>');
  html = html.replace(/<span class="qc-syn-num">[\s\S]*?<\/span>/g, parkDone);
  const re = KEYWORDS[lang];
  if (re) html = html.replace(re, '<span class="qc-syn-kw">$&</span>');
  html = html.replace(/§DONE(\d+)§/g, (_, idx) => done[Number(idx)] || "");
  return html;
}

export function renderMarkdownLite(source) {
  const escaped = escapeHtml(source);
  const lines = escaped.split(/\r?\n/);
  const out = [];
  let inCode = false;
  let codeBuf = [];

  const flushCode = () => {
    if (!codeBuf.length) return;
    out.push(`<pre class="qc-md-code"><code>${codeBuf.join("\n")}</code></pre>`);
    codeBuf = [];
  };

  for (const line of lines) {
    if (/^```/.test(line)) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    if (/^###\s+/.test(line)) out.push(`<h3>${line.replace(/^###\s+/, "")}</h3>`);
    else if (/^##\s+/.test(line)) out.push(`<h2>${line.replace(/^##\s+/, "")}</h2>`);
    else if (/^#\s+/.test(line)) out.push(`<h1>${line.replace(/^#\s+/, "")}</h1>`);
    else if (/^[-*]\s+/.test(line)) out.push(`<li>${line.replace(/^[-*]\s+/, "")}</li>`);
    else if (!line.trim()) out.push("<br/>");
    else {
      const rich = line
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`([^`]+)`/g, "<code>$1</code>");
      out.push(`<p>${rich}</p>`);
    }
  }
  if (inCode) flushCode();
  return out.join("\n");
}

export function parseDelimitedTable(text, separator = ",") {
  const lines = String(text || "").split(/\r?\n/).filter((line) => line.length > 0).slice(0, 500);
  return lines.map((line) => {
    const cells = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && ch === separator) {
        cells.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    cells.push(current);
    return cells;
  });
}
