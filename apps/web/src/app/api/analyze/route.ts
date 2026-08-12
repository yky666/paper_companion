import { randomUUID } from "crypto";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

const reportSections = [
  "背景与问题",
  "创新点",
  "核心方法",
  "实验结果",
  "优劣势",
  "应用场景",
  "个性化建议",
  "复现难度",
] as const;

type Report = Record<(typeof reportSections)[number], string>;
type EvidenceItem = {
  label: string;
  text: string;
};

export const runtime = "nodejs";
export const maxDuration = 120;

function cleanTitle(fileName: string) {
  return fileName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || "Untitled paper";
}

function truncateForPrompt(text: string, limit = 12000) {
  return text.replace(/\s+/g, " ").slice(0, limit);
}

function extractEvidence(text: string): EvidenceItem[] {
  const keywords =
    /(BLEU|ROUGE|accuracy|Acc\.?|mAP|IoU|F1|AUC|AP50|AP75|WER|CER|CIDEr|METEOR|Recall|Precision|PSNR|SSIM|benchmark|dataset|WMT|COCO|ImageNet|ablation|消融|数据集|指标|准确率|精度|召回|实验|基准)/i;
  const numberPattern = /(\d+(?:\.\d+)?\s?%?|\d+\.\d+)/;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 30 && line.length <= 360);

  const seen = new Set<string>();
  const evidence: EvidenceItem[] = [];

  for (const line of lines) {
    if (!keywords.test(line) || !numberPattern.test(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push({
      label: line.match(keywords)?.[0] ?? "metric",
      text: line,
    });
    if (evidence.length >= 28) break;
  }

  return evidence;
}

function sliceAround(text: string, patterns: RegExp[], limit = 2600) {
  const normalized = text.replace(/\r/g, "");
  const lower = normalized.toLowerCase();
  let best = -1;
  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match?.index !== undefined) {
      best = match.index;
      break;
    }
  }
  if (best < 0) return "";
  const start = Math.max(0, best - 600);
  return normalized.slice(start, start + limit).replace(/\s+/g, " ").trim();
}

function buildPaperDossier(text: string, evidence: EvidenceItem[]) {
  const normalized = text.replace(/\s+/g, " ");
  const abstract = sliceAround(text, [/abstract/i, /摘要/], 2600) || normalized.slice(0, 2600);
  const introduction = sliceAround(text, [/introduction/i, /引言/], 2600);
  const method = sliceAround(text, [/method/i, /approach/i, /model architecture/i, /方法/], 3400);
  const experiment = sliceAround(text, [/experiment/i, /evaluation/i, /results/i, /实验/], 4200);
  const conclusion = sliceAround(text, [/conclusion/i, /discussion/i, /结论/], 2200);
  const tail = normalized.slice(Math.max(0, normalized.length - 2200));
  const evidenceText = evidence.length
    ? evidence.map((item, index) => `${index + 1}. [${item.label}] ${item.text}`).join("\n")
    : "未从文本中自动提取到明确指标句。";

  return `
【摘要/开头】
${abstract}

【引言附近】
${introduction || "未定位到引言片段。"}

【方法附近】
${method || "未定位到方法片段。"}

【实验/结果附近】
${experiment || "未定位到实验片段。"}

【结论/末尾】
${conclusion || tail}

【自动提取的数据证据】
${evidenceText}
`.slice(0, 18000);
}

