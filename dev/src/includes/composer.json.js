module.exports = (settings) => {
	// Composer field for URL is 'homepage'
	author = Object.assign({}, settings.author, {homepage: settings.author.url});
	delete author.url;
	return `
{
	"authors": [${JSON.stringify(author)}],
	"require": {
		"timber/timber":"1.*",
		"upstatement/routes": "*"
	}
}
`};
