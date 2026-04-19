import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	// Webpack config for standard builds
	webpack: (config) => {
		config.resolve.alias = {
			...config.resolve.alias,
			canvas: false,
		};
		return config;
	},

	// New stable Turbopack configuration
	turbopack: {
		resolveAlias: {
			canvas: "false",
		},
	},
};

export default nextConfig;