async function extractPdfText(file: File) {
  const workDir = await mkdtemp(path.join(tmpdir(), "paper-companion-"));
  const pdfPath = path.join(workDir, `${randomUUID()}.pdf`);
  const textPath = path.join(workDir, "paper.txt");

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(pdfPath, bytes);
    await execFileAsync("pdftotext", ["-layout", "-enc", "UTF-8", pdfPath, textPath], {
      timeout: 45_000,
      maxBuffer: 1024 * 1024 * 20,
    });
    const text = await readFile(textPath, "utf8");
    return text.trim();
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function getOllamaModel() {
  const configured = process.env.OLLAMA_ANALYSIS_MODEL;
  if (configured) return configured;

  try {
    const response = await fetch(`${process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434"}/api/tags`, {
      cache: "no-store",
    });
    const data = await response.json();
    const names = (data.models ?? []).map((model: { name: string }) => model.name);
    return names.find((name: string) => name.includes("gemma3:4b")) ?? names[0] ?? "gemma3:4b";
  } catch {
    return "gemma3:4b";
  }
}

async function getCandidateModels() {
  const configured = await getOllamaModel();
  const base = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";

  try {
    const response = await fetch(`${base}/api/tags`, { cache: "no-store" });
    const data = await response.json();
    const available = (data.models ?? []).map((model: { name: string }) => model.name) as string[];
    const preferred = [configured, "gemma3:4b", "gemma3:1b", "gemma3:12b"];
    return [...new Set(preferred.filter((name) => available.includes(name)))];
  } catch {
    return [configured];
  }
}

async function callOllama(model: string, prompt: string, useJson = false) {
  const base = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  const response = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      ...(useJson ? { format: "json" } : {}),
      options: {
        temperature: 0.15,
        num_ctx: 8192,
        num_predict: 3200,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama ${model} failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return String(data.response ?? "");
}

function parseSectionedReport(raw: string): Report {
  const report: Partial<Report> = {};

  for (let index = 0; index < reportSections.length; index += 1) {
    const section = reportSections[index];
    const next = reportSections[index + 1];
    const xmlMatch = raw.match(new RegExp(`<\\s*${section}\\s*>([\\s\\S]*?)<\\s*\\/\\s*${section}\\s*>`));
    if (xmlMatch?.[1]) {
      report[section] = cleanModelText(xmlMatch[1]);
      continue;
    }

    const startTokens = [`【${section}】`, `<${section}>`, `${section}：`, `${section}:`];
    const start = findFirstIndex(raw, startTokens);
    if (start < 0) continue;
    const matchedToken = startTokens.find((token) => raw.indexOf(token) === start) ?? `【${section}】`;
    const contentStart = start + matchedToken.length;
    const nextTokens = next ? [`【${next}】`, `<${next}>`, `${next}：`, `${next}:`] : [];
    const end = next ? findFirstIndex(raw, nextTokens, contentStart) : raw.length;
    const value = cleanModelText(raw.slice(contentStart, end < 0 ? raw.length : end));
    if (value) report[section] = value;
  }

  const plainChunks = splitPlainOutput(raw);
  return Object.fromEntries(
    reportSections.map((section, index) => [section, report[section] || plainChunks[index] || "该部分在模型输出中未充分展开，请重新生成。"]),
  ) as Report;
}

function findFirstIndex(text: string, tokens: string[], fromIndex = 0) {
  let best = -1;
  for (const token of tokens) {
    const index = text.indexOf(token, fromIndex);
    if (index >= 0 && (best < 0 || index < best)) best = index;
  }
  return best;
}

function splitPlainOutput(raw: string) {
  return raw
    .replace(/<[^>]+>/g, "\n")
    .split(/\n{2,}|(?=【[^】]+】)/)
    .map(cleanModelText)
    .filter((chunk) => chunk.length > 40 && !chunk.includes("模型未按指定格式返回"))
    .slice(0, reportSections.length);
}

function cleanModelText(text: string) {
  return text
    .replace(/^\s*[*#\-：:\s]+/g, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .trim();
}

function cjkRatio(text: string) {
  if (!text.trim()) return 0;
  const cjk = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  return cjk / text.length;
}

async function ensureChineseReport(raw: string, models: string[]) {
  if (cjkRatio(raw) > 0.12) return { raw, modelSuffix: "" };

  const prompt = `
请把下面的论文分析完整改写为中文，保留所有【章节标签】，不要新增解释，不要输出 Markdown。
如果有术语如 Transformer、BLEU、self-attention，可以保留英文术语并给出中文说明。

原文：
${raw.slice(0, 6000)}
`;

  const errors: string[] = [];
  for (const model of models) {
    try {
      const translated = await callOllama(model, prompt);
      if (cjkRatio(translated) > 0.12) return { raw: translated, modelSuffix: ` + ${model}中文改写` };
      errors.push(`${model} translation still not Chinese enough`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  console.warn(`Chinese rewrite failed: ${errors.join(" | ")}`);
  return { raw, modelSuffix: "" };
}

async function generateFullReport(title: string, field: string, paperText: string, evidence: EvidenceItem[], models: string[]) {
  const dossier = buildPaperDossier(paperText, evidence);
  const prompt = `
你是资深论文审稿人和科研导师。请先在心里阅读材料并归纳证据，再输出中文深度分析。

硬性要求：
1. 只能基于材料里的信息推断，不要编造论文没有给出的数值。
2. 不要写“模型未按指定格式返回”“原始输出片段”等系统话术。
3. 每节 220 到 420 字，必须有具体对象、方法、数据或适用边界。
4. “实验结果”必须引用自动提取的数据证据里的数据集/指标/数值/对比。
5. “优劣势”必须分成“优势：...”和“局限：...”。
6. “个性化建议”要面向正在做人工智能/科研阅读/复现选题的用户。
7. 严格用下列 XML 标签包裹每节内容，不要 Markdown，不要 JSON：
${reportSections.map((section) => `<${section}>...</${section}>`).join("\n")}

论文标题：${title}
领域分区：${field}

论文材料 dossier：
${dossier}
`;

  const errors: string[] = [];
  for (const model of models) {
    try {
      const raw = await callOllama(model, prompt);
      if (raw.trim().length > 80) {
        const chinese = await ensureChineseReport(raw, models);
        return { report: parseSectionedReport(chinese.raw), model: `${model}${chinese.modelSuffix}`, raw: chinese.raw };
      }
      errors.push(`${model} returned too little text`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`All Ollama models failed. ${errors.join(" | ")}`);
}

async function generateSection(section: string, title: string, field: string, paperText: string, models: string[]) {
  const prompt = `
你是严谨的中文科研论文分析助手。请只输出「${section}」这一节正文，不要标题，不要 Markdown。

要求：
1. 必须基于论文文本中真实出现的信息。
2. 如果文本没有充分证据，请明确写“文本中未充分提供”，不要编造。
3. 语言自然、具体，控制在 80 到 160 字。
4. 即使论文原文是英文，也必须全部使用中文输出。
5. 论文标题：${title}
6. 领域分区：${field}

论文文本节选：
${truncateForPrompt(paperText, 9000)}
`;

  const errors: string[] = [];
  for (const model of models) {
    try {
      const text = (await callOllama(model, prompt)).trim();
      if (text.length > 20) return { text, model };
      errors.push(`${model} returned too little text`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    text: `模型生成「${section}」失败。错误：${errors.join(" | ")}`,
    model: models[0] ?? "unknown",
  };
}

async function analyzeWithOllama(title: string, field: string, paperText: string): Promise<{ report: Report; model: string; raw: string }> {
  const models = await getCandidateModels();
  const evidence = extractEvidence(paperText);
  try {
    return await generateFullReport(title, field, paperText, evidence, models);
  } catch {
    const entries: Array<[string, string]> = [];
    const usedModels = new Set<string>();

    for (const section of reportSections.slice(0, 4)) {
      const result = await generateSection(section, title, field, paperText, models);
      entries.push([section, result.text]);
      usedModels.add(result.model);
    }
    for (const section of reportSections.slice(4)) {
      entries.push([section, "完整报告生成失败，已生成前四节真实分析。请稍后重试或更换较短 PDF。"]);
    }

    return {
      report: Object.fromEntries(entries) as Report,
      model: [...usedModels].join(", "),
      raw: JSON.stringify(Object.fromEntries(entries), null, 2),
    };
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const field = String(formData.get("field") ?? "其他");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing PDF file." }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
    }

    const title = cleanTitle(file.name);
    const text = await extractPdfText(file);
    if (!text || text.length < 200) {
      return NextResponse.json({ error: "PDF text extraction produced too little text. Scanned PDFs need OCR support." }, { status: 422 });
    }

    const evidence = extractEvidence(text);
    const analysis = await analyzeWithOllama(title, field, text);
    return NextResponse.json({
      title,
      field,
      extractedChars: text.length,
      model: analysis.model,
      evidence,
      report: analysis.report,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown analysis error." },
      { status: 500 },
    );
  }
}
