// Polyfill global Request for Next.js server code in Jest
global.Request = global.Request || class Request { constructor() {} };
