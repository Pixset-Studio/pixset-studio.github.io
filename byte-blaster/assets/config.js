/* Site configuration — the one file to edit after deployment.
 *
 * BB_STATS_API is the address of the Byte Blaster relay server (the same one
 * the multiplayer uses). The site posts visit counts there and the admin panel
 * reads statistics from it.
 *
 * Replace the value below with YOUR Railway domain. You can see it in Railway:
 *   Settings → Networking → Public Networking → the generated domain.
 * Use https:// (not wss://) — that is the same host, just the HTTP side of it.
 *
 * Leave it as an empty string to switch the counters off entirely: the site
 * keeps working, the admin panel simply reports that the server is unreachable.
 */
window.BB_STATS_API = 'https://byte-blaster-server-production.up.railway.app';
