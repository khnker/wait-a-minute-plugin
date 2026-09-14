/**
 * Skill Routing Constraints — layer responsibility and dependency management.
 *
 * Ensures skills only modify their declared layer and respects dependencies.
 * Prevents cross-layer contamination and skill conflicts.
 */

/**
 * @typedef {"backend" | "frontend" | "shared" | "infrastructure"} Layer
 */

/**
 * @typedef {Object} SkillConstraint
 * @property {string} id - Skill ID
 * @property {Layer[]} allowedLayers - Layers this skill can modify
 * @property {string[]} dependsOn - Skills that must be selected first
 * @property {string[]} conflicts - Skills that cannot coexist
 * @property {string} reason - Why these constraints exist
 */

/**
 * @typedef {Object} RoutingDecision
 * @property {string} skillId
 * @property {boolean} allowed
 * @property {Layer} targetLayer
 * @property {string} reason
 * @property {"constraint" | "dependency" | "conflict" | "budget"} reasonType
 */

/** Default layer constraints for known skill types */
const DEFAULT_CONSTRAINTS = {
  "angular-developer": {
    allowedLayers: ["frontend"],
    dependsOn: [],
    conflicts: ["nestjs-best-practices"],
    reason: "Angular skills should only modify frontend code",
  },
  "nestjs-best-practices": {
    allowedLayers: ["backend"],
    dependsOn: [],
    conflicts: ["angular-developer"],
    reason: "NestJS skills should only modify backend code",
  },
  "frontend-boundary-protection": {
    allowedLayers: ["frontend"],
    dependsOn: [],
    conflicts: [],
    reason: "Frontend protection should only modify frontend code",
  },
  "backend-integrity": {
    allowedLayers: ["backend"],
    dependsOn: [],
    conflicts: [],
    reason: "Backend integrity should only modify backend code",
  },
  "efficient-coding": {
    allowedLayers: ["backend", "frontend", "shared"],
    dependsOn: [],
    conflicts: [],
    reason: "General coding skill, can work on any layer",
  },
  "architectural-governance": {
    allowedLayers: ["backend", "frontend", "shared", "infrastructure"],
    dependsOn: [],
    conflicts: [],
    reason: "Governance skill, can review any layer",
  },
};

/**
 * Detect which layer a file belongs to based on path patterns.
 *
 * @param {string} filePath
 * @returns {Layer | null}
 */
export function detectLayer(filePath) {
  const lower = filePath.toLowerCase();

  // Frontend patterns
  if (
    /\.(component|module|service|directive|pipe|html|css|scss|less)\.(ts|js)$/.test(lower) ||
    /src[\\/]app[\\/]/.test(lower) ||
    /src[\\/]components?[\\/]/.test(lower) ||
    /src[\\/]pages?[\\/]/.test(lower) ||
    /\.(jsx|tsx|vue|svelte)$/.test(lower)
  ) {
    return "frontend";
  }

  // Backend patterns
  if (
    /\.(controller|service|module|guard|interceptor|middleware|resolver)\.(ts|js)$/.test(lower) ||
    /src[\\/](api|server|backend|nest)[\\/]/.test(lower) ||
    /\.entity\.(ts|js)$/.test(lower) ||
    /\.repository\.(ts|js)$/.test(lower) ||
    /\.migration\.(ts|js)$/.test(lower)
  ) {
    return "backend";
  }

  // Infrastructure patterns
  if (
    /(dockerfile|docker-compose|\.yml|\.yaml)$/.test(lower) ||
    /\b(infra|infrastructure|deploy|k8s|terraform)[\\/]/.test(lower) ||
    /\.(tf|tfvars)$/.test(lower)
  ) {
    return "infrastructure";
  }

  // Shared patterns
  if (
    /\b(shared|common|utils?|helpers?|types?|constants?)[\\/]/.test(lower) ||
    /\.(d\.ts|types\.ts)$/.test(lower)
  ) {
    return "shared";
  }

  return null;
}

/**
 * Get constraints for a skill.
 *
 * @param {string} skillId
 * @param {Object} skillRegistry - Skill registry (optional, for dynamic constraints)
 * @returns {SkillConstraint}
 */
