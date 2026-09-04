import path from "node:path";
import fs from "node:fs";

export const PersistenceManager = {
  getCanonicalPath(type, taskId = null, filename = null) {
    const root = process.cwd();
    let base = path.join(root, ".wam");
    
    switch (type) {
      case 'context':
        base = path.join(base, 'context');
        break;
      case 'task':
        base = path.join(base, 'tasks', taskId);
        break;
      case 'traces':
        base = path.join(base, 'traces');
        break;
      case 'history':
        base = path.join(base, 'history');
        break;
      default:
        throw new Error(`Tipo de persistencia no reconocido: ${type}`);
    }
    
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
    
    if (filename === 'task-context.md') filename = 'context.md';
    
    return filename ? path.join(base, filename) : base;
  },

  cleanLegacy(filePath) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[PersistenceManager] Hard-deleted legacy file: ${filePath}`);
    }
  }
};
