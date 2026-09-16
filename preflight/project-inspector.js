import fs from "node:fs";
import path from "node:path";

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
 * Obtiene el contenido de AGENTS.md si existe
 */
export function getAgentsMd(projectPath) {
  const agentsPath = path.join(projectPath, "AGENTS.md");
  if (!fileExists(agentsPath)) return "";
  return fs.readFileSync(agentsPath, "utf-8");
}

/**
 * Obtiene el package.json si existe
 */
export function getPackageJson(projectPath) {
  const pkgPath = path.join(projectPath, "package.json");
  if (!fileExists(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Obtiene dependencias relevantes del package.json
 */
export function getDependencies(pkgJson) {
  if (!pkgJson) return {};
  return {
    ...(pkgJson.dependencies || {}),
    ...(pkgJson.devDependencies || {}),
  };
}

/**
 * Detecta el stack tecnológico del proyecto
 */
export function detectStack(projectPath) {
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
