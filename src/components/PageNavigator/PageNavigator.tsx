// src/components/PageNavigator/PageNavigator.tsx
'use client';

import { useState, useRef, useCallback, ChangeEvent } from 'react';
import { PageResult } from '@/types';
import styles from './PageNavigator.module.scss';
import clsx from 'clsx';

interface PageNavigatorProps {
	pages: PageResult[];
	selectedPage: number;
	onSelectPage: (page: number) => void;
	onRemovePage?: (page: number) => void;
	onReorderPage?: (fromIndex: number, toIndex: number) => void;
	onInsertPages?: (files: File | File[], afterPageNumber: number) => void;
	isProcessing?: boolean;
}

type SidebarTab = 'pages' | 'insert';

const PDF_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PDF !== 'false';
const ACCEPT_STRING = [
	...(PDF_ENABLED ? ['application/pdf'] : []),
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
].join(',');

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
	onReorderPage,
	onInsertPages,
	isProcessing,
}: PageNavigatorProps) {
	const [activeTab, setActiveTab] = useState<SidebarTab>('pages');

	// ── Drag & Drop state ─────────────────────────────────────────────────────
	const draggedIndexRef = useRef<number | null>(null);
	const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

	const handleDragStart = useCallback((index: number) => {
		draggedIndexRef.current = index;
	}, []);

	const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
		e.preventDefault();
		if (draggedIndexRef.current !== null && draggedIndexRef.current !== index) {
			setDragOverIndex(index);
		}
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent, toIndex: number) => {
			e.preventDefault();
			const fromIndex = draggedIndexRef.current;
			if (fromIndex !== null && fromIndex !== toIndex && onReorderPage) {
				onReorderPage(fromIndex, toIndex);
			}
			draggedIndexRef.current = null;
			setDragOverIndex(null);
		},
		[onReorderPage],
	);

	const handleDragEnd = useCallback(() => {
		draggedIndexRef.current = null;
		setDragOverIndex(null);
	}, []);

	// ── Insert panel state ────────────────────────────────────────────────────
	const [insertPosition, setInsertPosition] = useState<number>(pages.length); // default: at end
	const insertInputRef = useRef<HTMLInputElement>(null);

	const handleInsertFileChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			if (!e.target.files?.length || !onInsertPages) return;
			const files = Array.from(e.target.files);
			const resolved: File | File[] = files.length === 1 ? files[0] : files;
			onInsertPages(resolved, insertPosition);
			e.target.value = '';
			setActiveTab('pages');
		},
		[onInsertPages, insertPosition],
	);

	// ── Render ────────────────────────────────────────────────────────────────
	return (
		<nav className={styles.nav} aria-label='Page navigation'>
			{/* Tab switcher */}
			<div className={styles.tabBar}>
				<button
					className={clsx(styles.tabBtn, {
						[styles.activeTabBtn]: activeTab === 'pages',
					})}
					onClick={() => setActiveTab('pages')}
					aria-selected={activeTab === 'pages'}>
					Pages
				</button>
				{!isProcessing && onInsertPages && (
					<button
						className={clsx(styles.tabBtn, {
							[styles.activeTabBtn]: activeTab === 'insert',
						})}
						onClick={() => setActiveTab('insert')}
						aria-selected={activeTab === 'insert'}>
						+ Insert
					</button>
				)}
			</div>

			{/* ── Pages tab ─────────────────────────────────────────────────── */}
			{activeTab === 'pages' && (
				<ul className={styles.list} role='list'>
					{pages.map((page, index) => (
						<li
							key={page.pageNumber}
							className={clsx(styles.item, {
								[styles.dragOver]: dragOverIndex === index,
								[styles.dragging]: draggedIndexRef.current === index,
							})}
							draggable={!isProcessing && !!onReorderPage}
							onDragStart={() => handleDragStart(index)}
							onDragOver={(e) => handleDragOver(e, index)}
							onDrop={(e) => handleDrop(e, index)}
							onDragEnd={handleDragEnd}>
							{/* Remove page button */}
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

							{/* Page button */}
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
							</button>

							{/* Drag handle */}
							{!isProcessing && onReorderPage && (
								<span className={styles.dragHandle} aria-hidden='true'>
									⠿
								</span>
							)}
						</li>
					))}
				</ul>
			)}

			{/* ── Insert tab ─────────────────────────────────────────────────── */}
			{activeTab === 'insert' && (
				<div className={styles.insertPanel}>
					<p className={styles.insertHeading}>Insert Pages</p>

					<label className={styles.insertLabel}>Position</label>
					<select
						className={styles.insertSelect}
						value={insertPosition}
						onChange={(e) => setInsertPosition(Number(e.target.value))}>
						<option value={0}>At the beginning</option>
						{pages.map((p) => (
							<option key={p.pageNumber} value={p.pageNumber}>
								After page {p.pageNumber}
							</option>
						))}
					</select>

					<label className={styles.insertLabel}>File</label>
					<p className={styles.insertHint}>
						Select one or more images{PDF_ENABLED ? ', or a PDF' : ''} to
						insert.
					</p>

					<input
						ref={insertInputRef}
						type='file'
						accept={ACCEPT_STRING}
						multiple
						className={styles.hiddenInput}
						onChange={handleInsertFileChange}
					/>

					<button
						className={styles.insertBtn}
						onClick={() => insertInputRef.current?.click()}>
						Choose file(s) &amp; insert
					</button>

					<button
						className={styles.insertCancelBtn}
						onClick={() => setActiveTab('pages')}>
						Cancel
					</button>
				</div>
			)}
		</nav>
	);
}
