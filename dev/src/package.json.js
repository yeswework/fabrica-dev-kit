module.exports = (settings) => `
{
  "name": "${settings.slug}",
  "version": "0.1.0",
  "description": "${settings.title}",
  "author": ${JSON.stringify(settings.author)},
  "private": true,
  "dependencies": {
    "expose-loader": "^0.7.3",
    "jquery": "^3.1.1",
    "normalize.css": "^5.0.0"
  }
}
`;
