module.exports = {
	mode: 'development',
	module: {
		rules: [{
			use: {
				loader: 'babel-loader',
				options: {
					presets: ['@babel/preset-env'],
					plugins: [
						["transform-react-jsx", {
							pragma: "wp.element.createElement"
						}]
					]
				}
			}
		}]
	}
};
