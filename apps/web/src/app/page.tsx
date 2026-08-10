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

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f6f7f9] text-[#1d242d]">
      <section className="border-b border-[#d9dde3] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium text-[#536170]">Paper Companion</p>
            <h1 className="text-2xl font-semibold tracking-normal">论文分析与讲解工作台</h1>
          </div>
          <div className="flex items-center gap-3">
            <button className="h-9 rounded-md border border-[#c8ced6] px-4 text-sm font-medium">
              登录
            </button>
            <button className="h-9 rounded-md bg-[#1f6feb] px-4 text-sm font-medium text-white">
              上传 PDF
            </button>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl grid-cols-[240px_1fr] gap-6 px-6 py-6">
        <aside className="space-y-2 border-r border-[#d9dde3] pr-4">
          {["论文库", "领域分区", "分析任务", "视频生成", "管理员后台"].map((item, index) => (
            <button
              className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                index === 0 ? "bg-[#e8f1ff] font-medium text-[#174ea6]" : "text-[#536170]"
              }`}
              key={item}
            >
              {item}
            </button>
          ))}
        </aside>

        <section className="space-y-6">
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

              <div className="flex min-h-52 items-center justify-center rounded-lg border border-dashed border-[#aeb7c2] bg-[#fafbfc]">
                <div className="text-center">
                  <p className="text-base font-medium">拖拽 PDF 到这里</p>
                  <p className="mt-2 text-sm text-[#536170]">或点击上传，随后进入异步任务队列</p>
                  <button className="mt-5 h-10 rounded-md bg-[#1f6feb] px-5 text-sm font-medium text-white">
                    选择文件
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-[#d9dde3] bg-white p-6">
              <h2 className="text-base font-semibold">任务流水线</h2>
              <div className="mt-5 space-y-3">
                {pipeline.map((step, index) => (
                  <div className="flex items-center gap-3" key={step}>
                    <span className="flex size-7 items-center justify-center rounded-full bg-[#edf2f7] text-sm font-medium text-[#536170]">
                      {index + 1}
                    </span>
                    <span className="text-sm">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="rounded-lg border border-[#d9dde3] bg-white p-5">
              <p className="text-sm text-[#536170]">当前设计</p>
              <p className="mt-2 text-2xl font-semibold">单机多 worker</p>
            </div>
            <div className="rounded-lg border border-[#d9dde3] bg-white p-5">
              <p className="text-sm text-[#536170]">模型服务</p>
              <p className="mt-2 text-2xl font-semibold">Ollama local</p>
            </div>
            <div className="rounded-lg border border-[#d9dde3] bg-white p-5">
              <p className="text-sm text-[#536170]">导出格式</p>
              <p className="mt-2 text-2xl font-semibold">MD / HTML</p>
            </div>
          </div>

          <div className="rounded-lg border border-[#d9dde3] bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">固定报告结构</h2>
              <span className="text-sm text-[#536170]">支持用户画像个性化建议</span>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {reportSections.map((section) => (
                <div className="rounded-md border border-[#e1e5ea] px-3 py-3 text-sm" key={section}>
                  {section}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
