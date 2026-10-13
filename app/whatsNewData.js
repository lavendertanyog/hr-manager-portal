// What's New feed — plain-language, user-facing entries only (no internal bug/ticket
// jargon). Newest first. `id` just needs to increase; it's what "seen" is tracked against.
export const WHATS_NEW = [
  {
    id: 4,
    date: '12 Oct 2026',
    title: 'Leave approvals: Undo, MC and team-only history',
    icon: "undo",
    summary: "Undo works, View MC opens, and History shows only your team",
    chips: ['Undo works','View MC opens','Team-only history'],
    body: 'Several things on Dashboard and Approvals now work the way you’d expect.',
    points: [
      { icon: "undo", lead: "Undo", text: "on an approval or rejection puts the request back to Pending (for 10 minutes)" },
      { icon: "file", lead: "View MC Document", text: "opens the photo or PDF" },
      { icon: "calendar", lead: "Dates", text: "read like 31-Oct-2026" },
      { icon: "window", lead: "Approve, Reject and Bulk Approve", text: "ask in a proper window instead of a browser pop-up" },
      { icon: "users", lead: "History", text: "shows only your own team’s decisions, and only you or HR can change one" },
      { icon: "shield", lead: "Removing someone", text: "from your team or a project now asks you first" },
    ],
  },
  {
    id: 3,
    date: '12 Oct 2026',
    title: 'Budget requests: your projects only, and Undo',
    icon: "filter",
    summary: "Only your projects, plus Undo on budget decisions",
    chips: ['Your projects only','Undo on budget','No more Refer to AM'],
    body: 'You now see and review budget requests only for projects you manage.',
    points: [
      { icon: "filter", lead: "Dashboard and Approvals", text: "list requests for your projects only" },
      { icon: "shield", lead: "You can no longer review", text: "a request for a project you don’t manage" },
      { icon: "undo", lead: "Undo", text: "on a budget approval or rejection works for 10 minutes, and the staff member is told it was withdrawn" },
      { icon: "check", lead: "\"Refer to Account Manager\" is gone", text: "— approving passes the request on to the Account Manager" },
    ],
  },
  {
    id: 2,
    date: '12 Oct 2026',
    title: 'Company calendar and project statuses',
    icon: "calendar",
    summary: "See who is on leave, and project Deployed and Maintenance statuses",
    chips: ['Company calendar','Leave stays private','Deployed and Maintenance'],
    body: 'See who is on leave and when the public holidays are.',
    points: [
      { icon: "calendar", lead: "New Calendar page", text: "in the sidebar shows approved leave by name, in Month or List view, plus public holidays" },
      { icon: "lock", lead: "Leave type and reason", text: "stay private" },
      { icon: "folder", lead: "Projects", text: "can now be Deployed or in Maintenance, and show that status" },
    ],
  },
  {
    id: 1,
    date: '12 Oct 2026',
    title: 'Remember me on this device',
    icon: "signin",
    summary: "Stay signed in on this device for 30 days",
    chips: ['30 days','Remembered devices','Not you?'],
    body: 'Tick "Remember me on this device" when you log in and you’ll stay signed in on that browser for 30 days. Next time, the portal signs you straight in without your password. You’ll be asked to log in once after this update.',
    points: [
      { icon: "signin", lead: "Log out", text: "ends the sign-in but keeps your email filled in, partly hidden" },
      { icon: "users", lead: "Click \"Not you?\"", text: "on the login page to forget the email and use a different account" },
      { icon: "list", lead: "See and sign out", text: "your remembered devices from your Profile page" },
      { icon: "lock", lead: "Changing your password", text: "signs out your other devices" },
      { icon: "shield", lead: "Don’t tick it", text: "on a shared or public computer" },
    ],
  },
];
export const WHATS_NEW_LATEST_ID = WHATS_NEW[0].id;
export const WHATS_NEW_SEEN_KEY = 'manager_portal_whats_new_seen';

// Short summary shown in the one-time update notice after login (see UpdateNotice.js). Keep it to
// three lines and update it with each release; the full list stays in WHATS_NEW above.
export const WHATS_NEW_NOTICE = {
  portal: "Manager portal",
  highlights: [
    { icon: "undo", lead: "Undo works", text: "on leave and budget decisions, for 10 minutes" },
    { icon: "calendar", lead: "Company calendar", text: "shows who is on leave" },
    { icon: "lock", lead: "Remember me", text: "keeps you signed in for 30 days" },
  ],
};
