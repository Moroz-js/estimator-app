import { buildWorkbookFromScratch, type Input } from "@/lib/excelBuilder";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const input = (await req.json()) as Input;
    const buffer = await buildWorkbookFromScratch(input);

    const projName = (input?.project?.name || "Project").toString().trim() || "Project";
    const date = (input?.project?.date || "").toString();
    const fileName = `${projName.replace(/[\\/:*?"<>|]/g, "_")}_Estimate${date ? "_" + date : ""}.xlsx`;

    const uint8 = new Uint8Array(buffer);
    return new Response(uint8, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function GET() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
