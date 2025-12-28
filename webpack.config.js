const path = require('path');
const fs = require('fs');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

const isProduction = process.env.NODE_ENV === 'production';

// Load environment variables from .env files
function loadEnvFile() {
  const envFile = isProduction ? '.env.production' : '.env.development';
  const envPath = path.resolve(__dirname, envFile);
  const fallbackPath = path.resolve(__dirname, '.env');

  let envVars = {};

  // Try environment-specific file first, then fallback to .env
  const filesToTry = [envPath, fallbackPath];
  for (const file of filesToTry) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      content.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            envVars[key.trim()] = valueParts.join('=').trim();
          }
        }
      });
      break;
    }
  }

  return envVars;
}

const envVars = loadEnvFile();

module.exports = {
  mode: isProduction ? 'production' : 'development',
  devtool: isProduction ? false : 'cheap-module-source-map',
  entry: {
    background: './src/scripts/background.ts',
    content: './src/scripts/content.ts',
    popup: './src/scripts/popup.ts',
    'injected-wallet': './src/scripts/injected-wallet.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    fallback: {
      buffer: require.resolve('buffer/'),
      crypto: false,
      stream: false,
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            onlyCompileBundledFiles: true,
          },
        },
        exclude: [/node_modules/, /__tests__/],
      },
    ],
  },
  plugins: [
    // Define environment variables for browser context
    // Priority: CLI env vars > .env file vars > defaults
    new webpack.DefinePlugin({
      'process.env.API_BASE_URL': JSON.stringify(
        process.env.API_BASE_URL ||
          envVars.API_BASE_URL ||
          (isProduction ? 'https://api.cryptojournal.app' : 'http://localhost:3000')
      ),
      'process.env.DEBUG_LOGGING': JSON.stringify(
        process.env.DEBUG_LOGGING || envVars.DEBUG_LOGGING || (!isProduction).toString()
      ),
    }),
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/popup.html', to: 'popup.html' },
        { from: 'src/styles', to: 'styles' },
        { from: 'src/icons', to: 'icons' },
      ],
    }),
  ],
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: false,
            drop_debugger: true,
            pure_funcs: [],
          },
          mangle: true,
          output: {
            comments: false,
          },
        },
        extractComments: false,
      }),
    ],
    usedExports: true,
    sideEffects: true,
    // Disable code splitting for service worker (no document.createElement in SW context)
    splitChunks: false,
  },
  performance: {
    hints: isProduction ? 'warning' : false,
    maxAssetSize: 1024 * 1024, // 1MB - acceptable for extensions
    maxEntrypointSize: 1024 * 1024,
  },
};
