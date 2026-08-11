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

export const runtime = "nodejs";
export const maxDuration = 120;

function cleanTitle(fileName: string) {
  return fileName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || "Untitled paper";
}

function truncateForPrompt(text: string) {
  return text.replace(/\s+/g, " ").slice(0, 26000);
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

function parseJsonReport(content: string): Partial<Report> {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};

  try {
    return JSON.parse(jsonMatch[0]) as Partial<Report>;
  } catch {
    return {};
  }
}

function fallbackReport(title: string, field: string, text: string): Report {
  const preview = text.slice(0, 420);
  return {
    背景与问题: `已从《${title}》抽取到 ${text.length} 个字符，领域分区为「${field}」。模型输出未能解析为完整 JSON，以下为保底分析。论文开头内容：${preview}`,
    创新点: "需要进一步从摘要、引言和方法章节定位作者声称的贡献点。",
    核心方法: "需要结合方法章节、算法框图、公式和训练流程进行拆解。",
    实验结果: "需要从实验章节提取数据集、指标、主结果表、消融实验和可视化结果。",
    优劣势: "优势与局限需要结合方法假设、实验覆盖范围、复现条件和应用约束判断。",
    应用场景: `可优先评估其在「${field}」相关研究、课程汇报和复现选题中的价值。`,
    个性化建议: "建议先阅读摘要、引言末尾贡献列表、方法总览图和实验主表，再决定是否深入复现。",
    复现难度: "暂估为中等，需进一步检查代码、数据、模型规模和硬件需求。",
  };
}

async function analyzeWithOllama(title: string, field: string, paperText: string): Promise<{ report: Report; model: string; raw: string }> {
  const model = await getOllamaModel();
  const prompt = `
你是一个严谨的中文科研论文分析助手。请基于给定论文文本，输出严格 JSON，不要 Markdown，不要解释。

JSON 必须包含这些键：
${reportSections.map((section) => `- "${section}"`).join("\n")}

写作要求：
1. 每个键的值使用中文，120 到 220 字。
2. 必须尽量引用论文中真实出现的方法、任务、数据集、指标、实验现象或问题表述。
3. 如果论文文本缺失某部分，请明确写“文本中未充分提供”，不要编造。
4. “个性化建议”需结合领域分区：${field}。

论文标题：${title}
领域分区：${field}
论文文本：
${truncateForPrompt(paperText)}
`;

  const response = await fetch(`${process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434"}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: 0.2,
        num_ctx: 8192,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const raw = String(data.response ?? "");
  const parsed = parseJsonReport(raw);
  const fallback = fallbackReport(title, field, paperText);
  const report = Object.fromEntries(
    reportSections.map((section) => [section, parsed[section]?.trim() || fallback[section]]),
  ) as Report;

  return { report, model, raw };
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

    const analysis = await analyzeWithOllama(title, field, text);
    return NextResponse.json({
      title,
      field,
      extractedChars: text.length,
      model: analysis.model,
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
