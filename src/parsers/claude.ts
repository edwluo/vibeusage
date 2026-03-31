#!/usr/bin/env node

// ── Claude Code JSONL 解析器 ──────────────────────────────────
// 读取 ~/.claude/projects/ 下的 JSONL 会话文件
// 提取: session 数量、消息数、工具调用、时间分布

import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";

// ── Types ──

export interface ClaudeSession {
  id: string;
  project: string;
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: string[];
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  fileSizeBytes: number;
  firstTimestamp: Date | null;
  lastTimestamp: Date | null;
  customTitle: string | null;
  modelBreakdown: Map<string, number>; // model → message count
}

export interface ClaudeOverview {
  totalSessions: number;
  totalMessages: number;
  totalUserMessages: number;
  totalAssistantMessages: number;
  totalToolCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  toolBreakdown: Map<string, number>;
  projectBreakdown: Map<string, number>;
  modelBreakdown: Map<string, number>; // model → message count
  sessions: ClaudeSession[];
  totalBytes: number;
}

interface ContentBlock {
  type: string;
  name?: string;
  text?: string;
  id?: string;
}

interface JsonlLine {
  type?: string;
  timestamp?: string;
  message?: {
    model?: string;
    content?: string | ContentBlock[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  title?: string;
  summary?: string;
}

// ── Parser ──

const CLAUDE_DIR = join(homedir(), ".claude", "projects");
const MAX_SESSIONS = 200; // 安全限制
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB, 超大文件只扫尾部

export async function parseClaudeSessions(
  daysBack: number = 7
): Promise<ClaudeOverview> {
  const overview: ClaudeOverview = {
    totalSessions: 0,
    totalMessages: 0,
    totalUserMessages: 0,
    totalAssistantMessages: 0,
    totalToolCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    toolBreakdown: new Map(),
    projectBreakdown: new Map(),
    modelBreakdown: new Map(),
    sessions: [],
    totalBytes: 0,
  };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  let projectDirs: string[];
  try {
    projectDirs = await readdir(CLAUDE_DIR);
  } catch {
    return overview; // ~/.claude/projects/ 不存在
  }

  for (const projectDir of projectDirs) {
    const projectPath = join(CLAUDE_DIR, projectDir);

    let files: string[];
    try {
      const s = await stat(projectPath);
      if (!s.isDirectory()) continue;
      files = await readdir(projectPath);
    } catch {
      continue;
    }

    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

    for (const file of jsonlFiles) {
      if (overview.sessions.length >= MAX_SESSIONS) break;

      const filePath = join(projectPath, file);
      try {
        const fileStat = await stat(filePath);

        // 按修改时间过滤
        if (fileStat.mtime < cutoff) continue;

        const session = await parseSessionFile(
          filePath,
          basename(file, ".jsonl"),
          projectDir,
          fileStat.size
        );
        overview.sessions.push(session);
      } catch {
        continue; // 解析失败跳过
      }
    }
  }

  // ── 汇总统计 ──
  for (const s of overview.sessions) {
    overview.totalSessions++;
    overview.totalMessages += s.messageCount;
    overview.totalUserMessages += s.userMessages;
    overview.totalAssistantMessages += s.assistantMessages;
    overview.totalToolCalls += s.toolCalls.length;
    overview.totalInputTokens += s.inputTokens;
    overview.totalOutputTokens += s.outputTokens;
    overview.totalCacheCreationTokens += s.cacheCreationTokens;
    overview.totalCacheReadTokens += s.cacheReadTokens;
    overview.totalBytes += s.fileSizeBytes;

    for (const tool of s.toolCalls) {
      overview.toolBreakdown.set(
        tool,
        (overview.toolBreakdown.get(tool) ?? 0) + 1
      );
    }

    for (const [model, count] of s.modelBreakdown) {
      overview.modelBreakdown.set(
        model,
        (overview.modelBreakdown.get(model) ?? 0) + count
      );
    }

    const current = overview.projectBreakdown.get(s.project) ?? 0;
    overview.projectBreakdown.set(s.project, current + 1);
  }

  // 按最近活跃排序
  overview.sessions.sort((a, b) => {
    const ta = a.lastTimestamp?.getTime() ?? 0;
    const tb = b.lastTimestamp?.getTime() ?? 0;
    return tb - ta;
  });

  return overview;
}

async function parseSessionFile(
  filePath: string,
  sessionId: string,
  project: string,
  fileSize: number
): Promise<ClaudeSession> {
  const session: ClaudeSession = {
    id: sessionId,
    project,
    messageCount: 0,
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: [],
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    fileSizeBytes: fileSize,
    firstTimestamp: null,
    lastTimestamp: null,
    customTitle: null,
    modelBreakdown: new Map(),
  };

  // 超大文件只读尾部 256KB
  let content: string;
  if (fileSize > MAX_FILE_SIZE) {
    const buf = Buffer.alloc(256 * 1024);
    const { open } = await import("node:fs/promises");
    const fh = await open(filePath, "r");
    try {
      const { bytesRead } = await fh.read(buf, 0, buf.length, fileSize - buf.length);
      content = buf.subarray(0, bytesRead).toString("utf-8");
      // 跳过可能截断的第一行
      const firstNewline = content.indexOf("\n");
      if (firstNewline > 0) content = content.slice(firstNewline + 1);
    } finally {
      await fh.close();
    }
  } else {
    content = await readFile(filePath, "utf-8");
  }

  const lines = content.split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;

    let parsed: JsonlLine;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    // 时间戳
    if (parsed.timestamp) {
      const ts = new Date(parsed.timestamp);
      if (!isNaN(ts.getTime())) {
        if (!session.firstTimestamp || ts < session.firstTimestamp)
          session.firstTimestamp = ts;
        if (!session.lastTimestamp || ts > session.lastTimestamp)
          session.lastTimestamp = ts;
      }
    }

    switch (parsed.type) {
      case "user":
        session.userMessages++;
        session.messageCount++;
        break;
      case "assistant": {
        session.assistantMessages++;
        session.messageCount++;

        // 模型追踪（跳过合成消息）
        const model = parsed.message?.model;
        if (model && model !== "<synthetic>") {
          session.modelBreakdown.set(
            model,
            (session.modelBreakdown.get(model) ?? 0) + 1
          );
        }

        // 提取 token 使用量（含 cache 拆分）
        const usage = parsed.message?.usage;
        if (usage) {
          session.inputTokens += usage.input_tokens ?? 0;
          session.outputTokens += usage.output_tokens ?? 0;
          session.cacheCreationTokens +=
            usage.cache_creation_input_tokens ?? 0;
          session.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
        }

        // 从 content blocks 提取 tool_use
        const content = parsed.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "tool_use" && block.name) {
              session.toolCalls.push(block.name);
            }
          }
        }
        break;
      }
      case "custom-title":
        if (parsed.title) session.customTitle = parsed.title;
        break;
    }
  }

  return session;
}
