"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";

const navItems = ["论文库", "领域分区", "分析任务", "视频生成", "管理员后台"];
const pipeline = ["PDF upload", "Asset extraction", "Ollama analysis", "Report export", "Explainer video"];
const fields = ["人工智能", "机器学习", "自然语言处理", "计算机视觉", "材料科学", "其他"];
const reportSections = ["背景与问题", "创新点", "核心方法", "实验结果", "优劣势", "应用场景", "个性化建议", "复现难度"];

type Toast = { title: string; detail: string };
type Report = Record<string, string>;
type EvidenceItem = { label: string; text: string };

function cleanTitle(fileName: string) {
  return fileName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || "Untitled paper";
}

function reportMarkdown(title: string, field: string, report: Report, evidence: EvidenceItem[]) {
  const evidenceBlock = evidence.length
    ? ["## 自动提取的数据证据", "", ...evidence.map((item, index) => `${index + 1}. **${item.label}**: ${item.text}`), ""]
    : [];
  return [`# ${title}`, "", `领域分区：${field}`, "", ...evidenceBlock, ...reportSections.flatMap((section) => [`## ${section}`, "", report[section], ""])].join("\n");
}

function downloadFile(name: string, type: string, content: string | Blob) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeNav, setActiveNav] = useState(navItems[0]);
  const [selectedField, setSelectedField] = useState(fields[0]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [paperTitle, setPaperTitle] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [selectedSection, setSelectedSection] = useState(reportSections[0]);
  const [dragging, setDragging] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [taskStatus, setTaskStatus] = useState("等待上传");
  const [toast, setToast] = useState<Toast | null>(null);
  const [videoLanguage, setVideoLanguage] = useState<"zh" | "en">("zh");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisMeta, setAnalysisMeta] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);

  const currentView = useMemo(() => {
    if (activeNav === "领域分区") return `当前分区：${selectedField}`;
    if (activeNav === "分析任务") return `任务状态：${taskStatus}`;
    if (activeNav === "视频生成") return `讲解语言：${videoLanguage === "zh" ? "中文" : "English"}`;
    if (activeNav === "管理员后台") return "RBAC 管理后台";
    return "上传、分析、导出";
  }, [activeNav, selectedField, taskStatus, videoLanguage]);

  function showToast(title: string, detail: string) {
    setToast({ title, detail });
    window.setTimeout(() => setToast(null), 3200);
  }

  async function acceptFile(file?: File) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showToast("文件格式不支持", "MVP 第一版只接收 PDF 文件。");
      return;
    }

    const title = cleanTitle(file.name);
    setSelectedFile(file);
    setPaperTitle(title);
    setReport(null);
    setVideoUrl(null);
    setVideoBlob(null);
    setAnalysisMeta("");
    setAnalysisError("");
    setEvidence([]);
    setIsAnalyzing(true);
    setTaskStatus("正在解析 PDF 并调用 Ollama");
    setActiveNav("分析任务");
    showToast("开始真实分析", "服务端正在抽取 PDF 文本并调用本地 Ollama 模型。");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("field", selectedField);

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "分析失败");

      setPaperTitle(data.title ?? title);
      setReport(data.report);
      setEvidence(data.evidence ?? []);
      setAnalysisMeta(`模型 ${data.model}，抽取 ${data.extractedChars} 字符`);
      setTaskStatus("真实报告已生成：可查看与导出");
      showToast("真实分析报告已生成", `已使用 ${data.model} 完成论文结构化分析。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      setReport(null);
      setAnalysisMeta("真实分析失败，未生成模板报告");
      setAnalysisError(message);
      setTaskStatus("真实分析失败：请查看错误信息");
      showToast("真实分析失败", message);
    } finally {
      setIsAnalyzing(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0]);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  }

  function exportMarkdown() {
    if (!report) return showToast("还没有报告", "请先上传 PDF 生成分析报告。");
    downloadFile(`${paperTitle || "paper-report"}.md`, "text/markdown;charset=utf-8", reportMarkdown(paperTitle, selectedField, report, evidence));
    showToast("Markdown 已导出", "浏览器已开始下载 .md 文件。");
  }

  function exportHtml() {
    if (!report) return showToast("还没有报告", "请先上传 PDF 生成分析报告。");
    const evidenceHtml = evidence.length
      ? `<h2>自动提取的数据证据</h2><ol>${evidence.map((item) => `<li><strong>${item.label}</strong>: ${item.text}</li>`).join("")}</ol>`
      : "";
    const body = reportSections.map((section) => `<h2>${section}</h2><p>${report[section]}</p>`).join("");
    downloadFile(
      `${paperTitle || "paper-report"}.html`,
      "text/html;charset=utf-8",
      `<!doctype html><html lang="zh"><meta charset="utf-8"><title>${paperTitle}</title><body><h1>${paperTitle}</h1><p>领域分区：${selectedField}</p>${evidenceHtml}${body}</body></html>`,
    );
    showToast("HTML 已导出", "浏览器已开始下载 .html 文件。");
  }

  async function generateVideo() {
    if (!report) return showToast("还没有报告", "请先上传 PDF 生成分析报告。");
    setIsGeneratingVideo(true);
    setTaskStatus("正在生成：浏览器端 WebM 讲解视频");
    setActiveNav("视频生成");

    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const stream = canvas.captureStream(24);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.start();

    const slides = reportSections;
    let frame = 0;
    const timer = window.setInterval(() => {
      const slide = slides[Math.min(Math.floor(frame / 168), slides.length - 1)];
      ctx.fillStyle = "#f6f7f9";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#1f6feb";
      ctx.fillRect(0, 0, canvas.width, 96);
      ctx.fillStyle = "white";
      ctx.font = "bold 38px Arial";
      ctx.fillText(videoLanguage === "zh" ? "论文讲解视频" : "Paper Explainer", 56, 62);
      ctx.fillStyle = "#1d242d";
      ctx.font = "bold 34px Arial";
      ctx.fillText(paperTitle.slice(0, 52), 56, 170);
      ctx.font = "bold 44px Arial";
      ctx.fillText(slide, 56, 275);
      ctx.font = "28px Arial";
      wrapText(ctx, report[slide], 56, 340, 1120, 42);
      frame += 1;
    }, 1000 / 24);

    await new Promise((resolve) => window.setTimeout(resolve, slides.length * 7000));
    window.clearInterval(timer);
    recorder.stop();
    await new Promise((resolve) => {
      recorder.onstop = resolve;
    });
    const blob = new Blob(chunks, { type: "video/webm" });
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoBlob(blob);
    setVideoUrl(URL.createObjectURL(blob));
    setIsGeneratingVideo(false);
    setTaskStatus("视频已生成：可预览与下载");
    showToast("视频已生成", "当前生成 WebM 预览；服务端 ffmpeg 接入后会输出 MP4。");
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-[#1d242d]">
      <section className="border-b border-[#d9dde3] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <button className="text-left" onClick={() => setActiveNav("论文库")}>
            <p className="text-sm font-medium text-[#536170]">Paper Companion</p>
            <h1 className="text-2xl font-semibold tracking-normal">论文分析与讲解工作台</h1>
          </button>
          <div className="flex items-center gap-3">
            <button className="h-9 rounded-md border border-[#c8ced6] px-4 text-sm font-medium" onClick={() => { setLoggedIn((v) => !v); showToast(loggedIn ? "已退出演示账号" : "已进入演示账号", "真实登录会在 Supabase Auth 接入后启用。"); }}>
              {loggedIn ? "退出" : "登录"}
            </button>
            <button className="h-9 rounded-md bg-[#1f6feb] px-4 text-sm font-medium text-white" onClick={() => fileInputRef.current?.click()}>
              上传 PDF
            </button>
          </div>
        </div>
      </section>

      <input accept="application/pdf,.pdf" className="hidden" onChange={onFileChange} ref={fileInputRef} type="file" />

      <div className="mx-auto grid max-w-7xl grid-cols-[240px_1fr] gap-6 px-6 py-6">
        <aside className="space-y-2 border-r border-[#d9dde3] pr-4">
          {navItems.map((item) => (
            <button className={`w-full rounded-md px-3 py-2 text-left text-sm ${activeNav === item ? "bg-[#e8f1ff] font-medium text-[#174ea6]" : "text-[#536170]"}`} key={item} onClick={() => setActiveNav(item)}>
              {item}
            </button>
          ))}
          <div className="pt-6">
            <p className="mb-2 text-xs font-semibold uppercase text-[#697586]">领域分区</p>
            <select className="h-9 w-full rounded-md border border-[#c8ced6] bg-white px-2 text-sm" onChange={(event) => setSelectedField(event.target.value)} value={selectedField}>
              {fields.map((field) => <option key={field}>{field}</option>)}
            </select>
          </div>
        </aside>

        <section className="space-y-6">
          <div className="rounded-md border border-[#d9dde3] bg-white px-4 py-3 text-sm">
            <span className="font-medium">{activeNav}</span><span className="mx-2 text-[#8792a0]">/</span><span className="text-[#536170]">{currentView}</span>
          </div>

          <div className="grid grid-cols-[1.25fr_0.75fr] gap-6">
            <div className="rounded-lg border border-[#d9dde3] bg-white p-6">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">上传论文并生成结构化分析</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#536170]">当前版本已支持前端演示报告、MD/HTML 真实导出、WebM 视频预览生成。</p>
                </div>
                <span className="rounded-md bg-[#eef8f1] px-3 py-1 text-sm font-medium text-[#137333]">MVP</span>
              </div>
              <div className={`flex min-h-52 items-center justify-center rounded-lg border border-dashed ${dragging ? "border-[#1f6feb] bg-[#eef5ff]" : "border-[#aeb7c2] bg-[#fafbfc]"}`} onDragLeave={() => setDragging(false)} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDrop={onDrop}>
                <div className="text-center">
                  <p className="text-base font-medium">{selectedFile ? selectedFile.name : "拖拽 PDF 到这里"}</p>
                  <p className="mt-2 text-sm text-[#536170]">{selectedFile ? `大小 ${(selectedFile.size / 1024 / 1024).toFixed(2)} MB，分区 ${selectedField}` : "或点击上传，随后服务端解析 PDF 并调用 Ollama"}</p>
                  <button className="mt-5 h-10 rounded-md bg-[#1f6feb] px-5 text-sm font-medium text-white disabled:bg-[#93b7f4]" disabled={isAnalyzing} onClick={() => fileInputRef.current?.click()}>{isAnalyzing ? "分析中" : "选择文件"}</button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-[#d9dde3] bg-white p-6">
              <h2 className="text-base font-semibold">任务流水线</h2>
              <div className="mt-5 space-y-3">
                {pipeline.map((step, index) => (
                  <div className={`flex items-center gap-3 rounded-md p-1 ${report && index < 4 ? "bg-[#f3f6fa]" : ""}`} key={step}>
                    <span className="flex size-7 items-center justify-center rounded-full bg-[#edf2f7] text-sm font-medium text-[#536170]">{index + 1}</span>
                    <span className="text-sm">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="rounded-lg border border-[#d9dde3] bg-white p-5"><p className="text-sm text-[#536170]">任务状态</p><p className="mt-2 text-xl font-semibold">{taskStatus}</p></div>
            <div className="rounded-lg border border-[#d9dde3] bg-white p-5"><p className="text-sm text-[#536170]">模型服务</p><p className="mt-2 text-2xl font-semibold">Ollama local</p>{analysisMeta ? <p className="mt-2 text-sm text-[#536170]">{analysisMeta}</p> : null}</div>
            <div className="rounded-lg border border-[#d9dde3] bg-white p-5">
              <p className="text-sm text-[#536170]">导出格式</p>
              <div className="mt-3 flex gap-2">
                <button className="rounded-md border border-[#c8ced6] px-3 py-2 text-sm" onClick={exportMarkdown}>MD</button>
                <button className="rounded-md border border-[#c8ced6] px-3 py-2 text-sm" onClick={exportHtml}>HTML</button>
              </div>
            </div>
          </div>

          {report ? (
            <div className="grid grid-cols-[280px_1fr] gap-6 rounded-lg border border-[#d9dde3] bg-white p-6">
              <div>
                <h2 className="text-base font-semibold">分析结果</h2>
                <div className="mt-4 space-y-2">
                  {reportSections.map((section) => (
                    <button className={`w-full rounded-md border px-3 py-2 text-left text-sm ${selectedSection === section ? "border-[#1f6feb] bg-[#f8fbff]" : "border-[#e1e5ea]"}`} key={section} onClick={() => setSelectedSection(section)}>{section}</button>
                  ))}
                </div>
              </div>
              <article>
                <p className="text-sm text-[#536170]">{paperTitle}</p>
                <h3 className="mt-2 text-xl font-semibold">{selectedSection}</h3>
                <p className="mt-4 leading-8 text-[#344054]">{report[selectedSection]}</p>
              </article>
            </div>
          ) : null}

          {evidence.length ? (
            <div className="rounded-lg border border-[#d9dde3] bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">自动提取的数据证据</h2>
                <span className="text-sm text-[#536170]">{evidence.length} 条指标/实验相关句</span>
              </div>
              <div className="space-y-2">
                {evidence.slice(0, 10).map((item, index) => (
                  <div className="rounded-md border border-[#e1e5ea] px-3 py-2 text-sm" key={`${item.label}-${index}`}>
                    <span className="font-medium text-[#174ea6]">{item.label}</span>
                    <span className="mx-2 text-[#8792a0]">·</span>
                    <span className="text-[#344054]">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {analysisError ? (
            <div className="rounded-lg border border-[#f1b8b8] bg-[#fff7f7] p-6">
              <h2 className="text-base font-semibold text-[#b42318]">真实分析失败</h2>
              <p className="mt-3 break-words text-sm leading-6 text-[#7a271a]">{analysisError}</p>
              <p className="mt-3 text-sm text-[#536170]">这条信息来自后端 `/api/analyze`，没有使用模板伪装结果。</p>
            </div>
          ) : null}

          <div className="rounded-lg border border-[#d9dde3] bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">讲解视频</h2>
                <p className="mt-1 text-sm text-[#536170]">当前浏览器端生成 WebM 预览；服务端 ffmpeg 接入后输出 MP4。</p>
              </div>
              <div className="flex items-center gap-2">
                <button className={`rounded-md px-3 py-2 text-sm ${videoLanguage === "zh" ? "bg-[#1f6feb] text-white" : "border border-[#c8ced6]"}`} onClick={() => setVideoLanguage("zh")}>中文</button>
                <button className={`rounded-md px-3 py-2 text-sm ${videoLanguage === "en" ? "bg-[#1f6feb] text-white" : "border border-[#c8ced6]"}`} onClick={() => setVideoLanguage("en")}>English</button>
                <button className="rounded-md bg-[#1f6feb] px-4 py-2 text-sm font-medium text-white disabled:bg-[#93b7f4]" disabled={isGeneratingVideo} onClick={generateVideo}>{isGeneratingVideo ? "生成中" : "生成视频"}</button>
              </div>
            </div>
            {videoUrl ? (
              <div className="mt-5">
                <video className="w-full rounded-md border border-[#d9dde3]" controls src={videoUrl} />
                <button className="mt-3 rounded-md border border-[#c8ced6] px-4 py-2 text-sm" onClick={() => videoBlob && downloadFile(`${paperTitle || "paper-explainer"}.webm`, "video/webm", videoBlob)}>下载 WebM</button>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {toast ? <div className="fixed bottom-6 right-6 w-80 rounded-lg border border-[#c8ced6] bg-white p-4 shadow-lg"><p className="font-medium">{toast.title}</p><p className="mt-1 text-sm text-[#536170]">{toast.detail}</p></div> : null}
    </main>
  );
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split("");
  let line = "";
  for (const word of words) {
    const testLine = line + word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}
