// middleware/sameDayCheck.js

/**
 * Get current server date in YYYY-MM-DD format based on local/IST or system timezone.
 */
function getServerToday() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Middleware that strictly enforces same-day editing rule for dealers.
 * - If user is admin: Can modify any date (admin override).
 * - If user is dealer: Can ONLY modify today's date.
 */
function enforceSameDayForDealers(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    return next();
  }

  const requestedDate = req.params.date || req.body.date || req.query.date;
  const serverToday = getServerToday();

  if (!requestedDate) {
    return res.status(400).json({ error: 'Date parameter is required' });
  }

  if (requestedDate !== serverToday) {
    return res.status(403).json({
      error: `Edit lock active: Dealers can only edit entries for today (${serverToday}). Historical reports for ${requestedDate} are view-only.`,
      serverToday,
      requestedDate,
      isReadOnly: true
    });
  }

  next();
}

module.exports = {
  getServerToday,
  enforceSameDayForDealers
};
