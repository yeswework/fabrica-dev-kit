module.exports = (data) => `
{
  "name": "${data.slug}",
  "version": "0.1.0",
  "description": "${data.title}",
  "author": ${JSON.stringify(data.author)},
  "private": true,
  "dependencies": {
    "expose-loader": "^0.7.3",
    "jquery": "^3.1.1",
    "normalize.css": "^5.0.0"
  }
}
`;
