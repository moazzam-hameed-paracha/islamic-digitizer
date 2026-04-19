// src/app/api/digitize/route.ts
import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Qari OCR — local Gradio server
//
// The Python script runs:  iface.launch()   →  http://localhost:7860
//
// Gradio's gr.Interface exposes a single REST endpoint:
//   POST /api/predict
//   Body:  { "data": ["data:<mediaType>;base64,<base64>"] }
//   Reply: { "data": ["<plain text>"], "duration": <float>, ... }
// ---------------------------------------------------------------------------

const GRADIO_BASE_URL =
	process.env.GRADIO_URL?.replace(/\/$/, '') ?? 'http://localhost:7860';

const PREDICT_URL = `${GRADIO_BASE_URL}/api/digitize`;

// ---------------------------------------------------------------------------
// Derive lightweight metadata from the raw OCR text so the rest of the app
// (confidence badge, chips, line-count, etc.) keeps working without changes.
// ---------------------------------------------------------------------------
function deriveMetadata(text: string) {
	const lines = text.split('\n');
	const nonEmpty = lines.filter((l) => l.trim().length > 0);

	// Arabic diacritics: U+064B (tanwin fath) … U+065F + U+0670 (superscript alef)
	const hasDiacritics = /[\u064B-\u065F\u0670]/.test(text);

	// Heuristic: a "heading" line is short (≤ 40 chars), non-empty, and surrounded
	// by blank lines — or appears as the very first non-empty line.
	const hasHeadings = nonEmpty.some((line, i) => {
		const trimmed = line.trim();
		if (trimmed.length === 0 || trimmed.length > 40) return false;
		const prev = nonEmpty[i - 1]?.trim() ?? '';
		return prev.length === 0 || i === 0;
	});

	// Very rough table detector: multiple lines that contain "|" or tab-separated cols
	const hasTables = nonEmpty.some(
		(l) =>
			(l.match(/\|/g) ?? []).length >= 2 || (l.match(/\t/g) ?? []).length >= 2,
	);

	// Confidence: if the model returned a reasonable amount of Arabic text → high
	const arabicCharCount = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
	const confidence: 'high' | 'medium' | 'low' =
		arabicCharCount > 100 ? 'high' : arabicCharCount > 20 ? 'medium' : 'low';

	return {
		confidence,
		metadata: {
			hasHeadings,
			hasDiacritics,
			hasTables,
			estimatedLines: nonEmpty.length,
		},
	};
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
	return NextResponse.json(
		{ message: 'This endpoint only accepts POST requests.' },
		{ status: 405 },
	);
}

export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const { imageBase64, mediaType } = body as {
			imageBase64: string;
			mediaType?: string;
		};

		if (!imageBase64) {
			return NextResponse.json(
				{ error: 'imageBase64 is required' },
				{ status: 400 },
			);
		}

		// Gradio expects the image as a data-URL string inside the "data" array.
		const dataUrl = `data:${mediaType ?? 'image/png'};base64,${imageBase64}`;

		const mlRes = await fetch(PREDICT_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ dataUrl }),
		});

		if (!mlRes.ok) {
			const err = await mlRes.text();
			console.error('Gradio OCR error:', err);
			return NextResponse.json(
				{ error: 'Gradio server returned an error', details: err },
				{ status: mlRes.status },
			);
		}

		const gradioData = (await mlRes.json()) as {
			id: string;
			text: string;
			duration: number;
		};

		const { confidence, metadata } = deriveMetadata(gradioData.text);

		return NextResponse.json({ ...gradioData, confidence, metadata });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';

		// Give a friendlier message when the local server is simply not running.
		if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
			return NextResponse.json(
				{
					error: 'Cannot reach the Qari OCR server.',
					details:
						`Make sure the Python script is running and accessible at ${GRADIO_BASE_URL}. ` +
						'Set GRADIO_URL in .env.local if you changed the port.',
				},
				{ status: 503 },
			);
		}

		console.error('Digitize route error:', error);
		return NextResponse.json(
			{ error: 'Internal server error', details: message },
			{ status: 500 },
		);
	}
}
