import { readPhaseMarker, readPhaseSidecar } from "./scripting/openspec/read-phase-marker";

const phase = process.argv[2] || "planner";

console.log(`=== PHASE MARKER: ${phase} ===`);
try {
  const marker = readPhaseMarker(phase);
  console.log(JSON.stringify(marker, null, 2));
} catch (e: any) {
  console.log("ERROR:", e.message);
}

console.log(`\n=== PHASE SIDECAR: ${phase} ===`);
const sidecar = readPhaseSidecar(phase, ".timings.json", "open");
if (!sidecar) {
  console.log("null (absent or corrupt)");
} else {
  const stages = sidecar.stages || [];
  const first = stages[0];
  const last = stages[stages.length - 1];
  if (first && last) {
    const duration = last.completedAt - first.startedAt;
    const mins = Math.floor(duration / 60000);
    const secs = Math.floor((duration % 60000) / 1000);
    console.log(JSON.stringify({ phaseDurationMs: duration, phaseDurationHuman: `${mins}m ${secs}s`, startedAt: first.startedAt, completedAt: last.completedAt }, null, 2));
  } else {
    console.log("insufficient data");
  }
}
