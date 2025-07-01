const TerserPlugin = require('terser-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

module.exports = (config) => {
  // Production optimizations
  config.mode = 'production';
  
  // Disable source maps in production
  config.devtool = false;
  
  // Optimization settings
  config.optimization = {
    ...config.optimization,
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true,
            drop_debugger: true,
            pure_funcs: ['console.log', 'console.debug'],
          },
          mangle: true,
          format: {
            comments: false,
          },
        },
        extractComments: false,
      }),
    ],
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10,
        },
        common: {
          minChunks: 2,
          priority: 5,
          reuseExistingChunk: true,
        },
      },
    },
  };
  
  // Add bundle analyzer in analyze mode only
  if (process.env.ANALYZE === 'true') {
    config.plugins.push(
      new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        reportFilename: 'bundle-report.html',
        openAnalyzer: false,
      }),
    );
  }
  
  // Exclude test files and unnecessary files from bundle
  config.module.rules.push({
    test: /\.(spec|test|e2e)\.ts$/,
    loader: 'null-loader',
  });
  
  // External dependencies that should not be bundled
  config.externals = {
    ...config.externals,
    'puppeteer': 'puppeteer',
    'whatsapp-web.js': 'whatsapp-web.js',
  };
  
  return config;
};