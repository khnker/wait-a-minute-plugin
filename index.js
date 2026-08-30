import { analyze } from "./engine.js";
import { loadConfig, saveActivePreset, saveActiveMode } from "./router/config";
import { getActiveTiers, resolvePresetName } from "./router/protocol";
import { resolveEnforcementMode } from "./router/enforcement";

/**
 * Wait a Minute plugin for OpenCode.
 * 
 * Intercepts the prompt via chat.message hook before skill resolution and
 * agent execution. Runs pre-flight cognitive analysis classifying the request,
 * inspecting the project, detecting assumptions, and selecting relevant skills.
 * 
 * The analysis results are stored in the session and can be accessed by the
 * main agent before proceeding with implementation.
 */
const WaitAMinutePlugin = async (ctx) => {
  let cfg = loadConfig();
  const activeTiers = getActiveTiers(cfg);

  // Per-plugin-instance session store
  const sessionStore = new Map();

  // Track if plugin is bypassed
  let bypassed = false;

  // -------------------------------------------------------------------------
  // Chat message hook — fires before skill resolution and agent invocation
  // -------------------------------------------------------------------------
  ctx.on("chat.message", async (input, output) => {
    try {
      // Check bypass
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
        tierCaps: {
          fast: cfg.tierCaps?.fast ?? 8,
          medium: cfg.tierCaps?.medium ?? 5,
          heavy: cfg.tierCaps?.heavy ?? 3,
        },
        activePreset: cfg.activePreset || "omni",
        activeMode: cfg.activeMode || "normal",
      });

      // Store analysis results in session for access by agent
      sessionStore.set("waitAnalysis", analysis);

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
    inject: () => {/* handled in chat.message */},
    setConfig: (cfgPatch) => {
      try {
        Object.assign(cfg, cfgPatch);
        saveActivePreset(cfg.activePreset || "omni");
      } catch {}
    },
  };

  // -------------------------------------------------------------------------
  // Configurable commands
  // -------------------------------------------------------------------------
  cfg.commands ??= {};
  cfg.commands["wait-a-minute"] = {
    template: "$ARGUMENTS",
    description:
      "Run wait-a-minute pre-flight analysis on a prompt. Usage: /wait-a-minute \"<prompt>\"",
  };

  cfg.commands["wait-a-minute-status"] = {
    template: "",
    description:
      "Show last wait-a-minute analysis results from current session",
  };

  // -------------------------------------------------------------------------
  // Preset/configuration integration
  // -------------------------------------------------------------------------
  for (const [name, tier] of Object.entries(activeTiers)) {
    const resolvedPrompt = tier.prompt ?? cfg.tierPrompts?.[name];

    // Inject wait-a-minute awareness into tier prompts
    if (resolvedPrompt && !resolvedPrompt.includes("wait-a-minute")) {
      tier.prompt = `${resolvedPrompt}\n\n[wait-a-minute will analyze this prompt before skill resolution.]`;
    }
  }

  return {
    name: "wait-a-minute",
    description:
      "OpenCode plugin con hook de prompt para pre-flight cognitivo Wait a Minute",
  };
};

/**
 * Wait a Minute - Pre-Flight Cognitive Layer for OpenCode
 * 
 * Main entry point. Analiza una petición de usuario antes de que el agente
 * comience su procesamiento. Devuelve un resumen estructurado que el agente
 * puede usar para decidir cómo proceder.
 */

export default {
  name: "wait-a-minute",

  /**
   * Analiza el prompt del usuario y retorna el contexto de pre-flight.
   * 
   * @param {Object} options - Options for analysis
   * @param {string} options.prompt - El prompt del usuario
   * @param {string} [options.projectPath] - Ruta del proyecto (opcional, usa cwd por defecto)
   * @param {Object} [options.config] - Configuración de OpenCode
   * @param {Object} [options.tierCaps] - Caps por tier
   * @param {string} [options.activePreset] - Preset activo
   * @param {string} [options.activeMode] - Modo activo
   * @returns {Object} - Resultado del análisis de pre-flight
   */
  analyze: async function({ prompt, projectPath, config, tierCaps, activePreset, activeMode } = {}) {
    // Validate prompt
    if (!prompt || typeof prompt !== "string") {
      throw new Error("Prompt is required and must be a string");
    }

    // Trim and validate
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      return {
        intent: { classification: "trivial", ambiguity: "low", confidence: 100 },
        project: { detected_stack: "unknown", architecture: "unknown", relevant_files: [] },
        known: ["Prompt vacío o nulo"],
        inferred: [],
        assumed: [],
        unknown: ["No hay prompt para analizar"],
        skills: {
          candidates: [],
          selected: [],
          rejected: [],
        },
        risk: "low",
        complexity: "trivial",
        ambiguity: "low",
        strategy: "FAST",
        ready: true,
        advice: "Sin prompt - sin análisis necesario",
      };
    }

    // Run the engine analysis
    const result = await analyze({
      prompt: trimmedPrompt,
      projectPath: projectPath || process.cwd(),
      config,
      tierCaps: tierCaps || {
        fast: 8,
        medium: 5,
        heavy: 3,
      },
      activePreset: activePreset || "omni",
      activeMode: activeMode || "normal",
    });

    // Post-process: add human-readable summary
    const summary = generateSummary(result);

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

    // Intent
    lines.push(`Intención: ${result.intent.classification} (confianza: ${result.intent.confidence}%)`);

    // Project
    lines.push(`Stack: ${result.project.detected_stack}`);
    if (result.project.architecture !== "unknown") {
      lines.push(`Arquitectura: ${result.project.architecture}`);
    }

    // Known/Inferred/Assumed/Unknown
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

    // Skills
    lines.push(`\nSkills candidatas: ${result.skills.candidates.slice(0, 5).map(c => c.name).join(", ")}`);
    lines.push(`Skills seleccionadas: ${result.skills.selected.join(", ")}`);
    if (result.skills.rejected.length > 0) {
      lines.push(`Skills rechazadas: ${result.skills.rejected.join(", ")}`);
    }

    // Risk/Complexity/Ambiguity
    lines.push(`\nRiesgo: ${result.risk}`);
    lines.push(`Complejidad: ${result.complexity}`);
    lines.push(`Ambigüedad: ${result.ambiguity}`);

    // Strategy/mode
    lines.push(`\nEstrategia: ${result.strategy}`);

    // Readiness
    lines.push(`\n¿Listo para proceder?: ${result.ready ? "SÍ" : "NO"}`);

    // Advice
    lines.push(`\nConsejo: ${result.advice || ""}`);

    return lines.join("\n");
  },

  /**
   * Verifica si el prompt puede ser procesado en modo FAST (trivial)
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

    return strictPatterns.some(p => p.test(lower));
  },
};