/**
 * Wait a Minute — Pre-Flight Cognitive Analysis Engine
 * 
 * Analiza peticiones de usuario antes de la resolución de skills y la ejecución del agente.
 * Clasifica la tarea, inspecciona el proyecto, detecta supuestos y selecciona skills.
 */

const fs = await import("node:fs");
const path = await import("node:path");
const { execSync } = await import("node:child_process");
const os = await import("node:os");
const tmpdir = os.tmpdir();


// -- Project Analysis Helpers --

/**
 * Lee un archivo si existe, retorna vacío en caso contrario
 */
function readFileSafely(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Verifica si un archivo existe
 */
function fileExists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ejecuta un comando y captura salida, falla silenciosamente
 */
function runCommand(cmd) {
  try {
    return execSync(cmd, { cwd: process.cwd, timeout: 10000, encoding: "utf-8" });
  } catch {
    return "";
  }
}

/**
 * Obtiene el contenido de AGENTS.md si existe
 */
function getAgentsMd(projectPath) {
  const agentsPath = path.join(projectPath, "AGENTS.md");
  return readFileSafely(agentsPath);
}

/**
 * Obtiene el package.json si existe
 */
function getPackageJson(projectPath) {
  const pkgPath = path.join(projectPath, "package.json");
  if (!fileExists(pkgPath)) return null;
  try {
    return JSON.parse(readFileSafely(pkgPath));
  } catch {
    return null;
  }
}

/**
 * Obtiene dependencias relevantes del package.json
 */
function getDependencies(pkgJson) {
  if (!pkgJson) return {};
  return {
    ...(pkgJson.dependencies || {}),
    ...(pkgJson.devDependencies || {}),
  };
}

/**
 * Detecta el stack tecnológico del proyecto
 */
function detectStack(projectPath) {
  const signals = [];

  if (!fileExists(path.join(projectPath, "package.json"))) {
    return { stack: "unknown", languages: [] };
  }

  const pkg = getPackageJson(projectPath);
  if (!pkg) return { stack: "unknown", languages: [] };

  const deps = getDependencies(pkg);
  const languages = [];

  // Node/TypeScript/JavaScript
  if (deps.typescript || deps.ts) languages.push("typescript");
  if (deps.vue || deps["vue-template-compiler"]) languages.push("vue");
  if (deps.react || deps["react-dom"]) languages.push("react");
  if (deps.svelte) languages.push("svelte");

  // Python
  if (deps.flask || deps.django) {
    languages.push("python");
  }

  // Go
  if (deps.go || deps["go.mod"]) languages.push("go");

  // Rust
  if (deps.rust || deps["Cargo.toml"]) languages.push("rust");

  // Java
  if (deps.java || deps["javax"]) languages.push("java");

  // PHP
  if (deps.laravel || deps.symfony || deps.woocommerce) languages.push("php");

  // Ruby
  if (deps.ruby || deps["rake"]) languages.push("ruby");

  // Determine primary stack
  const primary = languages.length > 0 ? languages[0] : "other";

  return { stack: primary, languages };
}

/**
 * Obtiene la configuración de OpenCode (agents.md equivalents)
 */
function getOpenCodeConfig(projectPath) {
  // Check for .opencode directory
  const opencodeDir = path.join(projectPath, ".opencode");
  if (!fileExists(opencodeDir)) return null;

  // Check for AGENTS.md
  const agentsMd = readFileSafely(path.join(opencodeDir, "AGENTS.md"));
  if (agentsMd.trim()) return { agentsMd };

  // Check for opencode.jsonc
  const configPath = path.join(opencodeDir, "opencode.jsonc");
  if (fileExists(configPath)) {
    try {
      return { opencodeJsonc: readFileSafely(configPath) };
    } catch {}
  }

  return null;
}

/**
 * Busca skills relevantes en las directories conocidas
 */
function discoverSkills() {
  const skillDirs = [
    "/home/nicolas/.config/opencode/skills",
    "/home/nicolas/.config/opencode/.skills",
    "/home/nicolas/.claude/skills",
    "/home/nicolas/.agents/skills",
    "/home/nicolas/.opencode/skills",
  ];

  const candidates = {};

  for (const skillDir of skillDirs) {
    if (!fileExists(skillDir)) continue;

    const entries = fs.readdirSync(skillDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(skillDir, entry.name, "SKILL.md");
      if (fileExists(skillPath)) {
        // Avoid duplicates
        if (!candidates[entry.name]) {
          candidates[entry.name] = {
            name: entry.name,
            path: skillPath,
            dir: skillDir,
          };
        }
      }
    }
  }

  return candidates;
}

/**
 * Clasifica la petición del usuario
 */
function classifyRequest(prompt) {
  const lower = prompt.toLowerCase();

  // Trivial patterns - bypass wait-a-minute
  const trivialPatterns = [
    /^\s*rename\s+/i,
    /^\s*change\s+\w+/i,
    /^\s*what(is|are)\s+/i,
    /^\s*explain\s+/i,
    /^\s*how\s+to\s+/i,
    /^\s*list\s+/i,
    /^\s*show\s+/i,
    /^\s*get\s+\w+/i,
  ];

  for (const pattern of trivialPatterns) {
    if (pattern.test(prompt)) {
      return { type: "trivial", ambiguity: "low", confidence: 95 };
    }
  }

  // Architecture/security/high-risk patterns -> STRICT
  const strictPatterns = [
    /(migra|migrate)/i,
    /(seguridad|security)/i,
    /(arquitectura|architecture)/i,
    /(provee(?:r|ndase)|provide)/i,
    /(alto impacto|high impact)/i,
    /(producción|production)/i,
    /(destructivo|destructive)/i,
  ];

  let strictMatch = null;
  for (const pattern of strictPatterns) {
    if (pattern.test(prompt)) {
      strictMatch = pattern;
      break;
    }
  }

  if (strictMatch) {
    return {
      type: "architectural",
      ambiguity: "medium",
      confidence: 60,
      mode: "STRICT",
    };
  }

  // Research/exploration patterns
  const researchPatterns = [
    /(buscar|research)/i,
    /(comparar|compare)/i,
    /(opciones|options)/i,
    /(alternativas|alternatives)/i,
  ];

  for (const pattern of researchPatterns) {
    if (pattern.test(prompt)) {
      return { type: "research", ambiguity: "medium", confidence: 70 };
    }
  }

  // Default: normal ambiguity
  return { type: "normal", ambiguity: "medium", confidence: 50 };
}

/**
 * Inspecciona el proyecto para Known/Inferred/Assumed/Unknown
 */
async function inspectProject(projectPath) {
  const known = [];
  const inferred = [];
  const assumed = [];
  const unknown = [];

  // Read AGENTS.md
  const agentsMd = getAgentsMd(projectPath);
  if (agentsMd.trim()) {
    known.push("AGENTS.md presente en el proyecto");
  }

  // Read package.json
  const pkgJson = getPackageJson(projectPath);
  if (pkgJson) {
    known.push("package.json detectado");
    known.push(`Dependencias: ${Object.keys(pkgJson.dependencies || {}).join(", ") || "ninguna"}`);

    // Detect framework
    const deps = { ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) };
    if (deps["@nestjs/*"] || deps.nestjs) inferred.push("NestJS framework detectado");
    if (deps["@angular/core"] || deps.angular) inferred.push("Angular framework detectado");
    if (deps.express) inferred.push("Express.js detectado");
    if (deps["@nestjs/core"]) inferred.push("NestJS core detectado");
  }

  // Detect OpenSpec specs
  const openspecDir = path.join(projectPath, "openspec");
  if (fileExists(openspecDir)) {
    known.push("Directorio openspec presente");
    // List specs
    try {
      const specFiles = fs.readdirSync(openspecDir).filter(f => f.endsWith(".md"));
      if (specFiles.length > 0) {
        known.push(`Specs OpenSpec: ${specFiles.join(", ")}`);
      }
    } catch {}
  }

  // Detect skills in project
  const skillCandidates = discoverSkills();
  if (Object.keys(skillCandidates).length > 0) {
    known.push(`Skills disponibles: ${Object.keys(skillCandidates).join(", ")}`);
  }

  // Detect stack
  const stackInfo = detectStack(projectPath);
  if (stackInfo.stack !== "unknown") {
    known.push(`Stack tecnológico: ${stackInfo.stack}`);
    stackInfo.languages.forEach(lang => inferred.push(`Idioma: ${lang}`));
  }

  // If we have minimal info, add generic unknowns
  if (known.length < 3) {
    unknown.push("Contexto del proyecto limitado - inspección recomendada");
  }

  return { known, inferred, assumed, unknown };
}

