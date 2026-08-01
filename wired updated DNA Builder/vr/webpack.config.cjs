const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './src/main.js',
  output: {
    filename: 'dna-vr.bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    host: '0.0.0.0',
    port: 8081,
    server: 'http',
    compress: true,
    client: {
      overlay: { warnings: false, errors: true },
    },
    proxy: [
      {
        context: ['/api'],
        target: 'http://127.0.0.1:5052',
        secure: false,
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
    }),
  ],
  devtool: 'source-map',
};
