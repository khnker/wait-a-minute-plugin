import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Calcula el hash SHA-256 del contenido de un archivo.
 */
export function calculateContentHash(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(content).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Representación de la evidencia que sustenta una asociación semántica.
 */
export class Evidence {
  constructor({ type, value, source, timestamp = new Date().toISOString() }) {
    this.type = type; // e.g., 'symbol', 'path', 'user_confirmation', 'import'
    this.value = value;
    this.source = source;
    this.timestamp = timestamp;
  }
}

export class StructuralIndexEntry {
  constructor({ path, hash, symbols = [], exports = [], imports = [], module = null, repositoryId, indexerVersion = "1.0.0" }) {
    this.path = path;
    this.hash = hash;
    this.symbols = symbols;
    this.exports = exports;
    this.imports = imports;
    this.module = module;
    this.repositoryId = repositoryId;
    this.indexerVersion = indexerVersion;
    this.updatedAt = new Date().toISOString();
  }
}

export class SemanticDictionaryEntry {
  constructor({ concept, targets = [], aliases = [], confidence = 0, evidence = [], status = "discovered" }) {
    this.concept = concept;
    this.targets = targets; // Array of paths or symbols
    this.aliases = aliases;
    this.confidence = confidence; // 0.0 - 1.0
    this.evidence = evidence; // Array of Evidence objects
    this.status = status; // discovered, candidate, confirmed, invalid
    this.updatedAt = new Date().toISOString();
  }
}

export class ContextDictionary {
  constructor(root = process.cwd()) {
    this.root = root;
    this.filePath = path.join(root, ".wam", "context-dictionary.json");
    this.structuralIndex = new Map(); // path -> StructuralIndexEntry
    this.semanticDictionary = new Map(); // concept -> SemanticDictionaryEntry
    this.load();
  }

  load() {
    if (fs.existsSync(this.filePath)) {
      const data = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
      this.structuralIndex = new Map(Object.entries(data.structuralIndex || {}));
      this.semanticDictionary = new Map(Object.entries(data.semanticDictionary || {}));
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({
      structuralIndex: Object.fromEntries(this.structuralIndex),
      semanticDictionary: Object.fromEntries(this.semanticDictionary),
    }, null, 2));
  }

  indexFile(filePath) {
    const hash = calculateContentHash(filePath);
    if (!hash) return;

    const relPath = path.relative(this.root, filePath);
    const entry = new StructuralIndexEntry({
      path: relPath,
      hash,
      repositoryId: path.basename(this.root)
    });
    
    this.structuralIndex.set(relPath, entry);
    this.save();
  }

  invalidateFile(filePath) {
    const relPath = path.relative(this.root, filePath);
    if (this.structuralIndex.has(relPath)) {
      this.structuralIndex.delete(relPath);
      this.save();
    }
  }

  resolveConcept(concept) {
    return this.semanticDictionary.get(concept) || null;
  }
}
