/**
 * Determines if the application is running on Vercel platform
 * Checks for the presence of VERCEL environment variable
 * @returns {boolean} True if running on Vercel, false otherwise
 */
export default function getIsVercel() {
    return !!process.env.VERCEL;
}