module.exports = (data) => {
	// Composer field for URL is 'homepage'
	data = Object.assign({}, data, {homepage: data.author.url});
	delete data.author.url;
	return `
{
	"authors": [${JSON.stringify(data.author)}],
	"require": {
		"timber/timber":"1.*",
		"Upstatement/routes": "*"
	}
}
`};
