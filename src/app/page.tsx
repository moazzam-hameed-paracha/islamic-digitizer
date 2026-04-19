// src/app/page.tsx
'use client';

import { useRef } from 'react';
import { Header } from '@/components/Header';
import { FileUploader } from '@/components/FileUploader';
import { ProcessingStatus } from '@/components/ProcessingStatus';
import { PageNavigator } from '@/components/PageNavigator';
import { ResultViewer } from '@/components/ResultViewer';
import { ExportPanel } from '@/components/ExportPanel';
import { useDigitizer } from '@/hooks/useDigitizer';
import styles from './page.module.scss';

export default function Home() {
	const {
		job,
		selectedPage,
		setSelectedPage,
		startJob,
		cancelJob,
		resetJob,
		removePage,
		exportAllText,
		copyPageText,
	} = useDigitizer();

	const resultRef = useRef<HTMLDivElement>(null);

	const handleFileSelect = (files: File | File[]) => {
		startJob(files);
		setTimeout(() => {
			resultRef.current?.scrollIntoView({ behavior: 'smooth' });
		}, 200);
	};

	const currentPage = job?.pages.find((p) => p.pageNumber === selectedPage);

	const showResults = !!job;
	const isComplete = job?.status === 'complete';

	return (
		<div className={styles.app}>
			<Header />

			<main className={styles.main}>
				{/* ── Hero / Upload ─────────────────────────────────────────────── */}
				{!job && (
					<section className={styles.hero}>
						{/* Geometric Islamic ornament */}
						<div className={styles.ornament} aria-hidden='true'>
							<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'>
								{/* 8-pointed star */}
								<g
									transform='translate(100,100)'
									fill='none'
									stroke='currentColor'
									strokeWidth='0.6'>
									{[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
										<g key={angle} transform={`rotate(${angle})`}>
											<line x1='0' y1='0' x2='0' y2='-85' />
											<polygon points='0,-85 -10,-65 10,-65' />
										</g>
									))}
									<circle cx='0' cy='0' r='30' />
									<circle cx='0' cy='0' r='55' strokeDasharray='4 4' />
									<circle cx='0' cy='0' r='80' />
								</g>
							</svg>
						</div>

						<div className={styles.heroText}>
							<h1 className={styles.heroTitle}>مرقمن</h1>
							<p className={styles.heroSubtitle}>
								Islamic Manuscript Digitizer
							</p>
							<p className={styles.heroDesc}>
								Convert your illustrated Islamic manuscripts and books into
								accurate digital Arabic text, Powered by the Qari-OCR model,
								specialized in Arabic calligraphy.
							</p>
						</div>

						<div className={styles.uploaderWrap}>
							<FileUploader onFileSelect={handleFileSelect} />
						</div>

						{/* Features row */}
						<div className={styles.features}>
							{[
								{
									icon: '✦',
									title: 'Support Arabic fonts',
									desc: "Ottoman, Nasta'liq, Kufic, and other copies",
								},
								{
									icon: '✦',
									title: 'Preserve diacritics',
									desc: 'Harakat, tanween, and shadda are preserved',
								},
								{
									icon: '✦',
									title: 'Support multi-page PDFs',
									desc: 'Automatic page-by-page processing',
								},
							].map((f) => (
								<div key={f.title} className={styles.featureCard}>
									<span className={styles.featureIcon}>{f.icon}</span>
									<strong className={styles.featureTitle}>{f.title}</strong>
									<p className={styles.featureDesc}>{f.desc}</p>
								</div>
							))}
						</div>
					</section>
				)}

				{/* ── Results workspace ──────────────────────────────────────────── */}
				{showResults && (
					<section className={styles.workspace} ref={resultRef}>
						{/* File header bar */}
						<div className={styles.workspaceHeader}>
							<div className={styles.fileInfo}>
								<span className={styles.fileBadge}>
									{job.file.type === 'pdf'
										? 'PDF'
										: job.sourceFiles
											? `${job.pages.length} images`
											: 'image'}
								</span>
								<span className={styles.fileName}>{job.file.name}</span>
							</div>

							{!isComplete && (
								<button className={styles.newFileBtn} onClick={resetJob}>
									✕ Cancel and upload another file
								</button>
							)}
						</div>

						{/* Processing status bar */}
						<ProcessingStatus job={job} onCancel={cancelJob} />

						{/* Main 3-column layout */}
						<div className={styles.workspaceGrid}>
							{/* Left col: page navigator */}
							{job.totalPages > 1 && (
								<aside className={styles.sidebarLeft}>
									<PageNavigator
										pages={job.pages}
										selectedPage={selectedPage}
										onSelectPage={setSelectedPage}
										onRemovePage={removePage}
										isProcessing={job.status === 'processing'}
									/>
								</aside>
							)}

							{/* Centre: result viewer */}
							<div
								className={styles.viewerWrap}
								style={
									job.totalPages === 1 ? { gridColumn: '1 / -1' } : undefined
								}>
								{currentPage ? (
									<ResultViewer
										page={currentPage}
										onCopy={() => copyPageText(selectedPage)}
									/>
								) : (
									<div className={styles.noPage}>
										Select a page from the list
									</div>
								)}
							</div>

							{/* Right col: export panel (shown when at least 1 page done) */}
							{isComplete && (
								<aside className={styles.sidebarRight}>
									<ExportPanel
										job={job}
										onExportAll={exportAllText}
										onReset={resetJob}
									/>
								</aside>
							)}
						</div>
					</section>
				)}
			</main>

			<footer className={styles.footer} dir='ltr'>
				<p>
					Powered by{' '}
					<a
						href='https://huggingface.co/oddadmix/Qari-OCR-0.1-VL-2B-Instruct'
						target='_blank'
						rel='noopener noreferrer'>
						Qari-OCR-0.1-VL-2B
					</a>{' '}
					· Arabic Vision OCR for Islamic Manuscripts
				</p>
			</footer>
		</div>
	);
}
