// src/app/api/digitize/route.ts
import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Qari OCR — local FastAPI server
//
// The Python script (main.py) runs via uvicorn  →  http://localhost:7860
//
// The FastAPI server exposes a single REST endpoint:
//   POST /api/digitize
//   Body:  { "dataUrl": "data:<mediaType>;base64,<base64>" }
//   Reply: { "id": "...", "text": "...", "duration": <float>, ... }
// ---------------------------------------------------------------------------

const OCR_SERVER_URL =
	process.env.OCR_SERVER_URL?.replace(/\/$/, '') ?? 'http://localhost:7860';

const OCR_ENDPOINT = `${OCR_SERVER_URL}/api/digitize`;

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest) {
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

		// The FastAPI server expects the image as a data-URL string.
		const dataUrl = `data:${mediaType ?? 'image/png'};base64,${imageBase64}`;

		const ocrRes = await fetch(OCR_ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ dataUrl }),
		});

		if (!ocrRes.ok) {
			const err = await ocrRes.text();
			let parsedErr: {
				detail?: {
					code?: string;
					message?: string;
					tokenCount?: number;
					maxTokens?: number;
				};
			} = {};
			try {
				parsedErr = JSON.parse(err);
			} catch {
				/* raw text */
			}

			if (
				ocrRes.status === 422 &&
				parsedErr?.detail?.code === 'MAX_TOKENS_REACHED'
			) {
				return NextResponse.json(
					{
						error: 'MAX_TOKENS_REACHED',
						details: parsedErr.detail?.message ?? 'Token limit reached',
						tokenCount: parsedErr.detail?.tokenCount,
						maxTokens: parsedErr.detail?.maxTokens,
					},
					{ status: 422 },
				);
			}

			console.error('OCR server error:', err);
			return NextResponse.json(
				{ error: 'OCR server returned an error', details: err },
				{ status: ocrRes.status },
			);
		}

		const ocrResponse = (await ocrRes.json()) as {
			id: string;
			text: string;
			duration: number;
			tokenCount?: number;
			maxTokens?: number;
		};

		return NextResponse.json(ocrResponse);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';

		// Give a friendlier message when the local server is simply not running.
		if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
			return NextResponse.json(
				{
					error: 'Cannot reach the Qari OCR server.',
					details:
						`Make sure the Python script is running and accessible at ${OCR_SERVER_URL}. ` +
						'Set OCR_SERVER_URL in .env.local if you changed the port.',
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
