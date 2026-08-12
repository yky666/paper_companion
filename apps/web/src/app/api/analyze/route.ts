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
type PdfAsset = {
  type: "page_screenshot";
  label: string;
  page: number;
  dataUrl: string;
};

export const runtime = "nodejs";
export const maxDuration = 180;

function cleanTitle(fileName: string) {
  return fileName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || "Untitled paper";
}

function truncateForPrompt(text: string, limit = 14000) {
  return text.replace(/\s+/g, " ").slice(0, limit);
}

function uniqueLines(text: string) {
  const seen = new Set<string>();
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 24 && line.length <= 420)
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function extractEvidence(text: string): EvidenceItem[] {
  const keywords =
    /(BLEU|ROUGE|accuracy|Acc\.?|mAP|IoU|F1|AUC|AP50|AP75|WER|CER|CIDEr|METEOR|Recall|Precision|PSNR|SSIM|benchmark|dataset|WMT|COCO|ImageNet|ablation|dataset|baseline|training|Table|Figure|消融|数据集|指标|准确率|精度|召回|实验|基准|表\s?\d|图\s?\d)/i;
  const numberPattern = /(\d+(?:\.\d+)?\s?%?|\d+\.\d+|over\s+\d+|more than\s+\d+|超过\s*\d+)/i;
  const evidence: EvidenceItem[] = [];

  for (const line of uniqueLines(text)) {
    if (!keywords.test(line) || !numberPattern.test(line)) continue;
    evidence.push({
      label: line.match(keywords)?.[0] ?? "metric",
      text: line,
    });
    if (evidence.length >= 36) break;
  }

  return evidence;
}

function extractFormulaEvidence(text: string): EvidenceItem[] {
  const formulaPattern = /([=∑∏∫√≈≤≥→←↔⊙⊗αβγδλμσθ]|\\frac|\\sum|\\arg|softmax|loss|objective|equation|Eq\.|公式|损失函数|目标函数|符号)/i;
  const result: EvidenceItem[] = [];
  for (const line of uniqueLines(text)) {
    if (!formulaPattern.test(line)) continue;
    result.push({ label: line.match(formulaPattern)?.[0] ?? "formula", text: line });
    if (result.length >= 18) break;
  }
  return result;
}

function extractSettingEvidence(text: string): EvidenceItem[] {
  const settingPattern =
    /(dataset|benchmark|baseline|training|epoch|batch|optimizer|learning rate|lr|GPU|NVIDIA|A100|V100|RTX|implementation|hyperparameter|ablation|数据集|基准|训练|轮次|批量|优化器|学习率|实验设置|超参数|消融)/i;
  const result: EvidenceItem[] = [];
  for (const line of uniqueLines(text)) {
    if (!settingPattern.test(line)) continue;
    result.push({ label: line.match(settingPattern)?.[0] ?? "setting", text: line });
    if (result.length >= 24) break;
  }
  return result;
}

function sliceAround(text: string, patterns: RegExp[], limit = 3200) {
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
  const start = Math.max(0, best - 800);
  return normalized.slice(start, start + limit).replace(/\s+/g, " ").trim();
}

function buildPaperDossier(text: string, evidence: EvidenceItem[], formulas: EvidenceItem[], settings: EvidenceItem[]) {
  const normalized = text.replace(/\s+/g, " ");
  const abstract = sliceAround(text, [/abstract/i, /摘要/], 3000) || normalized.slice(0, 3000);
  const introduction = sliceAround(text, [/introduction/i, /引言/], 3000);
  const method = sliceAround(text, [/method/i, /approach/i, /model architecture/i, /framework/i, /方法/], 4600);
  const experiment = sliceAround(text, [/experiment/i, /evaluation/i, /results/i, /implementation/i, /实验/], 5200);
  const conclusion = sliceAround(text, [/conclusion/i, /discussion/i, /结论/], 2600);
  const tail = normalized.slice(Math.max(0, normalized.length - 2600));
  const evidenceText = evidence.length
    ? evidence.map((item, index) => `${index + 1}. [${item.label}] ${item.text}`).join("\n")
    : "未从文本中自动提取到明确指标句。";
  const formulaText = formulas.length
    ? formulas.map((item, index) => `${index + 1}. [${item.label}] ${item.text}`).join("\n")
    : "未定位到明显公式/符号句，需从截图或原文人工复核。";
  const settingText = settings.length
    ? settings.map((item, index) => `${index + 1}. [${item.label}] ${item.text}`).join("\n")
    : "未定位到明显实验设置句。";

  return `
【摘要附近】${abstract}

【引言附近】${introduction || "未定位到引言片段。"}

【方法附近】${method || "未定位到方法片段。"}

【实验/结果附近】${experiment || "未定位到实验片段。"}

【结论/末尾】${conclusion || tail}

【自动提取的数据证据】${evidenceText}

【公式与符号线索】${formulaText}

【实验设置线索】${settingText}
`.slice(0, 22000);
}

