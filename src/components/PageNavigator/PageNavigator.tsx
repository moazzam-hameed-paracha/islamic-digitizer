// src/components/PageNavigator/PageNavigator.tsx
'use client';

import { PageResult } from '@/types';
import styles from './PageNavigator.module.scss';
import clsx from 'clsx';

interface PageNavigatorProps {
	pages: PageResult[];
	selectedPage: number;
	onSelectPage: (page: number) => void;
	onRemovePage?: (page: number) => void;
	isProcessing?: boolean;
}

const STATUS_LABEL: Record<string, string> = {
	pending: 'Pending',
	processing: 'Processing',
	done: 'Done',
	error: 'Error',
};

export default function PageNavigator({
	pages,
	selectedPage,
	onSelectPage,
	onRemovePage,
	isProcessing,
}: PageNavigatorProps) {
	return (
		<nav className={styles.nav} aria-label='Page navigation'>
			<p className={styles.heading}>Pages</p>

			<ul className={styles.list} role='list'>
				{pages.map((page) => (
					<li key={page.pageNumber} className={styles.item}>
						<button
							className={clsx(styles.pageBtn, {
								[styles.selected]: page.pageNumber === selectedPage,
								[styles.done]: page.status === 'done',
								[styles.processing]: page.status === 'processing',
								[styles.error]: page.status === 'error',
							})}
							onClick={() => onSelectPage(page.pageNumber)}
							aria-current={
								page.pageNumber === selectedPage ? 'page' : undefined
							}
							aria-label={`Page ${page.pageNumber} — ${STATUS_LABEL[page.status]}`}>
							<span className={styles.pageNum}>{page.pageNumber}</span>

							<span className={styles.statusDot} aria-hidden='true' />

							{page.status === 'processing' && (
								<span className={styles.spinner} aria-hidden='true' />
							)}

							{page.metadata && page.status === 'done' && (
								<span className={styles.meta}>
									{page.metadata.estimatedLines} lines
								</span>
							)}
						</button>

						{/* Remove button — only shown when not actively processing */}
						{onRemovePage && !isProcessing && (
							<button
								className={styles.removeBtn}
								onClick={(e) => {
									e.stopPropagation();
									onRemovePage(page.pageNumber);
								}}
								aria-label={`Remove page ${page.pageNumber}`}
								title='Remove page'>
								✕
							</button>
						)}
					</li>
				))}
			</ul>
		</nav>
	);
}
