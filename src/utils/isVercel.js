export default function getIsVercel() {
    return !!process.env.VERCEL;
}