async function pageCount(pdfPath: string) {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [pdfPath], { timeout: 15_000, maxBuffer: 1024 * 1024 });
    const match = stdout.match(/^Pages:\s+(\d+)/m);
    return match ? Number(match[1]) : 1;
  } catch {
    return 1;
  }
}

async function renderKeyPages(pdfPath: string, workDir: string): Promise<PdfAsset[]> {
  const pages = Math.max(1, await pageCount(pdfPath));
  const candidates = [
    { page: 1, label: "首页/标题页" },
    { page: Math.max(1, Math.round(pages * 0.35)), label: "方法候选页" },
    { page: Math.max(1, Math.round(pages * 0.7)), label: "实验候选页" },
    { page: pages, label: "结论/附录候选页" },
  ];
  const unique = candidates.filter((item, index, arr) => arr.findIndex((other) => other.page === item.page) === index);
  const assets: PdfAsset[] = [];

  for (const item of unique.slice(0, 4)) {
    const prefix = path.join(workDir, `page-${item.page}`);
    try {
      await execFileAsync("pdftoppm", ["-f", String(item.page), "-singlefile", "-png", "-r", "100", pdfPath, prefix], {
        timeout: 30_000,
        maxBuffer: 1024 * 1024 * 4,
      });
      const buffer = await readFile(`${prefix}.png`);
      assets.push({
        type: "page_screenshot",
        label: item.label,
        page: item.page,
        dataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
      });
    } catch (error) {
      console.warn(`Failed to render PDF page ${item.page}:`, error);
    }
  }

  return assets;
}

async function processPdf(file: File) {
  const workDir = await mkdtemp(path.join(tmpdir(), "paper-companion-"));
  const pdfPath = path.join(workDir, `${randomUUID()}.pdf`);
  const textPath = path.join(workDir, "paper.txt");

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(pdfPath, bytes);
    await execFileAsync("pdftotext", ["-layout", "-enc", "UTF-8", pdfPath, textPath], {
      timeout: 60_000,
      maxBuffer: 1024 * 1024 * 32,
    });
    const [text, assets] = await Promise.all([readFile(textPath, "utf8"), renderKeyPages(pdfPath, workDir)]);
    return { text: text.trim(), assets };
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
    return names.find((name: string) => name.includes("gemma3:12b")) ?? names.find((name: string) => name.includes("gemma3:4b")) ?? names[0] ?? "gemma3:4b";
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
    const preferred = [configured, "gemma3:12b", "gemma3:4b", "gemma3:1b"];
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
        temperature: 0.12,
        num_ctx: 8192,
        num_predict: 5200,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama ${model} failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return String(data.response ?? "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseSectionedReport(raw: string): Report {
  const report: Partial<Report> = {};

  for (let index = 0; index < reportSections.length; index += 1) {
    const section = reportSections[index];
    const next = reportSections[index + 1];
    const xmlMatch = raw.match(new RegExp(`<\\s*${escapeRegExp(section)}\\s*>([\\s\\S]*?)<\\s*\\/\\s*${escapeRegExp(section)}\\s*>`));
    if (xmlMatch?.[1]) {
      report[section] = cleanModelText(xmlMatch[1]);
      continue;
    }

    const startTokens = [`【${section}】`, `${section}：`, `${section}:`];
    const start = findFirstIndex(raw, startTokens);
    if (start < 0) continue;
    const matchedToken = startTokens.find((token) => raw.indexOf(token) === start) ?? `【${section}】`;
    const contentStart = start + matchedToken.length;
    const nextTokens = next ? [`【${next}】`, `${next}：`, `${next}:`] : [];
    const end = next ? findFirstIndex(raw, nextTokens, contentStart) : raw.length;
    const value = cleanModelText(raw.slice(contentStart, end < 0 ? raw.length : end));
    if (value) report[section] = value;
  }

  const plainChunks = splitPlainOutput(raw);
  return Object.fromEntries(
    reportSections.map((section, index) => [
      section,
      report[section] || plainChunks[index] || "该部分在模型输出中未充分展开，请重新生成或检查 PDF 文本质量。",
    ]),
  ) as Report;
}

function parseJsonReport(raw: string): Report | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const entries = reportSections.map((section) => {
      const value = parsed[section];
      if (typeof value === "string") return [section, cleanModelText(value)];
      if (Array.isArray(value)) {
        return [
          section,
          value
            .map((item, index) => `${index + 1}. ${cleanModelText(String(item))}`)
            .filter((item) => item.length > 6)
            .join("\n"),
        ];
      }
      if (value && typeof value === "object") {
        return [
          section,
          Object.entries(value as Record<string, unknown>)
            .map(([key, item]) => `${key}：${Array.isArray(item) ? item.join("；") : String(item)}`)
            .join("\n"),
        ];
      }
      return [section, ""];
    });
    const filled = entries.filter(([, value]) => String(value).length > 20).length;
    if (filled >= Math.ceil(reportSections.length * 0.75)) {
      return Object.fromEntries(
        entries.map(([section, value]) => [
          section,
          String(value).length > 20 ? value : "该部分在模型输出中未充分展开，请结合原文和证据线索复核。",
        ]),
      ) as Report;
    }
  } catch {
    return null;
  }

  return null;
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
    .filter((chunk) => chunk.length > 60 && !chunk.includes("模型未按指定格式返回"))
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
请把下面的论文分析完整改写为中文，保留所有 XML 标签，不要新增解释，不要输出 Markdown。
如果有 Transformer、BLEU、self-attention 等术语，可以保留英文术语并给出中文说明。

