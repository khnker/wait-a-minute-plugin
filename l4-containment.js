import vm from "node:vm";

export function runInSandbox(code, context = {}) {
  const sandbox = vm.createContext({ ...context });
  return vm.runInContext(code, sandbox);
}
