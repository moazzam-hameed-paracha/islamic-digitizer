import { NextRequest, NextResponse } from 'next/server';
import { addArabicDiacritics } from '@/lib/gemini';

const OCR_SERVER_URL =
	process.env.OCR_SERVER_URL?.replace(/\/$/, '') ?? 'http://localhost:7860';

export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ jobId: string }> },
) {
	const { jobId } = await params;

	let pollRes: Response;
	try {
		pollRes = await fetch(`${OCR_SERVER_URL}/api/digitize/${jobId}`);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
			return NextResponse.json(
				{ error: 'Cannot reach the Qari OCR server.' },
				{ status: 503 },
			);
		}
		return NextResponse.json(
			{ error: 'Internal server error', details: message },
			{ status: 500 },
		);
	}

	if (pollRes.status === 404) {
		return NextResponse.json({ error: 'Job not found' }, { status: 404 });
	}

	if (!pollRes.ok) {
		return NextResponse.json(
			{ error: 'Poll failed', details: await pollRes.text() },
			{ status: pollRes.status },
		);
	}

	const data = (await pollRes.json()) as {
		status: 'pending' | 'done' | 'error';
		text?: string;
		id?: string;
		duration?: number;
		tokenCount?: number;
		maxTokens?: number;
		error?: string;
	};

	// Still running — pass status through so the client keeps polling.
	if (data.status === 'pending') {
		return NextResponse.json({ status: 'pending' });
	}

	// OCR failed (including MAX_TOKENS_REACHED).
	if (data.status === 'error') {
		return NextResponse.json(
			{
				status: 'error',
				error: data.error ?? 'OCR failed',
				tokenCount: data.tokenCount,
				maxTokens: data.maxTokens,
			},
			{ status: 422 },
		);
	}

	// OCR done — apply Gemini diacritization before returning to the client.
	const diacritizedText = await addArabicDiacritics(data.text ?? '');
	return NextResponse.json({
		status: 'done',
		id: data.id,
		text: diacritizedText,
		duration: data.duration,
		tokenCount: data.tokenCount,
		maxTokens: data.maxTokens,
	});
}
