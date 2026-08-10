import "dotenv/config";

const workerId = `${process.env.HOSTNAME ?? "local"}-${process.pid}`;
const concurrency = Number.parseInt(process.env.WORKER_CONCURRENCY ?? "2", 10);
const pollIntervalMs = Number.parseInt(process.env.WORKER_POLL_INTERVAL_MS ?? "3000", 10);

type TaskType =
  | "paper_parse"
  | "asset_extract"
  | "paper_analyze"
  | "report_export"
  | "video_generate";

type ClaimedTask = {
  id: string;
  task_type: TaskType;
  paper_id: string | null;
  payload: Record<string, unknown>;
};

async function claimTasks(): Promise<ClaimedTask[]> {
  // TODO: replace with an RPC that atomically claims unlocked pending jobs.
  return [];
}

async function processTask(task: ClaimedTask) {
  console.log(`[worker:${workerId}] processing ${task.task_type} ${task.id}`);
  // TODO: route to PDF parsing, asset extraction, Ollama analysis, export, or video generation.
}

async function tick() {
  const tasks = await claimTasks();
  await Promise.all(tasks.slice(0, concurrency).map(processTask));
}

async function main() {
  console.log(`[worker:${workerId}] started with concurrency=${concurrency}`);
  setInterval(() => {
    tick().catch((error) => {
      console.error(`[worker:${workerId}] tick failed`, error);
    });
  }, pollIntervalMs);
}

main().catch((error) => {
  console.error(`[worker:${workerId}] fatal`, error);
  process.exit(1);
});