/**
 * Audita supuestos detectados en la petición
 */
function auditAssumptions(prompt, projectInfo) {
  const assumptions = [];

  // Common assumptions based on prompt language
  const lower = prompt.toLowerCase();

  // If user mentions "add X" without context
  if (/agregar|add/.test(lower) && !/ya tiene|already has/.test(lower)) {
    assumptions.push("El usuario asume que se necesita agregar nueva funcionalidad");
  }

  // If mentions performance
  if (/mejorar.*rendimiento|performance/.test(lower)) {
    assumptions.push("El usuario asume que la mejora de rendimiento es la prioridad");
  }

  // If mentions authentication
  if (/autentic(?:ión|ar|o|a)|oauth|jwt/.test(lower)) {
    assumptions.push("El usuario asume que el cambio es sobre autenticación");
  }

  // If mentions cache/redis
  if (/(cache|redis)/.test(lower)) {
    assumptions.push("El usuario asume que se necesita cache/redis");
  }

  // Project-context assumptions
  if (projectInfo) {
    const { known, inferred } = projectInfo;

    // If NestJS detected but user says "add auth"
    if (inferred.some(i => i.includes("NestJS")) && /auth/.test(lower)) {
      assumptions.push("NestJS auth module existente - ¿reemplazar o extender?");
    }

    // If Angular detected
    if (inferred.some(i => i.includes("Angular")) && /service/.test(lower)) {
      assumptions.push("Angular service - ¿nueva o reemplazo?");
    }
  }

  return assumptions;
}

