// The coach's own domain, for building links in emails/push notifications
// sent from contexts with no incoming request to read an origin from (a
// cron job, the Drive sync job) - VERCEL_PROJECT_PRODUCTION_URL is set
// automatically by Vercel and always reflects the current production
// domain (the shortest custom domain if one's attached, else the
// project's *.vercel.app one), so it stays correct through a future
// domain change with no code update needed.
export function getAppBaseUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}
