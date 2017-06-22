module.exports = (data) => {
	// Composer field for URL is 'homepage'
	author = Object.assign({}, data.author, {homepage: data.author.url});
	delete author.url;
	return `
{
	"authors": [${JSON.stringify(author)}],
	"require": {
		"timber/timber":"1.*",
		"Upstatement/routes": "*"
	}
}
`};
