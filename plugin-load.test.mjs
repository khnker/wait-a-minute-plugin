/**
 * Regression test — opencode 1.18.25 plugin API.
 *
 * Bug corregido: el plugin usaba la API vieja (ctx.on, ctx.system, ctx.command)
 * y opencode 1.18.25 fallaba al cargarlo: `Plugin export is not a function`
 * primero y `ctx.on is not a function` tras apuntar al path correcto.
 * La API nueva exige: default export = función factory que RECIBE el plugin
 * input ({ client, project, directory, $ }) y RETORNA el objeto de hooks:
 *   { config, "chat.message", "command.execute.before", ... }
 *
 * Ejecutar: node --test plugin-load.test.mjs (Node 20+)
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pluginDefault from "./index.js";

test("default export es una función (Plugin factory)", () => {
  assert.equal(typeof pluginDefault, "function");
});

test("factory retorna objeto de hooks (no usa ctx.on / ctx.system / ctx.command)", async () => {
  const hooks = await pluginDefault({
    directory: process.cwd(),
    client: {},
    project: {},
    $: {},
  });
  assert.equal(typeof hooks, "object");
  for (const key of ["config", "chat.message", "command.execute.before"]) {
    assert.equal(typeof hooks[key], "function", `hook ${key} debe ser función`);
  }
  const src = fs.readFileSync(new URL("./index.js", import.meta.url), "utf-8");
  assert.ok(!src.includes("ctx.on("), "no debe usar ctx.on (API vieja)");
  assert.ok(!src.includes("ctx.command &&"), "no debe usar ctx.command (API vieja)");
  assert.ok(!src.includes("ctx.experimental"), "no debe usar ctx.experimental (API vieja)");
});

test("config hook registra el comando /wam", async () => {
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });
  const opencodeConfig = {};
  await hooks.config(opencodeConfig);
  assert.ok(opencodeConfig.command?.wam, "debe registrar comando 'wam'");
  assert.ok(opencodeConfig.command.wam.template === "$ARGUMENTS");
  assert.ok(opencodeConfig.command.wam.description.startsWith("Wait-a-Minute CLI"));
});

test("command.execute.before atiende /wam y hace push a output.parts", async () => {
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });
  const output = { parts: [] };
  await hooks["command.execute.before"]({ command: "wam", arguments: "skills explain rename variable x" }, output);
  assert.ok(output.parts.length > 0, "debe emitir al menos un part");
  assert.equal(output.parts[0].type, "text");
  assert.ok(output.parts[0].text.length > 0);
});

test("command.execute.before ignora comandos que no son /wam", async () => {
  const hooks = await pluginDefault({ directory: process.cwd(), client: {}, project: {}, $: {} });
  const output = { parts: [] };
  await hooks["command.execute.before"]({ command: "otro", arguments: "x" }, output);
  assert.equal(output.parts.length, 0);
});

test("chat.message no crashea (best-effort) y persiste estado en dir escribible", async () => {
  const attempt = async (dir) => {
    const hooks = await pluginDefault({ directory: dir, client: {}, project: {}, $: {} });
    await hooks["chat.message"](
      { parts: [{ type: "text", text: "refactoriza el scraper" }], taskId: "test-task" },
      { system: [] }
    );
    const p = path.join(dir, ".wam", "tasks", "test-task", "state.yaml");
    return { p, ok: fs.existsSync(p) };
  };

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wam-test-"));
  let res = await attempt(tmp);
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}

  if (!res.ok) {
    // fallback sandboxes con quota en /tmp: usa el .wam gitignored del proyecto
    res = await attempt(process.cwd());
  }
  assert.ok(res.ok, `debe persistir estado en ${res.p}`);
  try {
    fs.rmSync(path.dirname(res.p), { recursive: true, force: true });
  } catch {}
});

test("methods adjuntos al export siguen disponibles (analyze)", async () => {
  const r = await pluginDefault.analyze({ prompt: "rename variable x to y" });
  assert.ok(r.intent && r.strategy, "analyze debe retornar análisis");
  assert.ok(pluginDefault.isTrivial("rename x to y"), "isTrivial detecta rename");
});