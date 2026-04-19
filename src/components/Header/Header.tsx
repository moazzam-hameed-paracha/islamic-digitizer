// src/components/Header/Header.tsx
'use client';

import styles from './Header.module.scss';

export default function Header() {
	return (
		<header className={styles.header}>
			<div className={styles.ornamentTop} aria-hidden='true'>
				<svg
					viewBox='0 0 800 24'
					fill='none'
					xmlns='http://www.w3.org/2000/svg'>
					<line
						x1='0'
						y1='12'
						x2='340'
						y2='12'
						stroke='currentColor'
						strokeWidth='0.5'
					/>
					<path d='M340 12 L360 4 L370 12 L360 20 Z' fill='currentColor' />
					<circle
						cx='400'
						cy='12'
						r='8'
						fill='none'
						stroke='currentColor'
						strokeWidth='0.75'
					/>
					<circle cx='400' cy='12' r='3' fill='currentColor' />
					<path d='M430 12 L440 4 L460 12 L440 20 Z' fill='currentColor' />
					<line
						x1='460'
						y1='12'
						x2='800'
						y2='12'
						stroke='currentColor'
						strokeWidth='0.5'
					/>
				</svg>
			</div>

			<div className={styles.inner}>
				<div className={styles.logoGroup}>
					<span className={styles.arabicTitle}>مرقمن</span>
					<div className={styles.englishGroup}>
						<span className={styles.englishTitle}>
							Islamic Manuscript Digitizer
						</span>
						{/* <span className={styles.tagline}>
							Powered by Qari-OCR-0.1-VL-2B · Local Arabic Vision Model
						</span> */}
					</div>
				</div>
			</div>

			<div className={styles.ornamentBottom} aria-hidden='true'>
				<svg viewBox='0 0 800 8' fill='none' xmlns='http://www.w3.org/2000/svg'>
					<line
						x1='0'
						y1='4'
						x2='800'
						y2='4'
						stroke='currentColor'
						strokeWidth='0.5'
					/>
				</svg>
			</div>
		</header>
	);
}
