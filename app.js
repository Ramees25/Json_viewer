const input = document.querySelector("#jsonInput");
const output = document.querySelector("#jsonOutput");
const indentSize = document.querySelector("#indentSize");
const statusNode = document.querySelector("#status");
const inputCount = document.querySelector("#inputCount");
const outputCount = document.querySelector("#outputCount");
const formatBtn = document.querySelector("#formatBtn");
const minifyBtn = document.querySelector("#minifyBtn");
const copyBtn = document.querySelector("#copyBtn");
const sampleBtn = document.querySelector("#sampleBtn");
const clearBtn = document.querySelector("#clearBtn");

const sampleJson = {
  project: "JSON Viewer",
  version: 1,
  active: true,
  features: ["format", "minify", "copy", "validate"],
  user: {
    name: "Ramees",
    timezone: "Asia/Calcutta"
  },
  metrics: {
    files: 3,
    ready: null
  }
};

let formattedText = "";

class PhpDumpParser {
  constructor(text) {
    this.text = text;
    this.index = 0;
  }

  parseValues() {
    const values = [];

    while (this.skipWhitespace()) {
      values.push(this.parseValue());
    }

    return values;
  }

  parseValue() {
    this.skipWhitespace();

    if (this.startsWith("string(")) {
      return this.parseString();
    }

    if (this.startsWith("array(")) {
      return this.parseArray();
    }

    if (this.startsWith("int(")) {
      return this.parseNumber("int");
    }

    if (this.startsWith("float(") || this.startsWith("double(")) {
      return this.parseNumber(this.startsWith("float(") ? "float" : "double");
    }

    if (this.startsWith("bool(")) {
      return this.parseBoolean();
    }

    if (this.startsWith("NULL")) {
      this.index += 4;
      return null;
    }

    throw new Error("Unsupported PHP dump value.");
  }

  parseString() {
    this.consume(/^string\(\d+\)\s*/);
    return this.parseQuotedString();
  }

  parseNumber(type) {
    const value = this.consume(new RegExp(`^${type}\\(([^)]*)\\)`));
    return Number(value[1]);
  }

  parseBoolean() {
    const value = this.consume(/^bool\((true|false)\)/i);
    return value[1].toLowerCase() === "true";
  }