/**
 * Descubre skills relevantes para la tarea
 */
function discoverSkillsForTask(prompt, projectInfo, availableSkills) {
  const lower = prompt.toLowerCase();
  const candidates = [];
  const selected = [];
  const rejected = [];

  // Evaluate each available skill
  for (const [name, skillInfo] of Object.entries(availableSkills)) {
    const description = (skillInfo.description || "").toLowerCase();
    const triggers = (skillInfo.triggers || []).map(t => t.toLowerCase());

    let relevanceScore = 0;
    let isRedundant = false;

    // Check triggers match
    const triggerMatch = triggers.some(t => lower.includes(t));
    if (triggerMatch) relevanceScore += 20;

    // Check description keywords
    const keywordCounts = {
      implementation: ["implement", "crear", "agregar", "add", "nuevo"],
      refactoring: ["refactor", "mejorar", "restructur"],
      debugging: ["bug", "error", "fallo", "debug"],
      security: ["seguridad", "security", "vulnerabil", "auth", "oauth"],
      testing: ["test", "pruebas", "jest", "mocha"],
      architecture: ["arquitectura", "architecture", "diseño", "design"],
      performance: ["rendimiento", "performance", "optimizar", "cache"],
      migration: ["migra", "migrate", "upgrade"],
      documentation: ["doc", "documenta", "readme"],
    };

    for (const [category, keywords] of Object.entries(keywordCounts)) {
      const matches = keywords.filter(k => description.includes(k) || lower.includes(k));
      if (matches.length > 0) {
        relevanceScore += matches.length * 10;
        // Check if this category is already selected
        if (selected.some(s => s.category === category)) {
          isRedundant = true;
        }
      }
    }

    // Check project-awareness
    if (projectInfo) {
      const { inferred } = projectInfo;
      // Project-specific skill selection
      if (inferred.some(i => i.includes("NestJS")) && name === "nestjs-best-practices") {
        relevanceScore += 30;
      }
      if (inferred.some(i => i.includes("Angular")) && name === "angular-developer") {
        relevanceScore += 30;
      }
    }

    // Deduplication: reject if too redundant
    if (isRedundant && relevanceScore < 40) {
      relevanceScore -= 20;
    }

    // Only include skills with meaningful relevance
    if (relevanceScore >= 30) {
      candidates.push({
        name,
        relevance: relevanceScore,
        description: skillInfo.description,
      });
    }
  }

  // Sort by relevance
  candidates.sort((a, b) => b.relevance - a.relevance);

  // Select top 3-5, reject the rest
  const maxSelect = 5;
  for (let i = 0; i < Math.min(candidates.length, maxSelect); i++) {
    selected.push(candidates[i].name);
  }
  for (let i = maxSelect; i < candidates.length; i++) {
    rejected.push(candidates[i].name);
  }

  // If no candidates have enough relevance, select based on task type
  if (selected.length === 0) {
    const type = classifyRequest(prompt);
    const fallbackSkills = {
      question: ["frontend-boundary-protection", "efficient-coding"],
      research: ["graphify", "nestjs-best-practices"],
      debugging: ["nestjs-best-practices", "efficient-coding"],
      "bug-fix": ["nestjs-best-practices", "efficient-coding"],
      implementation: ["nestjs-best-practices", "efficient-coding"],
      refactoring: ["nestjs-best-practices", "efficient-coding"],
      architecture: ["architectural-governance", "nestjs-best-practices"],
      security: ["nestjs-best-practices", "efficient-coding"],
      performance: ["nestjs-best-practices", "efficient-coding"],
      testing: ["nestjs-best-practices", "efficient-coding"],
      migration: ["nestjs-best-practices", "efficient-coding"],
      infrastructure: ["nestjs-best-practices", "efficient-coding"],
      documentation: ["nestjs-best-practices", "efficient-coding"],
      investigation: ["graphify", "nestjs-best-practices"],
      planning: ["nestjs-best-practices", "efficient-coding"],
      "destructive-operation": ["nestjs-best-practices", "efficient-coding"],
    }[type.type] || ["efficient-coding"];

    for (const skill of fallbackSkills) {
      if (availableSkills[skill]) selected.push(skill);
      else rejected.push(skill);
    }
  }

  return { candidates, selected, rejected };
}

