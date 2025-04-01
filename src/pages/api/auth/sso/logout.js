export default function handler(req, res) {
    res.setHeader("Set-Cookie", "user_session=; Max-Age=0; path=/");
    res.redirect("/");
}