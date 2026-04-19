// src/components/FileUploader/FileUploader.tsx
'use client';

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react';
import styles from './FileUploader.module.scss';
import clsx from 'clsx';

interface FileUploaderProps {
	onFileSelect: (files: File | File[]) => void;
	disabled?: boolean;
}

const PDF_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PDF !== 'false';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const ACCEPTED: Record<string, string[]> = {
	...(PDF_ENABLED ? { 'application/pdf': ['.pdf'] } : {}),
	'image/jpeg': ['.jpg', '.jpeg'],
	'image/png': ['.png'],
	'image/webp': ['.webp'],
	'image/gif': ['.gif'],
};

const ACCEPT_STRING = Object.keys(ACCEPTED).join(',');

function isValidFile(file: File) {
	return Object.keys(ACCEPTED).includes(file.type);
}

// Given a FileList, returns either a single PDF, all valid images, or null.
function resolveFiles(fileList: FileList): File | File[] | null {
	const files = Array.from(fileList).filter(isValidFile);
	if (files.length === 0) return null;

	// If any PDF is included, just take the first PDF (multi-PDF not supported)
	const pdf = files.find((f) => f.type === 'application/pdf');
	if (pdf) return pdf;

	// All images — return the full array
	return files.length === 1 ? files[0] : files;
}

export default function FileUploader({
	onFileSelect,
	disabled,
}: FileUploaderProps) {
	const [dragging, setDragging] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleFiles = useCallback(
		(fileList: FileList) => {
			setError(null);
			const resolved = resolveFiles(fileList);
			if (!resolved) {
				setError(
					PDF_ENABLED
						? 'Please upload a PDF or image file (JPEG, PNG, WebP).'
						: 'Please upload an image file (JPEG, PNG, WebP).',
				);
				return;
			}
			onFileSelect(resolved);
		},
		[onFileSelect],
	);

	const onDragOver = (e: DragEvent) => {
		e.preventDefault();
		if (!disabled) setDragging(true);
	};

	const onDragLeave = () => setDragging(false);

	const onDrop = (e: DragEvent) => {
		e.preventDefault();
		setDragging(false);
		if (disabled) return;
		if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
	};

	const onChange = (e: ChangeEvent<HTMLInputElement>) => {
		if (e.target.files?.length) handleFiles(e.target.files);
		e.target.value = '';
	};

	return (
		<section className={styles.wrapper}>
			{/* Geometric corner decorations */}
			<div className={styles.cornerTL} aria-hidden='true' />
			<div className={styles.cornerTR} aria-hidden='true' />
			<div className={styles.cornerBL} aria-hidden='true' />
			<div className={styles.cornerBR} aria-hidden='true' />

			<div
				className={clsx(styles.dropzone, {
					[styles.dragging]: dragging,
					[styles.disabled]: disabled,
				})}
				onDragOver={onDragOver}
				onDragLeave={onDragLeave}
				onDrop={onDrop}
				onClick={() => !disabled && inputRef.current?.click()}
				role='button'
				tabIndex={disabled ? -1 : 0}
				aria-label='Upload files for digital conversion'
				onKeyDown={(e) => {
					if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
						e.preventDefault();
						inputRef.current?.click();
					}
				}}>
				<input
					ref={inputRef}
					type='file'
					accept={ACCEPT_STRING}
					multiple
					onChange={onChange}
					className={styles.hiddenInput}
					disabled={disabled}
					aria-hidden='true'
				/>

				<div className={styles.iconWrap} aria-hidden='true'>
					<svg
						viewBox='0 0 64 64'
						fill='none'
						xmlns='http://www.w3.org/2000/svg'>
						<polygon
							points='32,4 37,18 52,18 40,27 44,42 32,33 20,42 24,27 12,18 27,18'
							fill='none'
							stroke='currentColor'
							strokeWidth='1'
							strokeLinejoin='round'
						/>
						<path
							d='M32 54 L32 34 M24 42 L32 34 L40 42'
							stroke='currentColor'
							strokeWidth='1.5'
							strokeLinecap='round'
							strokeLinejoin='round'
						/>
					</svg>
				</div>

				<div className={styles.textGroup}>
					<p className={styles.primaryText}>
						{dragging ? 'Drop the files here' : 'Upload your files here'}
					</p>
					<p className={styles.secondaryText}>
						Or click to select — multiple images supported
					</p>
					<div className={styles.formats} dir='ltr'>
						{PDF_ENABLED && <span className={styles.formatBadge}>PDF</span>}
						<span className={styles.formatBadge}>JPEG</span>
						<span className={styles.formatBadge}>PNG</span>
						<span className={styles.formatBadge}>WebP</span>
						<span className={styles.formatBadge}>multiple ✦</span>
					</div>
				</div>
			</div>

			{error && (
				<p className={styles.error} role='alert'>
					{error}
				</p>
			)}
		</section>
	);
}