  parseArray() {
    this.consume(/^array\(\d+\)\s*\{/);

    const items = [];
    const object = {};
    let isList = true;

    while (this.skipWhitespace()) {
      if (this.peek() === "}") {
        this.index += 1;
        return isList ? items : object;
      }

      const key = this.parseArrayKey();
      this.skipWhitespace();
      this.consume(/^=>\s*/);
      const value = this.parseValue();

      if (Number.isInteger(key) && key === items.length && isList) {
        items.push(value);
      } else {
        isList = false;
        object[key] = value;
      }
    }

    throw new Error("Unclosed PHP dump array.");
  }

  parseArrayKey() {
    this.skipWhitespace();
    this.expect("[");
    this.skipWhitespace();

    const key = this.peek() === "\"" ? this.parseQuotedString() : this.readUntil("]").trim();

    this.expect("]");

    if (/^-?\d+$/.test(key)) {
      return Number(key);
    }

    return key;
  }

  parseQuotedString() {
    this.expect("\"");
    let value = "";

    while (this.index < this.text.length) {
      const char = this.text[this.index];
      this.index += 1;

      if (char === "\"") {
        return value;
      }

      if (char === "\\" && this.index < this.text.length) {
        value += this.text[this.index];
        this.index += 1;
      } else {
        value += char;
      }
    }

    throw new Error("Unclosed PHP dump string.");
  }

  readUntil(endChar) {
    const start = this.index;
    const end = this.text.indexOf(endChar, this.index);

    if (end === -1) {
      throw new Error("Unclosed PHP dump key.");
    }

    this.index = end;
    return this.text.slice(start, end);
  }

  skipWhitespace() {
    while (this.index < this.text.length && /\s/.test(this.text[this.index])) {
      this.index += 1;
    }

    return this.index < this.text.length;
  }

  startsWith(value) {
    return this.text.startsWith(value, this.index);
  }

  peek() {
    return this.text[this.index];
  }

  expect(value) {
    if (!this.startsWith(value)) {
      throw new Error("Unexpected PHP dump syntax.");
    }

    this.index += value.length;
  }

  consume(pattern) {
    const match = this.text.slice(this.index).match(pattern);

    if (!match) {
      throw new Error("Unexpected PHP dump syntax.");
    }

    this.index += match[0].length;
    return match;
  }
}

function getIndent() {
  return indentSize.value === "tab" ? "\t" : Number(indentSize.value);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightJson(json) {
  const escaped = escapeHtml(json);
  return escaped.replace(/("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"\s*:|"(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b|[{}[\],:])/g, (token) => {
    if (/^"/.test(token) && /:\s*$/.test(token)) {
      return `<span class="token-key">${token.slice(0, token.lastIndexOf(":"))}</span><span class="token-punctuation">:</span>`;
    }

    if (/^"/.test(token)) {
      return `<span class="token-string">${token}</span>`;
    }

    if (/true|false/.test(token)) {
      return `<span class="token-boolean">${token}</span>`;
    }

    if (/null/.test(token)) {
      return `<span class="token-null">${token}</span>`;
    }

    if (/^-?\d/.test(token)) {
      return `<span class="token-number">${token}</span>`;
    }

    return `<span class="token-punctuation">${token}</span>`;
  });
}

function lineAndColumnFromPosition(text, position) {
  const before = text.slice(0, position);
  const lines = before.split("\n");
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizePhpDumpValues(values) {
  if (values.length === 1) {
    return values[0];
  }

  const canBuildRecords = values.length % 2 === 0 && values.every((value, index) => {
    return index % 2 === 0 ? typeof value === "string" : isPlainObject(value);
  });

  if (!canBuildRecords) {
    return values;
  }

  const leadingValues = values.filter((_, index) => index % 2 === 0);
  const dateLike = leadingValues.every((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value));
  const leadingKey = dateLike ? "date" : "key";
  const records = [];

  for (let index = 0; index < values.length; index += 2) {
    records.push({
      [leadingKey]: values[index],
      ...values[index + 1]
    });
  }

  return records;
}

function parsePhpDump(raw) {
  try {
    const values = new PhpDumpParser(raw).parseValues();
    return values.length ? normalizePhpDumpValues(values) : null;
  } catch {
    return null;
  }
}

function parseInput() {
  const raw = input.value.trim();

  if (!raw) {
    throw new Error("Input is empty.");
  }

  try {
    return {
      type: "json",
      value: JSON.parse(raw)
    };
  } catch (jsonError) {
    const phpDump = parsePhpDump(raw);

    if (phpDump !== null) {
      return {
        type: "phpDump",
        value: phpDump
      };
    }

    const error = new Error("Invalid JSON format.");
    error.jsonError = jsonError;
    throw error;
  }
}

function setStatus(type, message) {
  statusNode.className = `status status-${type}`;
  statusNode.textContent = message;
}

function setOutput(text) {
  formattedText = text;
  output.innerHTML = text ? highlightJson(text) : '<span class="placeholder">Formatted JSON appears here.</span>';
  outputCount.textContent = text ? `${text.split("\n").length} lines` : "0 lines";
}

function showError(error) {
  const raw = input.value;
  const originalMessage = String(error.jsonError?.message || error.message);
  const match = originalMessage.match(/position (\d+)/i);
  let message = error.message === "Input is empty." ? "Input is empty." : "Invalid JSON format.";

  if (match) {
    const location = lineAndColumnFromPosition(raw, Number(match[1]));
    message = `Invalid JSON at line ${location.line}, column ${location.column}`;
  } else if (/^\s*(string|array|int|float|double|bool|NULL)\b/.test(raw)) {
    message = "This PHP dump could not be converted.";
  }

  setStatus("error", message);
  setOutput("");
}

function formatJson() {
  try {
    const parsed = parseInput();
    const pretty = JSON.stringify(parsed.value, null, getIndent());
    setOutput(pretty);
    setStatus("valid", parsed.type === "phpDump" ? "Converted PHP dump" : "Valid JSON");
  } catch (error) {
    showError(error);
  }
}

function minifyJson() {
  try {
    const parsed = parseInput();
    const minified = JSON.stringify(parsed.value);
    setOutput(minified);
    setStatus("valid", parsed.type === "phpDump" ? "Converted + minified" : "Minified");
  } catch (error) {
    showError(error);
  }
}

async function copyOutput() {
  if (!formattedText) {
    setStatus("idle", "Nothing to copy");
    return;
  }

  try {
    await navigator.clipboard.writeText(formattedText);
    setStatus("valid", "Copied");
  } catch {
    const range = document.createRange();
    range.selectNodeContents(output);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    setStatus("idle", "Selected");
  }
}

function loadSample() {
  input.value = JSON.stringify(sampleJson);
  updateInputCount();
  formatJson();
}

function clearEditor() {
  input.value = "";
  updateInputCount();
  setOutput("");
  setStatus("idle", "Ready");
  input.focus();
}

function updateInputCount() {
  const length = input.value.length;
  inputCount.textContent = `${length} ${length === 1 ? "char" : "chars"}`;
}

input.addEventListener("input", () => {
  updateInputCount();

  if (!input.value.trim()) {
    setOutput("");
    setStatus("idle", "Ready");
    return;
  }

  formatJson();
});

indentSize.addEventListener("change", () => {
  if (input.value.trim()) {
    formatJson();
  }
});

formatBtn.addEventListener("click", formatJson);
minifyBtn.addEventListener("click", minifyJson);
copyBtn.addEventListener("click", copyOutput);
sampleBtn.addEventListener("click", loadSample);
clearBtn.addEventListener("click", clearEditor);

updateInputCount();