/**
 * Determina el modo de operación (FAST/NORMAL/STRICT)
 */
function determineMode(classification, projectInfo, riskLevel) {
  // FAST: trivial tasks
  if (classification.type === "trivial") return { mode: "FAST", reason: "Tarea trivial y no ambigua" };

  // STRICT: high risk or architectural
  if (riskLevel === "high" || classification.type === "architectural") return { mode: "STRICT", reason: "Alto riesgo o decisión arquitectónica" };

  // Check for STRICT triggers in prompt
  const lower = (classification.prompt || "").toLowerCase();
  const strictTriggers = ["migra", "security", "arquitectura", "producción", "destructivo"];
  if (strictTriggers.some(t => lower.includes(t))) {
    return { mode: "STRICT", reason: "Triggers STRICT detectados en la petición" };
  }

  // Default: NORMAL
  return { mode: "NORMAL", reason: "Modo por defecto - análisis ligero" };
}

/**
 * Main analysis function - entry point for the plugin
 */
export async function analyze(options) {
  const {
    prompt,
    projectPath,
    config,
    tierCaps,
    activePreset,
    activeMode,
  } = options;

  // Step 1: Classify the request
  const classification = classifyRequest(prompt);

  // Step 2: Inspect the project
  const projectInfo = await inspectProject(projectPath || process.cwd());

  // Step 3: Audit assumptions
  const assumptions = auditAssumptions(prompt, projectInfo);

  // Step 4: Discover available skills and select relevant ones
  const availableSkills = discoverSkills();

  // Filter skills that exist in the known locations
  const filterAvailableSkills = {};
  for (const [name, info] of Object.entries(availableSkills)) {
    // Check if the skill path exists
    // We'll include all available skills and let the plugin handle loading
    filterAvailableSkills[name] = info;
  }

  // Step 5: Select skills for this task
  const skillSelection = discoverSkillsForTask(prompt, projectInfo, filterAvailableSkills);

  // Step 6: Determine mode and contract
  const riskLevel = assumptions.some(a => /alto riesgo|high risk|peligroso|destructivo/.test(a)) ? "high" : "medium";
  const modeInfo = determineMode(classification, projectInfo, riskLevel);

  // Completion Contract proposal
  const completionContract = {
    requirements: [
        "Tarea completada según intención",
        "Resultados verificables"
    ],
    constraints: [],
    verification: ["Evidencia de satisfacción del contrato"],
    status: "PROPOSED",
    rigor: modeInfo.mode
  };

  // Step 7: Build the output
  const result = {
    intent: {
      classification: classification.type,
      ambiguity: classification.ambiguity,
      confidence: classification.confidence,
    },
    completionContract,
    project: {
      detected_stack: projectInfo.detected_stack || "unknown",
      architecture: projectInfo.known?.includes("openspec") ? "openspec project" : "unknown",
      relevant_files: [
        ...(projectInfo.known?.includes("AGENTS.md") ? ["AGENTS.md"] : []),
        ...(projectInfo.known?.includes("package.json") ? ["package.json"] : []),
      ],
    },
    known: projectInfo.known,
    inferred: projectInfo.inferred,
    assumed: assumptions,
    unknown: projectInfo.unknown,

    questions: [],

    skills: {
      candidates: skillSelection.candidates.map(c => ({ name: c.name, relevance: c.relevance })),
      selected: skillSelection.selected,
      rejected: skillSelection.rejected,
    },

    risk: riskLevel,
    complexity: classification.type === "trivial" ? "trivial" : "medium",
    ambiguity: classification.ambiguity,
    strategy: modeInfo.mode,

    ready: modeInfo.mode === "FAST" || (modeInfo.mode === "NORMAL" && classification.type !== "architectural" && riskLevel !== "high"),
  };

  // Add mode-specific info
  if (modeInfo.mode === "STRICT") {
    result.strict = true;
    result.advice = "Análisis profundo requerido antes de continuar. Verificar supuestos y decisiones arquitectónicas.";
  } else if (modeInfo.mode === "FAST") {
    result.fast = true;
    result.advice = "Tarea trivial - proceder directamente sin entrevista";
  } else {
    result.strict = false;
    result.fast = false;
    result.advice = "Análisis normal - inspección contextual y preguntas solo si necesarias";
  }

  return result;
}