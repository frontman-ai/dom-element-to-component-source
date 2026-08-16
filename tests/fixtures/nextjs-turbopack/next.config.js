const path = require("path")
const packageRoot = path.resolve(__dirname, '../../..')

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['source-map'],
  turbopack: {
    root: packageRoot,
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
}

module.exports = nextConfig
