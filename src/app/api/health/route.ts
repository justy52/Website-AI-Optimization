export async function GET() {
  return Response.json(
    {
      status: "ok",
      app: "optiq",
      phase: "8",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
