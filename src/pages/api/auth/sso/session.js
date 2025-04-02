export default function handler(req, res) {
    const sessionCookie = req.cookies.user_session;
  
    if (!sessionCookie) {
      return res.status(401).json({ user: null });
    }
  
    const user = JSON.parse(sessionCookie);
    res.status(200).json({ user });
}