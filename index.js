import { analyze } from "./engine.js";

/**
 * Wait a Minute plugin for OpenCode — Pre-Flight Cognitive Layer.
 *
 * Intercepts the prompt via chat.message hook before skill resolution and
 * agent execution. Runs pre-flight cognitive analysis classifying the request,
 * inspecting the project, detecting assumptions, and selecting relevant skills.
 *
 * The analysis results are stored in the session and can be accessed by the
 * main agent before proceeding with implementation.
 */

const DEFAULT_CONFIG = {
  tierCaps: { fast: 8, medium: 5, heavy: 3 },
  activePreset: "omni",
  activeMode: "normal",
  tierPrompts: {},
};

/**
 * Plugin factory — loaded by OpenCode when registered in opencode.jsonc.
 * Autocontained: no external deps beyond ./engine.js.
 */
const WaitAMinutePlugin = async (ctx) => {
  let cfg = { ...DEFAULT_CONFIG };

  // Per-plugin-instance session store
  const sessionStore = new Map();

  // Track if plugin is bypassed
  let bypassed = false;

  // -------------------------------------------------------------------------
  // Chat message hook — fires before skill resolution and agent invocation
  // -------------------------------------------------------------------------
  ctx.on("chat.message", async (input, output) => {
    try {
      if (bypassed) return;

      // Extract user prompt text
      let promptText = "";
      if (input?.parts && input.parts.length > 0) {
        const textPart = input.parts.find(
          (p) => p.type === "text" && typeof p.text === "string"
        );
        promptText = textPart?.text || "";
      } else if (input?.text && typeof input.text === "string") {
        promptText = input.text;
      }

      if (!promptText.trim()) return;

      // Run wait-a-minute pre-flight analysis
      const analysis = await waitAMinute.analyze({
        prompt: promptText,
        projectPath: ctx.directory,
        config: cfg,
        tierCaps: cfg.tierCaps,
        activePreset: cfg.activePreset,
        activeMode: cfg.activeMode,
      });

      // Store analysis results in session for access by agent
      sessionStore.set("waitAnalysis", analysis);

      // Present strategic confirmation for non-trivial tasks
      if (analysis.strategy !== "FAST") {
        waitAMinute.presentValidation({ analysis, ctx: output });
      }

      // Inject analysis summary into the system prompt if configured
      if (cfg.experimental?.waitAMinuteInject === true) {
        const summaryLine = `[wait-a-minute: ${analysis.intent.classification}@${analysis.risk}@${analysis.complexity}]`;
        if (!output?.system) output.system = [];
        output.system.unshift({
          type: "text",
          text: `${summaryLine}\n`,
        });
      }

      // Store for later access by the orchestrator
      input.waitAnalysis = analysis;
    } catch (err) {
      // Best-effort: never crash the session on wait-a-minute error
      console.error("[wait-a-minute] Pre-flight analysis failed:", err);
    }
  });

  // -------------------------------------------------------------------------
  // Experimental: inject analysis into system prompt
  // -------------------------------------------------------------------------
  ctx.experimental = ctx.experimental || {};
  ctx.experimental.waitAMinute = {
    inject: () => {},
    setConfig: (cfgPatch) => {
      try {
        Object.assign(cfg, cfgPatch);
      } catch {}
    },
  };

  // -------------------------------------------------------------------------
  // Commands registration
  // -------------------------------------------------------------------------
  cfg.commands ??= {};
  cfg.commands["wait-a-minute"] = {
    template: "$ARGUMENTS",
    description:
      'Run wait-a-minute pre-flight analysis on a prompt. Usage: /wait-a-minute "<prompt>"',
  };

  cfg.commands["wait-a-minute-status"] = {
    template: "",
    description:
      "Show last wait-a-minute analysis results from current session",
  };

  return {
    name: "wait-a-minute",
    description:
      "OpenCode plugin con hook de prompt para pre-flight cognitivo Wait a Minute",
  };
};

/**
 * Wait a Minute — Pre-Flight Cognitive Layer public API.
 */
