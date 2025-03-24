const production = false;
let appendPath;

if (production)
    appendPath = '/marketplace';
else
    appendPath = '';

export { appendPath };