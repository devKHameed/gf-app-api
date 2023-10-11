const path = require("path");
const slsw = require("serverless-webpack");

module.exports = {
  mode: slsw.lib.webpack.isLocal ? "development" : "production",
  devtool: slsw.lib.webpack.isLocal && "source-map",
  entry: slsw.lib.entries,
  stats: "minimal",
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
  },
  target: "node",
  module: {
    rules: [
      {
        test: /\.(tsx?)$/,
        loader: "ts-loader",
        options: { transpileOnly: true },
        exclude: [
          [
            path.resolve(__dirname, "./node_modules"),
            path.resolve(__dirname, ".serverless"),
            path.resolve(__dirname, ".husky"),
            path.resolve(__dirname, ".webpack"),
            path.resolve(__dirname, ".docs"),
            path.resolve(__dirname, ".resources"),
          ],
        ],
      },
    ],
  },
};
