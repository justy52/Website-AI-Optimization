export async function GET() {
  return Response.json(
    {
      status: "ok",
      app: "optiq",
      phase: "0",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