export function getSkillConstraints(skillId, skillRegistry = {}) {
  // Check default constraints first
  if (DEFAULT_CONSTRAINTS[skillId]) {
    return { id: skillId, ...DEFAULT_CONSTRAINTS[skillId] };
  }

  // Check skill registry for declared constraints
  const skill = skillRegistry[skillId];
  if (skill?.constraints) {
    return {
      id: skillId,
      allowedLayers: skill.constraints.allowedLayers || ["backend", "frontend", "shared"],
      dependsOn: skill.constraints.dependsOn || [],
      conflicts: skill.constraints.conflicts || [],
      reason: skill.constraints.reason || "No constraints declared",
    };
  }

  // Default: allow all layers
  return {
    id: skillId,
    allowedLayers: ["backend", "frontend", "shared", "infrastructure"],
    dependsOn: [],
    conflicts: [],
    reason: "No constraints declared, allowing all layers",
  };
}

/**
 * Check if a skill can modify a specific layer.
 *
 * @param {string} skillId
 * @param {Layer} targetLayer
 * @param {Object} skillRegistry
 * @returns {RoutingDecision}
 */
export function canModifyLayer(skillId, targetLayer, skillRegistry = {}) {
  const constraints = getSkillConstraints(skillId, skillRegistry);

  if (constraints.allowedLayers.includes(targetLayer)) {
    return {
      skillId,
      allowed: true,
      targetLayer,
      reason: `Skill ${skillId} is allowed to modify ${targetLayer}`,
      reasonType: "constraint",
    };
  }

  return {
    skillId,
    allowed: false,
    targetLayer,
    reason: `Skill ${skillId} is NOT allowed to modify ${targetLayer}. Allowed: ${constraints.allowedLayers.join(", ")}`,
    reasonType: "constraint",
  };
}

/**
 * Check skill dependencies and conflicts.
 *
 * @param {string} skillId
 * @param {string[]} selectedSkills - Currently selected skill IDs
 * @param {Object} skillRegistry
 * @returns {RoutingDecision[]}
 */
export function checkDependencies(skillId, selectedSkills, skillRegistry = {}) {
  const decisions = [];
  const constraints = getSkillConstraints(skillId, skillRegistry);

  // Check dependencies
  for (const dep of constraints.dependsOn) {
    if (!selectedSkills.includes(dep)) {
      decisions.push({
        skillId,
        allowed: false,
        targetLayer: "shared",
        reason: `Skill ${skillId} requires ${dep} to be selected first`,
        reasonType: "dependency",
      });
    }
  }

  // Check conflicts
  for (const conflict of constraints.conflicts) {
    if (selectedSkills.includes(conflict)) {
      decisions.push({
        skillId,
        allowed: false,
        targetLayer: "shared",
        reason: `Skill ${skillId} conflicts with ${conflict}`,
        reasonType: "conflict",
      });
    }
  }

  return decisions;
}

/**
 * Route skills with constraints validation.
 *
 * @param {string[]} candidateSkills - Skills to route
 * @param {string[]} targetFiles - Files to be modified
 * @param {Object} skillRegistry
 * @returns {Object} Routing result
 */
export function routeWithConstraints(candidateSkills, targetFiles, skillRegistry = {}) {
  const allowed = [];
  const rejected = [];
  const selectedLayers = new Set();

  // Detect target layers
  const targetLayers = new Set();
  for (const file of targetFiles) {
    const layer = detectLayer(file);
    if (layer) targetLayers.add(layer);
  }

  // Check each candidate skill
  for (const skillId of candidateSkills) {
    let canRoute = true;
    let rejectReason = "";

    // Check layer constraints
    for (const layer of targetLayers) {
      const decision = canModifyLayer(skillId, layer, skillRegistry);
      if (!decision.allowed) {
        canRoute = false;
        rejectReason = decision.reason;
        break;
      }
    }

    // Check dependencies and conflicts
    const depDecisions = checkDependencies(skillId, allowed, skillRegistry);
    const failedDeps = depDecisions.filter((d) => !d.allowed);
    if (failedDeps.length > 0) {
      canRoute = false;
      rejectReason = failedDeps.map((d) => d.reason).join("; ");
    }

    if (canRoute) {
      allowed.push(skillId);
      for (const layer of targetLayers) {
        selectedLayers.add(layer);
      }
    } else {
      rejected.push({
        skillId,
        reason: rejectReason,
      });
    }
  }

  return {
    allowed,
    rejected,
    targetLayers: Array.from(targetLayers),
    selectedLayers: Array.from(selectedLayers),
  };
}

export { DEFAULT_CONSTRAINTS };
