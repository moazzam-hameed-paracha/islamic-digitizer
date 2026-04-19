// src/components/ProcessingStatus/ProcessingStatus.tsx
'use client';

import { DigitizationJob } from '@/types';
import styles from './ProcessingStatus.module.scss';
import clsx from 'clsx';
import { useEffect, useState } from 'react';

interface ProcessingStatusProps {
	job: DigitizationJob;
	onCancel: () => void;
}

export default function ProcessingStatus({
	job,
	onCancel,
}: ProcessingStatusProps) {
	const doneCount = job.pages.filter((p) => p.status === 'done').length;
	const errorCount = job.pages.filter((p) => p.status === 'error').length;
	const progressPercent =
		job.totalPages > 0 ? Math.round((doneCount / job.totalPages) * 100) : 0;

	const isProcessing = job.status === 'processing';
	const isComplete = job.status === 'complete';

	// ── Elapsed-time ticker ────────────────────────────────────────────────────
	const [elapsed, setElapsed] = useState(0);

	useEffect(() => {
		if (!isProcessing) {
			setElapsed(0);
			return;
		}
		const start = Date.now();
		const id = setInterval(() => {
			setElapsed(Math.floor((Date.now() - start) / 1000));
		}, 1000);
		return () => clearInterval(id);
	}, [isProcessing]);

	const formatElapsed = (s: number) => {
		const m = Math.floor(s / 60);
		const sec = s % 60;
		return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
	};

	return (
		<div className={styles.wrapper}>
			<div className={styles.header}>
				<div className={styles.titleGroup}>
					{isProcessing && (
						<span className={styles.spinnerWrap} aria-hidden='true'>
							<span className={styles.spinner} />
						</span>
					)}
					{isComplete && (
						<span className={styles.checkIcon} aria-hidden='true'>
							<svg viewBox='0 0 24 24' fill='none'>
								<circle
									cx='12'
									cy='12'
									r='10'
									stroke='currentColor'
									strokeWidth='1.5'
								/>
								<path
									d='M8 12.5 L11 15.5 L16 9'
									stroke='currentColor'
									strokeWidth='1.5'
									strokeLinecap='round'
									strokeLinejoin='round'
								/>
							</svg>
						</span>
					)}
					<div>
						<p className={styles.title}>
							{isProcessing
								? `Processing page ${job.currentPage} of ${job.totalPages}`
								: isComplete
									? 'Digital transformation is complete'
									: 'The transfer has stopped'}
						</p>
						<p className={styles.filename}>{job.file.name}</p>
					</div>
				</div>

				<div className={styles.headerRight}>
					{isProcessing && (
						<span className={styles.elapsed} aria-live='polite'>
							⏱ {formatElapsed(elapsed)}
						</span>
					)}
					{isProcessing && (
						<button className={styles.cancelBtn} onClick={onCancel}>
							Stop
						</button>
					)}
				</div>
			</div>

			{/* Progress bar */}
			<div
				className={styles.progressTrack}
				role='progressbar'
				aria-valuenow={progressPercent}
				aria-valuemin={0}
				aria-valuemax={100}>
				<div
					className={clsx(styles.progressFill, {
						[styles.complete]: isComplete,
					})}
					style={{ width: `${progressPercent}%` }}
				/>
			</div>

			{/* Page dots */}
			<div className={styles.pageDots}>
				{job.pages.map((page) => (
					<span
						key={page.pageNumber}
						className={clsx(styles.dot, {
							[styles.dotDone]: page.status === 'done',
							[styles.dotProcessing]: page.status === 'processing',
							[styles.dotError]: page.status === 'error',
						})}
						title={`Page ${page.pageNumber}: ${page.status}`}
					/>
				))}
			</div>

			{/* Stats */}
			<div className={styles.stats}>
				<span className={styles.stat}>
					<span className={styles.statValue}>{doneCount}</span>
					<span className={styles.statLabel}>Completed</span>
				</span>
				<span className={styles.statDivider} />
				<span className={styles.stat}>
					<span className={styles.statValue}>
						{job.totalPages - doneCount - errorCount}
					</span>
					<span className={styles.statLabel}>Remaining</span>
				</span>
				{errorCount > 0 && (
					<>
						<span className={styles.statDivider} />
						<span className={clsx(styles.stat, styles.statError)}>
							<span className={styles.statValue}>{errorCount}</span>
							<span className={styles.statLabel}>Error</span>
						</span>
					</>
				)}
			</div>
		</div>
	);
}
