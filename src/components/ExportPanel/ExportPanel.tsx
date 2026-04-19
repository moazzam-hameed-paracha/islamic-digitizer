// src/components/ExportPanel/ExportPanel.tsx
'use client';

import { DigitizationJob } from '@/types';
import styles from './ExportPanel.module.scss';

interface ExportPanelProps {
	job: DigitizationJob;
	onExportAll: () => void;
	onReset: () => void;
}

export default function ExportPanel({
	job,
	onExportAll,
	onReset,
}: ExportPanelProps) {
	const donePages = job.pages.filter((p) => p.status === 'done');
	const totalChars = donePages.reduce((acc, p) => acc + p.arabicText.length, 0);
	const totalLines = donePages.reduce(
		(acc, p) => acc + (p.metadata?.estimatedLines ?? 0),
		0,
	);

	const handleExportJson = () => {
		const data = {
			source: job.file.name,
			digitizedAt: job.completedAt?.toISOString(),
			pages: donePages.map((p) => ({
				page: p.pageNumber,
				text: p.arabicText,
				confidence: p.confidence,
				metadata: p.metadata,
			})),
		};
		const blob = new Blob([JSON.stringify(data, null, 2)], {
			type: 'application/json',
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${job.file.name.replace(/\.[^.]+$/, '')}-digitized.json`;
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className={styles.panel}>
			{/* Stats */}
			<div className={styles.statsGrid}>
				<div className={styles.statCard}>
					<span className={styles.statVal}>{donePages.length}</span>
					<span className={styles.statKey}>Completed Pages</span>
				</div>
				<div className={styles.statCard}>
					<span className={styles.statVal}>
						{totalLines.toLocaleString('ar')}
					</span>
					<span className={styles.statKey}>Extracted Lines</span>
				</div>
				<div className={styles.statCard}>
					<span className={styles.statVal}>
						{totalChars.toLocaleString('ar')}
					</span>
					<span className={styles.statKey}>Arabic Characters</span>
				</div>
			</div>

			{/* Actions */}
			<div className={styles.actions}>
				<button className={styles.primaryBtn} onClick={onExportAll}>
					<svg viewBox='0 0 16 16' fill='none' aria-hidden='true'>
						<path
							d='M8 2 L8 10 M4 7 L8 11 L12 7'
							stroke='currentColor'
							strokeWidth='1.5'
							strokeLinecap='round'
							strokeLinejoin='round'
						/>
						<path
							d='M2 13 L14 13'
							stroke='currentColor'
							strokeWidth='1.5'
							strokeLinecap='round'
						/>
					</svg>
					Export Text (.txt)
				</button>

				<button className={styles.secondaryBtn} onClick={handleExportJson}>
					<svg viewBox='0 0 16 16' fill='none' aria-hidden='true'>
						<path
							d='M8 2 L8 10 M4 7 L8 11 L12 7'
							stroke='currentColor'
							strokeWidth='1.5'
							strokeLinecap='round'
							strokeLinejoin='round'
						/>
						<path
							d='M2 13 L14 13'
							stroke='currentColor'
							strokeWidth='1.5'
							strokeLinecap='round'
						/>
					</svg>
					Export JSON
				</button>

				<button className={styles.resetBtn} onClick={onReset}>
					<svg viewBox='0 0 16 16' fill='none' aria-hidden='true'>
						<path
							d='M3 8 A5 5 0 1 1 8 13'
							stroke='currentColor'
							strokeWidth='1.5'
							strokeLinecap='round'
						/>
						<path
							d='M3 4 L3 8 L7 8'
							stroke='currentColor'
							strokeWidth='1.5'
							strokeLinecap='round'
							strokeLinejoin='round'
						/>
					</svg>
					New File
				</button>
			</div>
		</div>
	);
}
