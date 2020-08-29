const path = require("path");

module.exports = {
    entry: "./frontend/index.js",
    output: {
        library: 'gib_el_docker',
        filename: "bundle.js",
        path: path.resolve(__dirname, "static")
    },
    module: {
        rules: [
            {
                test: /\.jsx?/,
                include: path.resolve(__dirname, "frontend"),
                loader: "babel-loader",
            },
            {
                test: /\.(jpe?g|png|gif|svg)$/i,
                loader: "file-loader",
                options: {
                    name: "[name].[ext]",
                    outputPath: "img/",
                    publicPath: "static/img/"
                }
            },
            {
                test: /\.(ttf)$/i,
                loader: "file-loader",
                options: {
                    name: "[name].[ext]",
                    outputPath: "font/",
                    publicPath: "static/font/"
                }
            },
            {
                test: /\.(scss|sass)$/,
                loaders: ["style-loader", "css-loader", "sass-loader"]
            },
            {
                test: /\.css$/,
                loaders: ["style-loader", "css-loader"]
            }
        ]
    }
}