/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['dom-element-to-component-source'],
  turbopack: {
    root: __dirname,
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
}

module.exports = nextConfig