原文：
${raw.slice(0, 7000)}
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

async function generateFullReport(
  title: string,
  field: string,
  profile: string,
  paperText: string,
  evidence: EvidenceItem[],
  formulas: EvidenceItem[],
  settings: EvidenceItem[],
  models: string[],
) {
  const dossier = buildPaperDossier(paperText, evidence, formulas, settings);
  const prompt = `
你是资深论文审稿人、科研导师和复现实验工程师。请先在心里通读材料，建立论文的“问题-方法-证据-结论”链条，再输出中文深度分析。

用户画像：
${profile || "用户未填写详细画像。默认面向正在做人工智能科研阅读、选题和复现的用户。"}

硬性要求：
1. 只能基于材料里的信息推断，不要编造论文没有给出的数值。
2. 每节 360 到 800 字，必须有具体对象、技术细节、证据或适用边界。
3. “创新点”“核心方法”“实验结果”“优劣势”“复现难度”必须分点表达，可用“一是、二是、三是”或“1. 2. 3.”。
4. “核心方法”必须说明模块流程、输入输出、关键训练目标、公式/符号含义；若公式线索不足，请明确写“文本抽取中未完整保留公式，需要结合截图复核”。
5. “实验结果”必须引用自动提取的数据证据里的数据集、指标、数值或对比；如果证据不足，要说明缺口。
6. “优劣势”必须分成“优势”和“局限”。
7. “复现难度”必须包含数据、代码/模型、硬件、训练细节、评估协议五个角度。
8. 只输出一个合法 JSON 对象，不要 Markdown，不要 XML，不要代码块。JSON 必须且只能包含这些中文 key：
${reportSections.map((section) => `"${section}"`).join(", ")}

论文标题：${title}
领域分区：${field}

论文材料 dossier：
${dossier}
`;

  const errors: string[] = [];
  for (const model of models) {
    try {
      const raw = await callOllama(model, prompt, true);
      if (raw.trim().length > 120) {
        const parsedJson = parseJsonReport(raw);
        if (parsedJson) return { report: parsedJson, model, raw };
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

async function analyzeWithOllama(
  title: string,
  field: string,
  profile: string,
  paperText: string,
  evidence: EvidenceItem[],
  formulas: EvidenceItem[],
  settings: EvidenceItem[],
): Promise<{ report: Report; model: string; raw: string }> {
  const models = await getCandidateModels();
  return generateFullReport(title, field, profile, paperText, evidence, formulas, settings, models);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const field = String(formData.get("field") ?? "其他");
    const profile = String(formData.get("profile") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing PDF file." }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
    }

    const title = cleanTitle(file.name);
    const { text, assets } = await processPdf(file);
    if (!text || text.length < 200) {
      return NextResponse.json({ error: "PDF text extraction produced too little text. Scanned PDFs need OCR support." }, { status: 422 });
    }

    const evidence = extractEvidence(text);
    const formulas = extractFormulaEvidence(text);
    const settings = extractSettingEvidence(text);
    const analysis = await analyzeWithOllama(title, field, profile, text, evidence, formulas, settings);
    return NextResponse.json({
      title,
      field,
      extractedChars: text.length,
      model: analysis.model,
      evidence,
      formulas,
      settings,
      assets,
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
