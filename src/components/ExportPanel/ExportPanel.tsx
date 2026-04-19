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

	return (
		<div className={styles.panel}>
			{/* Stats */}
			<div className={styles.statsGrid}>
				<div className={styles.statCard}>
					<span className={styles.statVal}>{donePages.length}</span>
					<span className={styles.statKey}>Pages</span>
				</div>
				<div className={styles.statCard}>
					<span className={styles.statVal}>
						{totalLines.toLocaleString('ar')}
					</span>
					<span className={styles.statKey}>Lines</span>
				</div>
				<div className={styles.statCard}>
					<span className={styles.statVal}>
						{totalChars.toLocaleString('ar')}
					</span>
					<span className={styles.statKey}>Characters</span>
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
					Save all as .txt
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
