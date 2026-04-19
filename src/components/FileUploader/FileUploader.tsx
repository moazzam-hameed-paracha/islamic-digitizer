// src/components/FileUploader/FileUploader.tsx
'use client';

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react';
import styles from './FileUploader.module.scss';
import clsx from 'clsx';

interface FileUploaderProps {
	onFileSelect: (file: File) => void;
	disabled?: boolean;
}

const ACCEPTED = {
	'application/pdf': ['.pdf'],
	'image/jpeg': ['.jpg', '.jpeg'],
	'image/png': ['.png'],
	'image/webp': ['.webp'],
	'image/gif': ['.gif'],
};

const ACCEPT_STRING = Object.keys(ACCEPTED).join(',');

function isValidFile(file: File) {
	return Object.keys(ACCEPTED).includes(file.type);
}

export default function FileUploader({
	onFileSelect,
	disabled,
}: FileUploaderProps) {
	const [dragging, setDragging] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleFile = useCallback(
		(file: File) => {
			setError(null);
			if (!isValidFile(file)) {
				setError('Please upload a PDF or image file (JPEG, PNG, WebP).');
				return;
			}
			onFileSelect(file);
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
		const file = e.dataTransfer.files?.[0];
		if (file) handleFile(file);
	};

	const onChange = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) handleFile(file);
		// Reset so same file can be re-selected
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
				aria-label='Upload a file for digital conversion'
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
						{/* Geometric star pattern */}
						<polygon
							points='32,4 37,18 52,18 40,27 44,42 32,33 20,42 24,27 12,18 27,18'
							fill='none'
							stroke='currentColor'
							strokeWidth='1'
							strokeLinejoin='round'
						/>
						{/* Upload arrow */}
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
						{dragging ? 'Drop the file here' : 'Upload your file here'}
					</p>
					<p className={styles.secondaryText}>
						Or click to select from your device
					</p>
					<div className={styles.formats} dir='ltr'>
						<span className={styles.formatBadge}>PDF</span>
						<span className={styles.formatBadge}>JPEG</span>
						<span className={styles.formatBadge}>PNG</span>
						<span className={styles.formatBadge}>WebP</span>
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
