import { randomUUID } from "crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";
export const maxDuration = 240;

type PdfAsset = {
  label?: string;
  page?: number;
  dataUrl?: string;
};

const sections = ["背景与问题", "创新点", "核心方法", "实验结果", "优劣势", "应用场景", "个性化建议", "复现难度"];

function safeText(value: unknown, fallback = "") {
  return String(value ?? fallback)
    .replace(/\s+/g, " ")
    .replace(/[<>]/g, "")
    .trim();
}

function escapeDrawText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

async function existingFontFile() {
  const candidates = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/opentype/adobe-source-han-sans/SourceHanSansCN-Regular.otf",
    "/usr/share/fonts/truetype/arphic/uming.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  ];

  for (const font of candidates) {
    try {
      await access(font);
      return font;
    } catch {
      // Try the next known font path.
    }
  }
  return "";
}

function drawText(text: string, x: number, y: number, size: number, color: string, fontFile: string) {
  const font = fontFile ? `fontfile='${fontFile.replace(/'/g, "'\\''")}':` : "";
  return `drawtext=${font}text='${escapeDrawText(text)}':fontcolor=${color}:fontsize=${size}:x=${x}:y=${y}`;
}

function wrapText(text: string, maxChars: number, maxLines: number) {
  const clean = safeText(text);
  const lines: string[] = [];
  let line = "";
  for (const char of clean) {
    const next = line + char;
    if (next.length >= maxChars) {
      lines.push(next);
      line = "";
      if (lines.length >= maxLines) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function scriptFromReport(title: string, report: Record<string, string>, language: string) {
  const intro =
    language === "en"
      ? `This is an explainer video for the paper ${title}.`
      : `下面开始讲解论文《${title}》。`;
  const body = sections
    .map((section) => {
      const content = safeText(report[section]).slice(0, 260);
      return language === "en" ? `${section}. ${content}` : `${section}。${content}`;
    })
    .join(language === "en" ? " " : "。");
  return `${intro}${language === "en" ? " " : ""}${body}`.slice(0, 5200);
}

async function tryEdgeTts(script: string, audioPath: string, language: string) {
  const voice = language === "en" ? "en-US-AriaNeural" : "zh-CN-XiaoxiaoNeural";
  await execFileAsync(
    "python3",
    [
      "-m",
      "edge_tts",
      "--voice",
      voice,
      "--rate",
      "+0%",
      "--text",
      script,
      "--write-media",
      audioPath,
    ],
    { timeout: 120_000, maxBuffer: 1024 * 1024 * 4 },
  );
}

async function fallbackFliteAudio(script: string, audioPath: string, workDir: string) {
  const scriptPath = path.join(workDir, "script.txt");
  await writeFile(scriptPath, script, "utf8");
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `flite=textfile=${scriptPath}:voice=slt`,
      "-ac",
      "2",
      "-ar",
      "44100",
      audioPath,
    ],
    { timeout: 120_000, maxBuffer: 1024 * 1024 * 8 },
  );
}

async function createAudio(script: string, audioPath: string, workDir: string, language: string) {
  try {
    await tryEdgeTts(script, audioPath, language);
    return "edge-tts";
  } catch (error) {
    console.warn("edge-tts failed, falling back to ffmpeg flite:", error);
    await fallbackFliteAudio(script, audioPath, workDir);
    return "ffmpeg-flite";
  }
}

async function audioDuration(audioPath: string) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audioPath],
    { timeout: 20_000, maxBuffer: 1024 * 1024 },
  );
  const duration = Number(stdout.trim());
  return Number.isFinite(duration) && duration > 0 ? duration : 60;
}

async function writeAsset(asset: PdfAsset | undefined, index: number, workDir: string) {
  if (!asset?.dataUrl?.startsWith("data:image/")) return "";
  const base64 = asset.dataUrl.split(",")[1];
  if (!base64) return "";
  const imagePath = path.join(workDir, `asset-${index}.png`);
  await writeFile(imagePath, Buffer.from(base64, "base64"));
  return imagePath;
}