const waitAMinute = {
  name: "wait-a-minute",

  /**
   * Analiza el prompt del usuario y retorna el contexto de pre-flight.
   *
   * @param {Object} options
   * @param {string} options.prompt - El prompt del usuario
   * @param {string} [options.projectPath] - Ruta del proyecto (usa cwd por defecto)
   * @param {Object} [options.config] - Configuración
   * @param {Object} [options.tierCaps] - Caps por tier
   * @returns {Object} - Resultado del análisis de pre-flight
   */
  analyze: async function({
    prompt,
    projectPath,
    config,
    tierCaps,
    activePreset,
    activeMode,
  } = {}) {
    if (!prompt || typeof prompt !== "string") {
      return {
        intent: { classification: "trivial", ambiguity: "low", confidence: 100 },
        project: { detected_stack: "unknown", architecture: "unknown", relevant_files: [] },
        known: [],
        inferred: [],
        assumed: [],
        unknown: ["No hay prompt para analizar"],
        skills: { candidates: [], selected: [], rejected: [] },
        risk: "low",
        complexity: "trivial",
        ambiguity: "low",
        strategy: "FAST",
        ready: true,
        advice: "Sin prompt - sin análisis necesario",
      };
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      return {
        intent: { classification: "trivial", ambiguity: "low", confidence: 100 },
        project: { detected_stack: "unknown", architecture: "unknown", relevant_files: [] },
        known: ["Prompt vacío o nulo"],
        inferred: [],
        assumed: [],
        unknown: ["No hay prompt para analizar"],
        skills: { candidates: [], selected: [], rejected: [] },
        risk: "low",
        complexity: "trivial",
        ambiguity: "low",
        strategy: "FAST",
        ready: true,
        advice: "Sin prompt - sin análisis necesario",
      };
    }

    const result = await analyze({
      prompt: trimmedPrompt,
      projectPath: projectPath || process.cwd(),
      config,
      tierCaps: tierCaps || DEFAULT_CONFIG.tierCaps,
      activePreset: activePreset || DEFAULT_CONFIG.activePreset,
      activeMode: activeMode || DEFAULT_CONFIG.activeMode,
    });

    const summary = this.generateSummary(result);

    return {
      ...result,
      _summary: summary,
    };
  },

  /**
   * Genera un resumen humano-readable del análisis de pre-flight.
   */
  generateSummary: function(result) {
    const lines = [];

    lines.push(
      `Intención: ${result.intent.classification} (confianza: ${result.intent.confidence}%)`
    );
    lines.push(`Stack: ${result.project.detected_stack}`);
    if (result.project.architecture !== "unknown") {
      lines.push(`Arquitectura: ${result.project.architecture}`);
    }

    if (result.known.length > 0) {
      lines.push(`\nConocido(s): ${result.known.slice(0, 5).join("; ")}`);
    }
    if (result.inferred.length > 0) {
      lines.push(`Inferido(s): ${result.inferred.slice(0, 5).join("; ")}`);
    }
    if (result.assumed.length > 0) {
      lines.push(`Asumido(s): ${result.assumed.slice(0, 3).join("; ")}`);
    }
    if (result.unknown.length > 0) {
      lines.push(`Desconocido(s): ${result.unknown.slice(0, 3).join("; ")}`);
    }

    lines.push(
      `\nSkills candidatas: ${result.skills.candidates
        .slice(0, 5)
        .map((c) => c.name)
        .join(", ")}`
    );
    lines.push(`Skills seleccionadas: ${result.skills.selected.join(", ")}`);
    if (result.skills.rejected.length > 0) {
      lines.push(`Skills rechazadas: ${result.skills.rejected.join(", ")}`);
    }

    lines.push(`\nRiesgo: ${result.risk}`);
    lines.push(`Complejidad: ${result.complexity}`);
    lines.push(`Ambigüedad: ${result.ambiguity}`);
    lines.push(`\nEstrategia: ${result.strategy}`);
    lines.push(`\n¿Listo para proceder?: ${result.ready ? "SÍ" : "NO"}`);
    lines.push(`\nConsejo: ${result.advice || ""}`);

    return lines.join("\n");
  },

  /**
   * Verifica si el prompt puede ser procesado en modo FAST (trivial).
   * Basado en el CONTENIDO del prompt, no en el origen (usuario/agente).
   */
  isTrivial: function(prompt) {
    const lower = prompt.toLowerCase().trim();
    const fastPatterns = [
      /^\s*rename\s+/i,
      /^\s*change\s+\w+/i,
      /^\s*what(is|are)\s+/i,
      /^\s*explain\s+/i,
      /^\s*how\s+to\s+/i,
      /^\s*list\s+/i,
      /^\s*show\s+\w+/i,
      /^\s*get\s+\w+/i,
      /^\s*error\s+line/i,
      /^\s*fix\s+this/i,
    ];

    for (const pattern of fastPatterns) {
      if (pattern.test(lower)) return true;
    }
    return false;
  },

  /**
   * Verifica si el prompt requiere modo STRICT (arquitectura, seguridad, etc.)
   */
  requiresStrict: function(prompt) {
    const lower = prompt.toLowerCase();
    const strictPatterns = [
      /migra|migrate/i,
      /seguridad|security/i,
      /arquitectura|architecture/i,
      /alto impacto|high impact/i,
      /producción|production/i,
      /destructivo|destructive/i,
    ];

    return strictPatterns.some((p) => p.test(lower));
  },

  /**
   * Presentar validación de pre-flight al agente/usuario.
   *
   * Checkpoint estratégico: muestra el resumen y solicita confirmación
   * sobre la estrategia a seguir. En modo FAST se omita (proceder directo).
   *
   * @param {Object} opts
   * @param {Object} opts.analysis - Resultado de analyze()
   * @returns {Object} - { mode: 'continue'|'validation-pending', ... }
   */
  presentValidation: async function({ analysis, ctx } = {}) {
    if (!analysis) {
      return { mode: "continue", advice: "No hay análisis previo" };
    }

    const summary = this.generateSummary(analysis);
    const mode = analysis.strategy || "NORMAL";

    // FAST omite validación (basado en contenido, no origen)
    const showValidation = mode !== "FAST";
    if (!showValidation) {
      return { mode: "continue", advice: "Tarea trivial - proceder directamente" };
    }

    const validationLines = [
      "Wait a minute — Confirmación estratégica",
      "",
      `Intención: ${analysis.intent.classification} (confianza: ${analysis.intent.confidence}%) | Modo: ${mode}`,
      `Stack: ${analysis.project.detected_stack}`,
      analysis.project.architecture !== "unknown" &&
        `Arquitectura: ${analysis.project.architecture}`,
      "",
      "Conocido(s): " +
        (analysis.known.length > 0 ? analysis.known.slice(0, 3).join(", ") : "ninguno"),
      "Inferido(s): " +
        (analysis.inferred.length > 0 ? analysis.inferred.slice(0, 3).join(", ") : "ninguno"),
      "Asumido(s): " +
        (analysis.assumed.length > 0 ? analysis.assumed.slice(0, 3).join(", ") : "ninguno"),
      "Desconocido(s): " +
        (analysis.unknown.length > 0 ? analysis.unknown.slice(0, 3).join(", ") : "ninguno"),
      "",
      "Skills seleccionadas: " + analysis.skills.selected.join(", "),
      analysis.skills.rejected.length > 0 &&
        `Skills rechazadas: ${analysis.skills.rejected.join(", ")}`,
      "",
      `Riesgo: ${analysis.risk} | Complejidad: ${analysis.complexity} | Ambigüedad: ${analysis.ambiguity}`,
      `Estrategia recomendada: ${analysis.strategy}`,
      "",
      "¿Proceder con esta estrategia?",
      "  [continuar]   → Ejecutar implementación con estrategia " + mode,
      "  [corregir]    → Ver detalles y hacer ajustes",
      "  [más información] → Expandir análisis completo",
      "",
      "Respuesta esperada: continuar / corregir / más información",
    ];

    if (ctx && ctx.system) {
      ctx.system.unshift({
        type: "text",
        text: validationLines.join("\n") + "\n",
      });
    }

    return {
      mode: "validation-pending",
      summary,
      validationLines,
      advice: "Esperando respuesta del agente/usuario",
    };
  },
};

Object.keys(waitAMinute).forEach((k) => {
  if (k === "name") return;
  WaitAMinutePlugin[k] = waitAMinute[k];
});
export default WaitAMinutePlugin;