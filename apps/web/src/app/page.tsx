"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

const navItems = ["论文库", "领域分区", "分析任务", "视频生成", "账户管理"];
const pipeline = ["PDF upload", "Asset extraction", "Ollama analysis", "Report export", "Explainer video"];
const fields = ["人工智能", "机器学习", "自然语言处理", "计算机视觉", "材料科学", "其他"];
const reportSections = ["背景与问题", "创新点", "核心方法", "实验结果", "优劣势", "应用场景", "个性化建议", "复现难度"];
const progressStages = [
  { label: "上传 PDF", target: 12 },
  { label: "提取 PDF 文本", target: 28 },
  { label: "渲染关键页截图", target: 42 },
  { label: "抽取数据/公式/设置证据", target: 56 },
  { label: "调用本地 Ollama 深度分析", target: 86 },
  { label: "整理报告与导出资产", target: 100 },
];

type Toast = { title: string; detail: string };
type Report = Record<string, string>;
type EvidenceItem = { label: string; text: string };
type PdfAsset = { type: "page_screenshot"; label: string; page: number; dataUrl: string };
type Account = {
  email: string;
  name: string;
  role: string;
  researchDirection: string;
  goal: string;
  language: "zh" | "en";
};

const defaultAccount: Account = {
  email: "",
  name: "",
  role: "本科/研究生科研阅读",
  researchDirection: "人工智能",
  goal: "快速理解论文、整理创新点、判断复现价值",
  language: "zh",
};

function cleanTitle(fileName: string) {
  return fileName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || "Untitled paper";
}

