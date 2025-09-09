import { NextResponse } from "next/server";

async function pollForResult(
  stream_id: string,
  prompt_id: string,
  maxAttempts = 10,
  interval = 3000
): Promise<Record<string, unknown>> {
  for (let i = 0; i < maxAttempts; i++) {
    const check = await fetch(
      `https://api.daydream.live/beta/streams/${stream_id}/prompts/${prompt_id}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.DAYDREAM_API_KEY ?? ""}`,
        },
      }
    );

    if (!check.ok) {
      throw new Error(await check.text());
    }

    const data = (await check.json()) as Record<string, unknown>;

    if (data.status === "succeeded") {
      return data;
    }

    if (data.status === "failed") {
      throw new Error("Prompt failed to process");
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error("Polling timed out, result not ready");
}

export async function POST(req: Request) {
  try {
    const { stream_id, prompt, image } = (await req.json()) as {
      stream_id: string;
      prompt: string;
      image?: string;
    };

    if (!stream_id || !prompt) {
      return NextResponse.json(
        { error: "Missing required fields: stream_id and prompt are required" },
        { status: 400 }
      );
    }

    const pipeline = image ? "image-to-image" : "text-to-image";

    const response = await fetch(
      `https://api.daydream.live/beta/streams/${stream_id}/prompts`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DAYDREAM_API_KEY ?? ""}`,
        },
        body: JSON.stringify({
          pipeline,
          model_id: "streamdiffusion",
          params: {
            prompt,
            ...(image ? { image } : {}),
            guidance_scale: 7.5,
            num_inference_steps: 50,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: errorText },
        { status: response.status }
      );
    }

    const initial = (await response.json()) as {
      id?: string;
      status?: string;
      [key: string]: unknown;
    };

    // If job still running → poll for result
    if (initial.id && initial.status !== "succeeded") {
      const finalData = await pollForResult(stream_id, initial.id);
      return NextResponse.json(finalData);
    }

    return NextResponse.json(initial);
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: "Unknown server error" },
      { status: 500 }
    );
  }
}
