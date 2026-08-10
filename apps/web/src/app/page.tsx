"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";

const navItems = ["论文库", "领域分区", "分析任务", "视频生成", "管理员后台"];

const pipeline = [
  "PDF upload",
  "Asset extraction",
  "Ollama analysis",
  "Report export",
  "Explainer video",
];

const reportSections = [
  "背景与问题",
  "创新点",
  "核心方法",
  "实验结果",
  "优劣势",
  "应用场景",
  "个性化建议",
  "复现难度",
];

const fields = ["人工智能", "机器学习", "自然语言处理", "计算机视觉", "材料科学", "其他"];

type Toast = {
  title: string;
  detail: string;
};

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeNav, setActiveNav] = useState(navItems[0]);
  const [selectedField, setSelectedField] = useState(fields[0]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [taskStatus, setTaskStatus] = useState("等待上传");
  const [toast, setToast] = useState<Toast | null>(null);
  const [videoLanguage, setVideoLanguage] = useState<"zh" | "en">("zh");

  const currentView = useMemo(() => {
    if (activeNav === "论文库") return "上传和管理论文";
    if (activeNav === "领域分区") return `当前分区：${selectedField}`;
    if (activeNav === "分析任务") return `任务状态：${taskStatus}`;
    if (activeNav === "视频生成") return `讲解语言：${videoLanguage === "zh" ? "中文" : "English"}`;
    return "RBAC 管理后台";
  }, [activeNav, selectedField, taskStatus, videoLanguage]);

  function showToast(title: string, detail: string) {
    setToast({ title, detail });
    window.setTimeout(() => setToast(null), 3200);
  }

  function pickFile() {
    fileInputRef.current?.click();
  }

  function acceptFile(file?: File) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showToast("文件格式不支持", "MVP 第一版只接收 PDF 文件。");
      return;
    }

    setSelectedFile(file);
    setTaskStatus("已创建任务：等待 worker 处理");
    setActiveNav("分析任务");
    showToast("PDF 已加入任务队列", `${file.name} 将依次进行解析、图表提取、分析和视频生成。`);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0]);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  }

  function simulateStep(step: string) {
    if (!selectedFile) {
      showToast("还没有论文", "请先上传一篇 PDF，再启动分析流程。");
      return;
    }

    setTaskStatus(`正在执行：${step}`);
    setActiveNav("分析任务");
    showToast("任务状态已更新", `${step} 已进入模拟执行状态，后续会接入真实 worker。`);
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
            <button
              className="h-9 rounded-md border border-[#c8ced6] px-4 text-sm font-medium"
              onClick={() => {
                setLoggedIn((value) => !value);
                showToast(loggedIn ? "已退出演示账号" : "已进入演示账号", "真实登录会在 Supabase Auth 接入后启用。");
              }}
            >
              {loggedIn ? "退出" : "登录"}
            </button>
            <button
              className="h-9 rounded-md bg-[#1f6feb] px-4 text-sm font-medium text-white"
              onClick={pickFile}
            >
              上传 PDF
            </button>
          </div>
        </div>
      </section>

      <input
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={onFileChange}
        ref={fileInputRef}
        type="file"
      />

      <div className="mx-auto grid max-w-7xl grid-cols-[240px_1fr] gap-6 px-6 py-6">
        <aside className="space-y-2 border-r border-[#d9dde3] pr-4">
          {navItems.map((item) => (
            <button
              className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                activeNav === item ? "bg-[#e8f1ff] font-medium text-[#174ea6]" : "text-[#536170]"
              }`}
              key={item}
              onClick={() => setActiveNav(item)}
            >
              {item}
            </button>
          ))}

          <div className="pt-6">
            <p className="mb-2 text-xs font-semibold uppercase text-[#697586]">领域分区</p>
            <select
              className="h-9 w-full rounded-md border border-[#c8ced6] bg-white px-2 text-sm"
              onChange={(event) => setSelectedField(event.target.value)}
              value={selectedField}
            >
              {fields.map((field) => (
                <option key={field}>{field}</option>
              ))}
            </select>
          </div>
        </aside>

        <section className="space-y-6">
          <div className="rounded-md border border-[#d9dde3] bg-white px-4 py-3 text-sm">
            <span className="font-medium">{activeNav}</span>
            <span className="mx-2 text-[#8792a0]">/</span>
            <span className="text-[#536170]">{currentView}</span>
          </div>

          <div className="grid grid-cols-[1.25fr_0.75fr] gap-6">
            <div className="rounded-lg border border-[#d9dde3] bg-white p-6">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">上传论文并生成结构化分析</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#536170]">
                    第一版支持 PDF 上传、本地 Ollama 分析、论文图表提取、Markdown/HTML 导出，以及中英文图文讲解视频生成。
                  </p>
                </div>
                <span className="rounded-md bg-[#eef8f1] px-3 py-1 text-sm font-medium text-[#137333]">
                  MVP
                </span>
              </div>

              <div
                className={`flex min-h-52 items-center justify-center rounded-lg border border-dashed ${
                  dragging ? "border-[#1f6feb] bg-[#eef5ff]" : "border-[#aeb7c2] bg-[#fafbfc]"
                }`}
                onDragLeave={() => setDragging(false)}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDrop={onDrop}
              >
                <div className="text-center">
                  <p className="text-base font-medium">
                    {selectedFile ? selectedFile.name : "拖拽 PDF 到这里"}
                  </p>
                  <p className="mt-2 text-sm text-[#536170]">
                    {selectedFile
                      ? `大小 ${(selectedFile.size / 1024 / 1024).toFixed(2)} MB，分区 ${selectedField}`
                      : "或点击上传，随后进入异步任务队列"}
                  </p>
                  <button
                    className="mt-5 h-10 rounded-md bg-[#1f6feb] px-5 text-sm font-medium text-white"
                    onClick={pickFile}
                  >
                    选择文件
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-[#d9dde3] bg-white p-6">
              <h2 className="text-base font-semibold">任务流水线</h2>
              <div className="mt-5 space-y-3">
                {pipeline.map((step, index) => (
                  <button className="flex w-full items-center gap-3 rounded-md p-1 text-left hover:bg-[#f3f6fa]" key={step} onClick={() => simulateStep(step)}>
                    <span className="flex size-7 items-center justify-center rounded-full bg-[#edf2f7] text-sm font-medium text-[#536170]">
                      {index + 1}
                    </span>
                    <span className="text-sm">{step}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <button className="rounded-lg border border-[#d9dde3] bg-white p-5 text-left hover:border-[#1f6feb]" onClick={() => setActiveNav("分析任务")}>
              <p className="text-sm text-[#536170]">任务状态</p>
              <p className="mt-2 text-xl font-semibold">{taskStatus}</p>
            </button>
            <button className="rounded-lg border border-[#d9dde3] bg-white p-5 text-left hover:border-[#1f6feb]" onClick={() => showToast("模型服务", "后续会连接同机 Ollama 服务。")}>
              <p className="text-sm text-[#536170]">模型服务</p>
              <p className="mt-2 text-2xl font-semibold">Ollama local</p>
            </button>
            <div className="rounded-lg border border-[#d9dde3] bg-white p-5">
              <p className="text-sm text-[#536170]">导出格式</p>
              <div className="mt-3 flex gap-2">
                <button className="rounded-md border border-[#c8ced6] px-3 py-2 text-sm" onClick={() => showToast("Markdown 导出", "真实报告生成后会下载 .md 文件。")}>
                  MD
                </button>
                <button className="rounded-md border border-[#c8ced6] px-3 py-2 text-sm" onClick={() => showToast("HTML 导出", "真实报告生成后会下载 .html 文件。")}>
                  HTML
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[#d9dde3] bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">固定报告结构</h2>
              <span className="text-sm text-[#536170]">支持用户画像个性化建议</span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {reportSections.map((section) => (
                <button
                  className="rounded-md border border-[#e1e5ea] px-3 py-3 text-left text-sm hover:border-[#1f6feb] hover:bg-[#f8fbff]"
                  key={section}
                  onClick={() => showToast(section, "后续会展示该段落生成内容、引用页码和相关图表。")}
                >
                  {section}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[#d9dde3] bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">讲解视频</h2>
                <p className="mt-1 text-sm text-[#536170]">图文、旁白和字幕合成 MP4，不做真人数字人。</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={`rounded-md px-3 py-2 text-sm ${videoLanguage === "zh" ? "bg-[#1f6feb] text-white" : "border border-[#c8ced6]"}`}
                  onClick={() => setVideoLanguage("zh")}
                >
                  中文
                </button>
                <button
                  className={`rounded-md px-3 py-2 text-sm ${videoLanguage === "en" ? "bg-[#1f6feb] text-white" : "border border-[#c8ced6]"}`}
                  onClick={() => setVideoLanguage("en")}
                >
                  English
                </button>
                <button
                  className="rounded-md bg-[#1f6feb] px-4 py-2 text-sm font-medium text-white"
                  onClick={() => simulateStep("Explainer video")}
                >
                  生成视频
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {toast ? (
        <div className="fixed bottom-6 right-6 w-80 rounded-lg border border-[#c8ced6] bg-white p-4 shadow-lg">
          <p className="font-medium">{toast.title}</p>
          <p className="mt-1 text-sm text-[#536170]">{toast.detail}</p>
        </div>
      ) : null}
    </main>
  );
}
