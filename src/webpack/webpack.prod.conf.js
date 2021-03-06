const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const merge = require('webpack-merge');
const CopyWebpackPlugin = require('copy-webpack-plugin');
// const ExtractTextPlugin = require('extract-text-webpack-plugin'); // 不支持webpack4.0
const OptimizeCSSPlugin = require('optimize-css-assets-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin'); // 替换extract-text-webpack-plugin
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const CompressionWebpackPlugin = require('compression-webpack-plugin');
const FriendlyErrorsPlugin = require('friendly-errors-webpack-plugin');
const ProgressBarPlugin = require('progress-bar-webpack-plugin');

const utils = require('./loaderUtils');
const { resolve } = require('../utils/pathUtils'); // 统一路径解析
const getJsEntries = require('../utils/jsEntries');
const entrys2htmlWebpackPlugin = require('../utils/entrys2htmlWebpackPlugin');
const { isArray } = require('../utils/typeof');
// 引入当前项目配置文件
const config = require('../config/index');
const getBaseWebpackConfig = require('./webpack.base.conf');

module.exports = () => {
  // 获取webpack基本配置
  const baseWebpackConfig = getBaseWebpackConfig();
  // 获取页面模板地址
  let curHtmlTemplate = path.resolve(__dirname, '../initData/template/index.html');
  if (config.webpack.template) {
    curHtmlTemplate = config.webpack.template; // akfun.config.js中的webpack配置
  }

  const webpackProdConfig = merge(baseWebpackConfig, {
    mode: config.build2lib.NODE_ENV, // production 模式，会启动UglifyJsPlugin服务
    output: {
      path: config.build.assetsRoot, // 输出文件的存放在本地的目录
      publicPath: config.build.assetsPublicPath, // 引用地址：配置发布到线上资源的URL前缀
      filename: utils.assetsPath('scripts/chunk/[name].[contenthash:8].js'),
      chunkFilename: utils.assetsPath('scripts/chunk/[name].[contenthash:8].js')
    },
    module: {
      rules: utils.styleLoaders({
        sourceMap: config.build.productionSourceMap,
        environment: 'prod'
      })
    },
    // devtool: '#cheap-module-eval-source-map', // 本地开发环境中的取值
    devtool: config.build.productionSourceMap ? '#source-map' : false, // 线上开发环境中的取值
    optimization: {
      splitChunks: {
        cacheGroups: {
          vendors: {
            test: /node_modules\/(.*)/,
            name: 'vendor',
            chunks: 'initial',
            reuseExistingChunk: true
          },
          common: {
            name: 'common',
            minChunks: 2,
            priority: -20,
            chunks: 'initial',
            reuseExistingChunk: true
          }
        }
      }
    },
    plugins: [
      // http://vuejs.github.io/vue-loader/en/workflow/production.html
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(config.build.NODE_ENV) // vue-router中根据此变量判断执行环境
      }),
      new MiniCssExtractPlugin({
        filename: utils.assetsPath('css/[name].[contenthash:8].css'),
        ignoreOrder: false // Enable to remove warnings about conflicting order
      }),
      // Compress extracted CSS. We are using this plugin so that possible
      // duplicated CSS from different components can be deduped.
      /**
       * 该插件可以接收以下选项（它们都是可选的）：
       * assetNameRegExp：表示应优化的资产的名称的正则表达式\最小化，默认为 /\.css$/g
       * cssProcessor：用于优化\最小化CSS的CSS处理器，默认为cssnano。
       * 这应该是cssnano.process接口之后的一个函数（接收一个CSS和options参数并返回一个Promise）。
       * cssProcessorOptions：传递给cssProcessor的选项，默认为 {}
       * canPrint：一个布尔值，指示插件是否可以将消息打印到控制台，默认为 true
       */
      new OptimizeCSSPlugin({
        cssProcessorOptions: {
          safe: true
        }
      }),
      // copy custom public assets
      new CopyWebpackPlugin({
        patterns: [
          {
            from: resolve('public'), // 从这里拷贝
            to: config.build.assetsSubDirectory // 将根目录下的public内的资源复制到指定文件夹
          }
        ]
      }),
      new FriendlyErrorsPlugin(),
      new ProgressBarPlugin()
    ]
  });

  // 集成build配置中的构建入口
  if (config.build.entry) {
    // 会覆盖config.webpack.entry的配置
    webpackProdConfig.entry = config.build.entry;
  }

  // 多页面支持能力
  let entryConfig = webpackProdConfig.entry || {}; // 获取构建入口配置
  const entryFiles = (entryConfig && Object.keys(entryConfig)) || [];

  if (
    !webpackProdConfig.entry ||
    JSON.stringify(webpackProdConfig.entry) === '{}' ||
    entryFiles.length === 0
  ) {
    // 自动从'./src/pages/'中获取入口文件
    webpackProdConfig.entry = getJsEntries();
  } else if (webpackProdConfig.entry && entryFiles.length === 1) {
    // 只有一个构建入口文件，且项目中不存在此文件
    const filename = entryFiles[0];
    let entryFilePath = entryConfig[filename];
    // 当前entryFilePath可能是一个地址字符串，也可能是一个存储多个文件地址的数组
    if (isArray(entryFilePath)) {
      // 如果是数组则自动获取最后一个文件地址
      entryFilePath = entryFilePath[entryFilePath.length - 1];
    }
    if (!fs.existsSync(entryFilePath)) {
      // 如果仅有的构建入口文件不存在，则自动从'./src/pages/'中获取入口文件
      const curJsEntries = getJsEntries();
      webpackProdConfig.entry = curJsEntries ? curJsEntries : webpackProdConfig.entry;
    } else {
      // 重新获取webpackProdConfig.entry
      entryConfig = webpackProdConfig.entry || {};
      const htmlWebpackPluginList = entrys2htmlWebpackPlugin(entryConfig, curHtmlTemplate);
      htmlWebpackPluginList.forEach((htmlWebpackPlugin) => {
        webpackProdConfig.plugins.push(htmlWebpackPlugin);
      });
    }
  } else {
    // 使用用户自定义的多入口配置，生产对应的多页面多模板
    const htmlWebpackPluginList = entrys2htmlWebpackPlugin(entryConfig, curHtmlTemplate);
    htmlWebpackPluginList.forEach((htmlWebpackPlugin) => {
      webpackProdConfig.plugins.push(htmlWebpackPlugin);
    });
  }

  // 是否要进行压缩工作
  if (config.build.productionGzip) {
    webpackProdConfig.plugins.push(
      new CompressionWebpackPlugin({
        test: new RegExp(`\\.(${config.build.productionGzipExtensions.join('|')})$`),
        filename: '[path].gz[query]',
        algorithm: 'gzip',
        threshold: 240,
        minRatio: 0.8
      })
    );
  }

  if (config.build.bundleAnalyzerReport) {
    webpackProdConfig.plugins.push(new BundleAnalyzerPlugin());
  }

  return webpackProdConfig;
};