function reportMarkdown(
  title: string,
  field: string,
  report: Report,
  evidence: EvidenceItem[],
  formulas: EvidenceItem[],
  settings: EvidenceItem[],
  assets: PdfAsset[],
) {
  const evidenceBlock = evidence.length
    ? ["## 自动提取的数据证据", "", ...evidence.map((item, index) => `${index + 1}. **${item.label}**: ${item.text}`), ""]
    : [];
  const formulaBlock = formulas.length
    ? ["## 公式与符号线索", "", ...formulas.map((item, index) => `${index + 1}. **${item.label}**: ${item.text}`), ""]
    : [];
  const settingBlock = settings.length
    ? ["## 实验设置线索", "", ...settings.map((item, index) => `${index + 1}. **${item.label}**: ${item.text}`), ""]
    : [];
  const assetBlock = assets.length
    ? ["## PDF 关键页截图", "", ...assets.map((asset) => `![${asset.label} - 第 ${asset.page} 页](${asset.dataUrl})`), ""]
    : [];
  return [
    `# ${title}`,
    "",
    `领域分区：${field}`,
    "",
    ...assetBlock,
    ...evidenceBlock,
    ...formulaBlock,
    ...settingBlock,
    ...reportSections.flatMap((section) => [`## ${section}`, "", report[section], ""]),
  ].join("\n");
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

function makeProfile(account: Account | null) {
  if (!account) return "";
  return [
    `姓名/昵称：${account.name || "未填写"}`,
    `角色阶段：${account.role}`,
    `研究方向：${account.researchDirection}`,
    `阅读目标：${account.goal}`,
    `输出语言：${account.language === "zh" ? "中文" : "English"}`,
  ].join("\n");
}

function splitPoints(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const marked = normalized
    .replace(/(一是|二是|三是|四是|五是|首先|其次|再次|最后|优势[:：]|局限[:：])/g, "\n$1")
    .split(/\n|(?<=[。；;])\s*(?=(一是|二是|三是|四是|五是|首先|其次|再次|最后))/)
    .map((item) => item.trim())
    .filter((item) => item.length > 20);
  if (marked.length >= 2) return marked;
  return normalized
    .split(/(?<=[。；;])\s*/)
    .map((item) => item.trim())
    .filter((item) => item.length > 28)
    .slice(0, 8);
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeNav, setActiveNav] = useState(navItems[2]);
  const [selectedField, setSelectedField] = useState(fields[0]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [paperTitle, setPaperTitle] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [selectedSection, setSelectedSection] = useState(reportSections[0]);
  const [dragging, setDragging] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [accountDraft, setAccountDraft] = useState<Account>(defaultAccount);
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [taskStatus, setTaskStatus] = useState("等待上传");
  const [toast, setToast] = useState<Toast | null>(null);
  const [videoLanguage, setVideoLanguage] = useState<"zh" | "en">("zh");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoProvider, setVideoProvider] = useState("");
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisMeta, setAnalysisMeta] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [formulas, setFormulas] = useState<EvidenceItem[]>([]);
  const [settings, setSettings] = useState<EvidenceItem[]>([]);
  const [assets, setAssets] = useState<PdfAsset[]>([]);
  const [progress, setProgress] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const saved = window.localStorage.getItem("paper-companion-account");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Account;
        setAccount(parsed);
        setAccountDraft(parsed);
        setSelectedField(parsed.researchDirection || fields[0]);
      } catch {
        window.localStorage.removeItem("paper-companion-account");
      }
    }
  }, []);

  useEffect(() => {
    if (!isAnalyzing) return;
    const timer = window.setInterval(() => {
      setProgress((value) => {
        const next = Math.min(92, value + Math.max(1, Math.round((92 - value) * 0.08)));
        const stage = progressStages.findIndex((item) => next <= item.target);
        setStageIndex(stage < 0 ? progressStages.length - 1 : stage);
        return next;
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [isAnalyzing]);

  const currentView = useMemo(() => {
    if (activeNav === "领域分区") return `当前分区：${selectedField}`;
    if (activeNav === "分析任务") return `任务状态：${taskStatus}`;
    if (activeNav === "视频生成") return `讲解语言：${videoLanguage === "zh" ? "中文" : "English"}`;
    if (activeNav === "账户管理") return account ? `当前账户：${account.name || account.email}` : "未登录";
    return "上传、分析、导出";
  }, [account, activeNav, selectedField, taskStatus, videoLanguage]);

  const selectedPoints = report ? splitPoints(report[selectedSection] ?? "") : [];

  function showToast(title: string, detail: string) {
    setToast({ title, detail });
    window.setTimeout(() => setToast(null), 3600);
  }

  function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { ...accountDraft, email: accountDraft.email.trim(), name: accountDraft.name.trim() };
    if (!next.email) {
      showToast("需要邮箱", "本地账户至少需要填写一个邮箱作为身份标识。");
      return;
    }
    setAccount(next);
    setSelectedField(next.researchDirection || selectedField);
    window.localStorage.setItem("paper-companion-account", JSON.stringify(next));
    setShowAccountPanel(false);
    showToast("账户已保存", "当前是本地账户模式，个人画像会参与下一次论文分析提示词。");
  }

  function logout() {
    window.localStorage.removeItem("paper-companion-account");
    setAccount(null);
    setAccountDraft(defaultAccount);
    showToast("已退出", "本地账户信息已从浏览器移除。");
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
    setVideoProvider("");
    setAnalysisMeta("");
    setAnalysisError("");
    setEvidence([]);
    setFormulas([]);
    setSettings([]);
    setAssets([]);
    setProgress(4);
    setStageIndex(0);
    setIsAnalyzing(true);
    setTaskStatus("正在解析 PDF 并调用 Ollama");
    setActiveNav("分析任务");
    showToast("开始真实分析", "服务端正在抽取 PDF 文本、截图关键页并调用本地 Ollama 模型。");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("field", selectedField);
      formData.append("profile", makeProfile(account));

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "分析失败");

      setPaperTitle(data.title ?? title);
      setReport(data.report);
      setEvidence(data.evidence ?? []);
      setFormulas(data.formulas ?? []);
      setSettings(data.settings ?? []);
      setAssets(data.assets ?? []);
      setAnalysisMeta(`模型 ${data.model}，抽取 ${data.extractedChars} 字符，截图 ${data.assets?.length ?? 0} 页`);
      setTaskStatus("真实报告已生成：可查看与导出");
      setProgress(100);
      setStageIndex(progressStages.length - 1);
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
    downloadFile(`${paperTitle || "paper-report"}.md`, "text/markdown;charset=utf-8", reportMarkdown(paperTitle, selectedField, report, evidence, formulas, settings, assets));
    showToast("Markdown 已导出", "报告包含证据、公式/设置线索和 PDF 关键页图片。");
  }

  function exportHtml() {
    if (!report) return showToast("还没有报告", "请先上传 PDF 生成分析报告。");
    const list = (title: string, items: EvidenceItem[]) =>
      items.length ? `<h2>${title}</h2><ol>${items.map((item) => `<li><strong>${item.label}</strong>: ${item.text}</li>`).join("")}</ol>` : "";
    const assetHtml = assets.length
      ? `<h2>PDF 关键页截图</h2>${assets.map((asset) => `<figure><img alt="${asset.label}" src="${asset.dataUrl}" style="max-width:100%;border:1px solid #ddd"><figcaption>${asset.label} - 第 ${asset.page} 页</figcaption></figure>`).join("")}`
      : "";
    const body = reportSections.map((section) => `<h2>${section}</h2><p>${report[section]}</p>`).join("");
    downloadFile(
      `${paperTitle || "paper-report"}.html`,
      "text/html;charset=utf-8",
      `<!doctype html><html lang="zh"><meta charset="utf-8"><title>${paperTitle}</title><body><h1>${paperTitle}</h1><p>领域分区：${selectedField}</p>${assetHtml}${list("自动提取的数据证据", evidence)}${list("公式与符号线索", formulas)}${list("实验设置线索", settings)}${body}</body></html>`,
    );
    showToast("HTML 已导出", "可直接打开查看图文并茂的分析报告。");
  }

  function speakReport() {
    if (!report) return showToast("还没有报告", "请先上传 PDF 生成分析报告。");
    window.speechSynthesis.cancel();
    const script = `${paperTitle}。${reportSections.map((section) => `${section}。${report[section]}`).join("。")}`;
    const utterance = new SpeechSynthesisUtterance(script.slice(0, 3500));
    utterance.lang = videoLanguage === "zh" ? "zh-CN" : "en-US";
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
    showToast("开始语音讲解", "当前使用浏览器语音合成试听；生成视频会走服务端 TTS + ffmpeg 输出带声音 MP4。");
  }

  async function generateVideo() {
    if (!report) return showToast("还没有报告", "请先上传 PDF 生成分析报告。");
    setIsGeneratingVideo(true);
    setTaskStatus("正在生成：服务端 TTS + ffmpeg 带声音 MP4");
    setActiveNav("视频生成");
    setVideoProvider("");

    try {
      const response = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: paperTitle,
          field: selectedField,
          language: videoLanguage,
          report,
          assets,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "视频生成失败");
      }

      const blob = await response.blob();
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoBlob(blob);
      setVideoUrl(URL.createObjectURL(blob));
      setVideoProvider(response.headers.get("X-TTS-Provider") ?? "server-tts");
      setTaskStatus("带声音 MP4 已生成：可预览与下载");
      showToast("带声音 MP4 已生成", "服务端已完成 TTS 音频和 ffmpeg 合成。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      setTaskStatus("视频生成失败：请查看错误信息");
      showToast("视频生成失败", message);
    } finally {
      setIsGeneratingVideo(false);
    }
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
            <button className="h-9 rounded-md border border-[#c8ced6] px-4 text-sm font-medium" onClick={() => setShowAccountPanel(true)}>
              {account ? account.name || account.email : "登录"}
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
            <button className={`w-full rounded-md px-3 py-2 text-left text-sm ${activeNav === item ? "bg-[#e8f1ff] font-medium text-[#174ea6]" : "text-[#536170]"}`} key={item} onClick={() => item === "账户管理" ? setShowAccountPanel(true) : setActiveNav(item)}>
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
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#536170]">服务端真实解析 PDF、截图关键页、抽取数据证据并调用本地 Ollama 生成深度报告。</p>
                </div>
                <span className="rounded-md bg-[#eef8f1] px-3 py-1 text-sm font-medium text-[#137333]">MVP</span>
              </div>
              <div className={`flex min-h-52 items-center justify-center rounded-lg border border-dashed ${dragging ? "border-[#1f6feb] bg-[#eef5ff]" : "border-[#aeb7c2] bg-[#fafbfc]"}`} onDragLeave={() => setDragging(false)} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDrop={onDrop}>
                <div className="text-center">
                  <p className="text-base font-medium">{selectedFile ? selectedFile.name : "拖拽 PDF 到这里"}</p>
                  <p className="mt-2 text-sm text-[#536170]">{selectedFile ? `大小 ${(selectedFile.size / 1024 / 1024).toFixed(2)} MB，分区 ${selectedField}` : "或点击上传，随后进入异步分析流程"}</p>
                  <button className="mt-5 h-10 rounded-md bg-[#1f6feb] px-5 text-sm font-medium text-white disabled:bg-[#93b7f4]" disabled={isAnalyzing} onClick={() => fileInputRef.current?.click()}>{isAnalyzing ? "分析中" : "选择文件"}</button>
                </div>
              </div>
              {(isAnalyzing || progress > 0) ? (
                <div className="mt-5 rounded-md border border-[#e1e5ea] bg-[#fbfcfe] p-4">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">{progressStages[stageIndex]?.label ?? "处理中"}</span>
                    <span className="text-[#536170]">{progress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#e8edf3]">
                    <div className="h-full rounded-full bg-[#1f6feb] transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-[#d9dde3] bg-white p-6">
              <h2 className="text-base font-semibold">任务流水线</h2>
              <div className="mt-5 space-y-3">
                {pipeline.map((step, index) => (
                  <div className={`flex items-center gap-3 rounded-md p-1 ${stageIndex >= index || report ? "bg-[#f3f6fa]" : ""}`} key={step}>
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
                <div className="mt-4 space-y-3">
                  {selectedPoints.map((point, index) => (
                    <div className="rounded-md border border-[#e1e5ea] bg-[#fbfcfe] p-3 leading-7 text-[#344054]" key={`${selectedSection}-${index}`}>
                      <span className="mr-2 font-semibold text-[#174ea6]">{index + 1}.</span>{point}
                    </div>
                  ))}
                </div>
              </article>
            </div>
          ) : null}

          {assets.length ? (
            <div className="rounded-lg border border-[#d9dde3] bg-white p-6">
              <h2 className="text-base font-semibold">PDF 关键页截图</h2>
              <div className="mt-4 grid grid-cols-2 gap-4">
                {assets.map((asset) => (
                  <figure className="rounded-md border border-[#e1e5ea] p-3" key={`${asset.page}-${asset.label}`}>
                    <img alt={asset.label} className="max-h-96 w-full object-contain" src={asset.dataUrl} />
                    <figcaption className="mt-2 text-sm text-[#536170]">{asset.label} - 第 {asset.page} 页</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ) : null}

          {(evidence.length || formulas.length || settings.length) ? (
            <div className="rounded-lg border border-[#d9dde3] bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">自动抽取的证据与设置</h2>
                <span className="text-sm text-[#536170]">{evidence.length} 数据证据 / {formulas.length} 公式线索 / {settings.length} 设置线索</span>
              </div>
              <EvidenceGroup title="数据证据" items={evidence.slice(0, 12)} />
              <EvidenceGroup title="公式与符号线索" items={formulas.slice(0, 8)} />
              <EvidenceGroup title="实验设置线索" items={settings.slice(0, 10)} />
            </div>
          ) : null}

          {analysisError ? (
            <div className="rounded-lg border border-[#f1b8b8] bg-[#fff7f7] p-6">
              <h2 className="text-base font-semibold text-[#b42318]">真实分析失败</h2>
              <p className="mt-3 break-words text-sm leading-6 text-[#7a271a]">{analysisError}</p>
              <p className="mt-3 text-sm text-[#536170]">这条信息来自后端 `/api/analyze`，没有使用模板报告。</p>
            </div>
          ) : null}

          <div className="rounded-lg border border-[#d9dde3] bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">讲解视频</h2>
                <p className="mt-1 text-sm text-[#536170]">服务端 TTS 生成讲解音频，并用 ffmpeg 合成为带声音 MP4。</p>
              </div>
              <div className="flex items-center gap-2">
                <button className={`rounded-md px-3 py-2 text-sm ${videoLanguage === "zh" ? "bg-[#1f6feb] text-white" : "border border-[#c8ced6]"}`} onClick={() => setVideoLanguage("zh")}>中文</button>
                <button className={`rounded-md px-3 py-2 text-sm ${videoLanguage === "en" ? "bg-[#1f6feb] text-white" : "border border-[#c8ced6]"}`} onClick={() => setVideoLanguage("en")}>English</button>
                <button className="rounded-md border border-[#c8ced6] px-4 py-2 text-sm" onClick={speakReport}>语音讲解</button>
                <button className="rounded-md bg-[#1f6feb] px-4 py-2 text-sm font-medium text-white disabled:bg-[#93b7f4]" disabled={isGeneratingVideo} onClick={generateVideo}>{isGeneratingVideo ? "生成中" : "生成视频"}</button>
              </div>
            </div>
            {videoUrl ? (
              <div className="mt-5">
                <video className="w-full rounded-md border border-[#d9dde3]" controls src={videoUrl} />
                {videoProvider ? <p className="mt-2 text-sm text-[#536170]">音频来源：{videoProvider}</p> : null}
                <button className="mt-3 rounded-md border border-[#c8ced6] px-4 py-2 text-sm" onClick={() => videoBlob && downloadFile(`${paperTitle || "paper-explainer"}.mp4`, "video/mp4", videoBlob)}>下载 MP4</button>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {showAccountPanel ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-6">
          <form className="w-full max-w-xl rounded-lg bg-white p-6 shadow-xl" onSubmit={saveAccount}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">账户与个人画像</h2>
                <p className="mt-1 text-sm text-[#536170]">当前为本地账户模式，信息保存在浏览器并用于个性化论文分析。</p>
              </div>
              <button className="rounded-md border border-[#c8ced6] px-3 py-2 text-sm" type="button" onClick={() => setShowAccountPanel(false)}>关闭</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="text-sm">邮箱<input className="mt-1 h-10 w-full rounded-md border border-[#c8ced6] px-3" value={accountDraft.email} onChange={(event) => setAccountDraft({ ...accountDraft, email: event.target.value })} /></label>
              <label className="text-sm">昵称<input className="mt-1 h-10 w-full rounded-md border border-[#c8ced6] px-3" value={accountDraft.name} onChange={(event) => setAccountDraft({ ...accountDraft, name: event.target.value })} /></label>
              <label className="text-sm">阶段/角色<input className="mt-1 h-10 w-full rounded-md border border-[#c8ced6] px-3" value={accountDraft.role} onChange={(event) => setAccountDraft({ ...accountDraft, role: event.target.value })} /></label>
              <label className="text-sm">研究方向<input className="mt-1 h-10 w-full rounded-md border border-[#c8ced6] px-3" value={accountDraft.researchDirection} onChange={(event) => setAccountDraft({ ...accountDraft, researchDirection: event.target.value })} /></label>
              <label className="col-span-2 text-sm">阅读目标<textarea className="mt-1 min-h-24 w-full rounded-md border border-[#c8ced6] px-3 py-2" value={accountDraft.goal} onChange={(event) => setAccountDraft({ ...accountDraft, goal: event.target.value })} /></label>
            </div>
            <div className="mt-5 flex justify-between">
              <button className="rounded-md border border-[#c8ced6] px-4 py-2 text-sm" type="button" onClick={logout}>退出账户</button>
              <button className="rounded-md bg-[#1f6feb] px-4 py-2 text-sm font-medium text-white" type="submit">保存并登录</button>
            </div>
          </form>
        </div>
      ) : null}

      {toast ? <div className="fixed bottom-6 right-6 z-30 w-80 rounded-lg border border-[#c8ced6] bg-white p-4 shadow-lg"><p className="font-medium">{toast.title}</p><p className="mt-1 text-sm text-[#536170]">{toast.detail}</p></div> : null}
    </main>
  );
}

function EvidenceGroup({ title, items }: { title: string; items: EvidenceItem[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-sm font-semibold text-[#536170]">{title}</h3>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div className="rounded-md border border-[#e1e5ea] px-3 py-2 text-sm" key={`${title}-${item.label}-${index}`}>
            <span className="font-medium text-[#174ea6]">{item.label}</span>
            <span className="mx-2 text-[#8792a0]">-</span>
            <span className="text-[#344054]">{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
