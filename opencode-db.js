import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const OPENCODE_DB_PATH = path.join(
  process.env.HOME || "/home/nicolas",
  ".local/share/opencode/opencode.db"
);

let dbInstance = null;

function getDb() {
  if (dbInstance) return dbInstance;
  if (!fs.existsSync(OPENCODE_DB_PATH)) {
    console.error("[wait-a-minute] OpenCode DB not found:", OPENCODE_DB_PATH);
    return null;
  }
  try {
    dbInstance = new DatabaseSync(OPENCODE_DB_PATH, { readOnly: true });
    return dbInstance;
  } catch (err) {
    console.error("[wait-a-minute] Failed to open OpenCode DB:", err.message);
    return null;
  }
}

export function getSessionMessages(sessionId, limit = 20) {
  const db = getDb();
  if (!db) return [];

  try {
    const stmt = db.prepare(`
      SELECT id, time_created, data
      FROM message
      WHERE session_id = ?
      ORDER BY time_created DESC
      LIMIT ?
    `);
    const rows = stmt.all(sessionId, limit);
    return rows.map((row) => ({
      id: row.id,
      timeCreated: row.timeCreated,
      ...JSON.parse(row.data),
    }));
  } catch (err) {
    console.error("[wait-a-minute] Failed to query session messages:", err.message);
    return [];
  }
}

export function getSessionParts(sessionId, limit = 50) {
  const db = getDb();
  if (!db) return [];

  try {
    const stmt = db.prepare(`
      SELECT p.id, p.time_created, p.data, p.message_id
      FROM part p
      JOIN message m ON p.message_id = m.id
      WHERE m.session_id = ?
      ORDER BY p.time_created DESC
      LIMIT ?
    `);
    const rows = stmt.all(sessionId, limit);
    return rows.map((row) => ({
      id: row.id,
      timeCreated: row.timeCreated,
      messageId: row.messageId,
      ...JSON.parse(row.data),
    }));
  } catch (err) {
    console.error("[wait-a-minute] Failed to query session parts:", err.message);
    return [];
  }
}

export function getToolCallsFromSession(sessionId, limit = 100) {
  const parts = getSessionParts(sessionId, limit);
  return parts
    .filter((p) => p.type === "tool" && p.tool)
    .map((p) => ({
      tool: p.tool,
      callId: p.callID,
      command: p.state?.input?.command,
      output: p.state?.output,
      exitCode: p.state?.metadata?.exit,
      startTime: p.time?.start,
      endTime: p.time?.end,
    }));
}

export function getTextFromSession(sessionId, limit = 10) {
  const parts = getSessionParts(sessionId, limit * 5);
  return parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => ({
      text: p.text,
      messageId: p.messageId,
      timeCreated: p.timeCreated,
    }));
}

export function findSessionBySlug(slug) {
  const db = getDb();
  if (!db) return null;

  try {
    const stmt = db.prepare(`
      SELECT id, title, time_created
      FROM session
      WHERE id LIKE ?
      LIMIT 1
    `);
    const row = stmt.get(`%${slug}%`);
    return row || null;
  } catch (err) {
    console.error("[wait-a-minute] Failed to find session:", err.message);
    return null;
  }
}

export function getRecentActions(sessionId, minutes = 30) {
  const db = getDb();
  if (!db) return [];

  const cutoff = Date.now() - minutes * 60 * 1000;
  try {
    const stmt = db.prepare(`
      SELECT p.id, p.time_created, p.data
      FROM part p
      JOIN message m ON p.message_id = m.id
      WHERE m.session_id = ?
        AND p.data LIKE '%"type":"tool"%'
        AND p.time_created > ?
      ORDER BY p.time_created DESC
    `);
    const rows = stmt.all(sessionId, cutoff);
    return rows.map((row) => {
      const data = JSON.parse(row.data);
      return {
        id: row.id,
        timeCreated: row.timeCreated,
        tool: data.tool,
        command: data.state?.input?.command,
        output: data.state?.output,
        exitCode: data.state?.metadata?.exit,
      };
    });
  } catch (err) {
    console.error("[wait-a-minute] Failed to get recent actions:", err.message);
    return [];
  }
}