async function createSlide(
  title: string,
  section: string,
  content: string,
  asset: PdfAsset | undefined,
  index: number,
  workDir: string,
) {
  const output = path.join(workDir, `slide-${String(index).padStart(2, "0")}.png`);
  const assetPath = await writeAsset(asset, index, workDir);
  const fontFile = await existingFontFile();
  const lines = wrapText(content, 36, 8);
  const drawTexts = [
    drawText("Paper Companion", 54, 34, 30, "white", fontFile),
    drawText(title.slice(0, 46), 58, 132, 30, "0x1d242d", fontFile),
    drawText(section, 58, 210, 42, "0x174ea6", fontFile),
    ...lines.map((line, lineIndex) => {
      const y = 292 + lineIndex * 48;
      return drawText(line, 58, y, 26, "0x26323f", fontFile);
    }),
    asset ? drawText(`${asset.label ?? "PDF 关键页"} - 第 ${asset.page ?? index + 1} 页`, 58, 664, 20, "0x536170", fontFile) : "",
  ].filter(Boolean);

  const filters = assetPath
    ? [
        "[0:v]scale=1280:720,format=rgba[bg]",
        "[1:v]scale=360:-1:force_original_aspect_ratio=decrease[asset]",
        "[bg][asset]overlay=x=870:y=145:format=auto[base]",
        `[base]drawbox=x=0:y=0:w=1280:h=92:color=0x1f6feb:t=fill,${drawTexts.join(",")}`,
      ].join(";")
    : [`drawbox=x=0:y=0:w=1280:h=92:color=0x1f6feb:t=fill,${drawTexts.join(",")}`].join(";");

  const args = assetPath
    ? ["-y", "-f", "lavfi", "-i", "color=c=#f6f7f9:s=1280x720", "-i", assetPath, "-frames:v", "1", "-filter_complex", filters, output]
    : ["-y", "-f", "lavfi", "-i", "color=c=#f6f7f9:s=1280x720", "-frames:v", "1", "-vf", filters, output];

  await execFileAsync("ffmpeg", args, { timeout: 45_000, maxBuffer: 1024 * 1024 * 8 });
  return output;
}

async function createVideo(slides: string[], audioPath: string, outputPath: string, workDir: string) {
  const duration = await audioDuration(audioPath);
  const slideDuration = Math.max(5, duration / slides.length);
  const listPath = path.join(workDir, "slides.txt");
  const list = slides.map((slide) => `file '${slide}'\nduration ${slideDuration.toFixed(2)}`).join("\n") + `\nfile '${slides[slides.length - 1]}'\n`;
  await writeFile(listPath, list, "utf8");

  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-i",
      audioPath,
      "-shortest",
      "-r",
      "24",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    { timeout: 180_000, maxBuffer: 1024 * 1024 * 12 },
  );
}

export async function POST(request: Request) {
  const workDir = await mkdtemp(path.join(tmpdir(), "paper-companion-video-"));
  try {
    const body = await request.json();
    const title = safeText(body.title, "paper-explainer").slice(0, 120);
    const language = body.language === "en" ? "en" : "zh";
    const report = (body.report ?? {}) as Record<string, string>;
    const assets = Array.isArray(body.assets) ? (body.assets as PdfAsset[]) : [];
    const script = scriptFromReport(title, report, language);
    const audioPath = path.join(workDir, "narration.mp3");
    const outputPath = path.join(workDir, "explainer.mp4");

    const ttsProvider = await createAudio(script, audioPath, workDir, language);
    const slidePaths = await Promise.all(
      sections.map((section, index) => createSlide(title, section, safeText(report[section]), assets[index % Math.max(1, assets.length)], index, workDir)),
    );
    await createVideo(slidePaths, audioPath, outputPath, workDir);

    const video = await readFile(outputPath);
    return new NextResponse(video, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${randomUUID()}-paper-explainer.mp4"`,
        "X-TTS-Provider": ttsProvider,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown video generation error." },
      { status: 500 },
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
