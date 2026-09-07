export async function GET() {
  return Response.json(
    {
      status: "ok",
      app: "optiq",
      phase: "3",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
