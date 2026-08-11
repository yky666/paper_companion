import { execFile } from "child_process";
import { promisify } from "util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

async function checkPdftotext() {
  try {
    const { stdout } = await execFileAsync("pdftotext", ["-v"], { timeout: 5000 });
    return { ok: true, detail: stdout || "pdftotext available" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "pdftotext unavailable";
    return { ok: message.includes("version"), detail: message };
  }
}

async function checkOllama() {
  try {
    const response = await fetch(`${process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434"}/api/tags`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    return {
      ok: response.ok,
      models: (data.models ?? []).map((model: { name: string }) => model.name),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ollama unavailable",
    };
  }
}

export async function GET() {
  const [ollama, pdftotext] = await Promise.all([checkOllama(), checkPdftotext()]);

  return NextResponse.json({
    ok: ollama.ok && pdftotext.ok,
    web: { ok: true },
    ollama,
    pdftotext,
    time: new Date().toISOString(),
  });
}
